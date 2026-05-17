import React, { useRef, useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type TimelineLabels,
  type SwimLane,
  type SwimLaneEventInfo,
  defaultTheme,
  toJulianDate,
  TICK_AREA_HEIGHT,
} from '@kteneyck/cesium-timeline-core';
import { TimelineControls } from './components/TimelineControls';
import { TimelineCanvas, TimelineCanvasHandle } from './components/TimelineCanvas';

// Re-export so consumers only need @kteneyck/cesium-timeline-react
export type { TimelineCanvasHandle };
export { TICK_AREA_HEIGHT };

const DEFAULT_FF_SPEEDS = [2, 4, 8, 16, 32, 100, 1];
const DEFAULT_RW_SPEEDS = [1, 2, 4, 8, 16, 32, 100];

export interface TimelineProps {
  startTime?: Cesium.JulianDate | Date;
  endTime?: Cesium.JulianDate | Date;
  currentTime?: Cesium.JulianDate | Date;
  clock?: Cesium.Clock;
  onTimeChange?: (time: Cesium.JulianDate) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  onMultiplierChange?: (multiplier: number) => void;
  height?: number;
  showControls?: boolean;
  showJumpToStart?: boolean;
  showJumpToEnd?: boolean;
  enableDrag?: boolean;
  dateTimeFormat?: string;
  onDateTimeClick?: () => void;
  jumpToTime?: Cesium.JulianDate | Date;
  maxTicks?: number;
  ffSpeeds?: number[];
  rwSpeeds?: number[];
  theme?: Partial<TimelineTheme>;
  className?: string;
  /** @see TimelineBaseProps.timezone */
  timezone?: string;
  swimLanes?: SwimLane[];
  showSwimLanes?: boolean;
  onShowSwimLanesChange?: (visible: boolean) => void;
  swimLaneTransition?: 'animated' | 'instant';
  onSwimLaneItemClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneItemHover?: (info: SwimLaneEventInfo | null) => void;
  onSwimLaneItemDoubleClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneItemContextMenu?: (info: SwimLaneEventInfo) => void;
  onSwimLaneReorder?: (orderedLaneIds: string[]) => void;
  /**
   * Overrides for control-bar labels and tooltips.
   * Useful for localisation or custom verbiage — provide only the strings you
   * want to change; everything else falls back to the English defaults.
   */
  labels?: Partial<TimelineLabels>;
}

export const Timeline: React.FC<TimelineProps> = ({
  startTime: providedStart,
  endTime: providedEnd,
  currentTime: initialTime,
  clock,
  onTimeChange,
  onPlayPause,
  onMultiplierChange,
  height,
  showControls = true,
  showJumpToStart,
  showJumpToEnd,
  enableDrag = true,
  dateTimeFormat,
  onDateTimeClick,
  jumpToTime,
  maxTicks,
  ffSpeeds = DEFAULT_FF_SPEEDS,
  rwSpeeds = DEFAULT_RW_SPEEDS,
  theme: customTheme,
  className,
  timezone,
  swimLanes,
  showSwimLanes,
  onShowSwimLanesChange,
  swimLaneTransition = 'animated',
  onSwimLaneItemClick,
  onSwimLaneItemHover,
  onSwimLaneItemDoubleClick,
  onSwimLaneItemContextMenu,
  onSwimLaneReorder,
  labels,
}) => {
  const now = () => Date.now();
  const defaultStartMs = providedStart
    ? Cesium.JulianDate.toDate(toJulianDate(providedStart)).getTime()
    : now() - 12 * 3600 * 1000;
  const defaultEndMs = providedEnd
    ? Cesium.JulianDate.toDate(toJulianDate(providedEnd)).getTime()
    : now() + 12 * 3600 * 1000;

  const [currentTime, setCurrentTime] = useState<Cesium.JulianDate>(() =>
    toJulianDate(initialTime ?? (providedStart ?? Cesium.JulianDate.fromDate(new Date())))
  );
  const [isPlaying, setIsPlaying] = useState(clock?.shouldAnimate ?? false);
  const [multiplier, setMultiplier] = useState(clock?.multiplier ?? 1);

  const [swimLanesExpanded, setSwimLanesExpanded] = useState(showSwimLanes ?? true);

  useEffect(() => {
    if (showSwimLanes != null) setSwimLanesExpanded(showSwimLanes);
  }, [showSwimLanes]);

  const handleToggleSwimLanes = () => {
    const next = !swimLanesExpanded;
    setSwimLanesExpanded(next);
    onShowSwimLanesChange?.(next);
  };

  const hasSwimLanes = swimLanes != null && swimLanes.length > 0;

  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setControlsHeight(entry.borderBoxSize[0].blockSize));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showControls]);

  const isCollapsed = hasSwimLanes && !swimLanesExpanded;
  const heightStyle: string = isCollapsed
    ? `${controlsHeight + TICK_AREA_HEIGHT}px`
    : height != null
      ? `${height}px`
      : '100%';

  const isDraggingRef = useRef(false);
  const canvasRef = useRef<TimelineCanvasHandle>(null);
  const finalTheme = { ...defaultTheme, ...customTheme };

  // ── Cesium clock sync ──
  useEffect(() => {
    if (!clock) return;
    const onTick = () => {
      if (!isDraggingRef.current) {
        const ct = Cesium.JulianDate.clone(clock.currentTime);
        setCurrentTime(ct);
        setIsPlaying(clock.shouldAnimate);
        setMultiplier(clock.multiplier);

        if (canvasRef.current) {
          const { startMs, endMs } = canvasRef.current.getVisibleRange();
          const span = endMs - startMs;
          const ctMs = Cesium.JulianDate.toDate(ct).getTime();
          const pos = ctMs - startMs;
          if (pos <= span * 0.1) {
            canvasRef.current.zoomTo(ctMs - span * 0.1, ctMs + span * 0.9, ctMs);
          } else if (pos >= span * 0.9) {
            canvasRef.current.zoomTo(ctMs - span * 0.9, ctMs + span * 0.1, ctMs);
          }
        }
      }
    };
    clock.onTick.addEventListener(onTick);
    return () => { clock.onTick.removeEventListener(onTick); };
  }, [clock]);

  // ── Fallback: real-time tick when no clock ──
  useEffect(() => {
    if (clock) return;
    const id = setInterval(() => {
      if (isDraggingRef.current) return;
      const ct = Cesium.JulianDate.fromDate(new Date());
      setCurrentTime(ct);
      if (canvasRef.current) {
        const { startMs, endMs } = canvasRef.current.getVisibleRange();
        const span = endMs - startMs;
        const ctMs = Cesium.JulianDate.toDate(ct).getTime();
        const pos = ctMs - startMs;
        if (pos <= span * 0.1) canvasRef.current.zoomTo(ctMs - span * 0.1, ctMs + span * 0.9, ctMs);
        else if (pos >= span * 0.9) canvasRef.current.zoomTo(ctMs - span * 0.9, ctMs + span * 0.1, ctMs);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clock]);

  // ── jumpToTime prop ──
  useEffect(() => {
    if (!jumpToTime) return;
    const t = toJulianDate(jumpToTime);
    handleTimeChange(t);
    if (canvasRef.current) {
      const { startMs, endMs } = canvasRef.current.getVisibleRange();
      const span = endMs - startMs;
      const newMs = Cesium.JulianDate.toDate(t).getTime();
      canvasRef.current.zoomTo(newMs - span / 2, newMs + span / 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToTime]);

  // ── Helpers ──
  const applyMultiplier = (m: number, play = true) => {
    if (clock) { clock.multiplier = m; if (play) clock.shouldAnimate = true; }
    setMultiplier(m);
    if (play) setIsPlaying(true);
    onMultiplierChange?.(m);
  };

  const handleTimeChange = (t: Cesium.JulianDate) => {
    setCurrentTime(t);
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    onTimeChange?.(t);
  };

  const handlePlayPause = (playing: boolean) => {
    if (playing && multiplier < 0) {
      applyMultiplier(1, false);
    }
    if (clock) clock.shouldAnimate = playing;
    setIsPlaying(playing);
    onPlayPause?.(playing);
  };

  const handleFastForward = () => {
    const speeds = ffSpeeds.length > 0 ? ffSpeeds : DEFAULT_FF_SPEEDS;
    const cur = multiplier > 1 ? multiplier : 1;
    const idx = speeds.indexOf(cur);
    const next = speeds[idx < 0 || idx === speeds.length - 1 ? 0 : idx + 1];
    applyMultiplier(next);
  };

  const handleRewindSpeed = () => {
    const speeds = rwSpeeds.length > 0 ? rwSpeeds : DEFAULT_RW_SPEEDS;
    const curAbs = multiplier < 0 ? Math.abs(multiplier) : 0;
    const idx = speeds.indexOf(curAbs);
    const next = -(speeds[idx < 0 || idx === speeds.length - 1 ? 0 : idx + 1]);
    applyMultiplier(next);
  };

  const handleJumpToStart = () => {
    const t = toJulianDate(providedStart ?? Cesium.JulianDate.fromDate(new Date(defaultStartMs)));
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    canvasRef.current?.zoomTo(defaultStartMs, defaultEndMs);
  };

  const handleJumpToEnd = () => {
    const t = toJulianDate(providedEnd ?? Cesium.JulianDate.fromDate(new Date(defaultEndMs)));
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    canvasRef.current?.zoomTo(defaultStartMs, defaultEndMs);
  };

  const handleJumpToLive = () => {
    const t = Cesium.JulianDate.fromDate(new Date());
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    applyMultiplier(1);
    const nowMs = Date.now();
    if (canvasRef.current) {
      const { startMs, endMs } = canvasRef.current.getVisibleRange();
      const span = endMs - startMs;
      canvasRef.current.zoomTo(nowMs - span / 2, nowMs + span / 2);
    }
  };

  const isLive = Math.abs(Cesium.JulianDate.toDate(currentTime).getTime() - Date.now()) < 10_000;

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: heightStyle,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: swimLaneTransition === 'animated' ? 'height 0.2s ease' : undefined,
      }}
    >
      {showControls && (
        <div ref={controlsRef}>
          <TimelineControls
            currentTime={currentTime}
            isPlaying={isPlaying}
            multiplier={multiplier}
            isLive={isLive}
            hasStartTime={providedStart != null}
            hasEndTime={providedEnd != null}
            showJumpToStart={showJumpToStart}
            showJumpToEnd={showJumpToEnd}
            onPlayPause={handlePlayPause}
            onJumpToStart={handleJumpToStart}
            onRewind={handleRewindSpeed}
            onFastForward={handleFastForward}
            onJumpToEnd={handleJumpToEnd}
            onJumpToLive={handleJumpToLive}
            onResetSpeed={() => applyMultiplier(1)}
            onDateTimeClick={onDateTimeClick}
            dateTimeFormat={dateTimeFormat}
            timezone={timezone}
            theme={finalTheme}
            swimLanesVisible={hasSwimLanes ? swimLanesExpanded : undefined}
            onToggleSwimLanes={hasSwimLanes ? handleToggleSwimLanes : undefined}
            labels={labels}
          />
        </div>
      )}

      {enableDrag !== false && (
        <TimelineCanvas
          ref={canvasRef}
          currentTime={currentTime}
          defaultStartMs={defaultStartMs}
          defaultEndMs={defaultEndMs}
          theme={finalTheme}
          maxTicks={maxTicks}
          timezone={timezone}
          dateTimeFormat={dateTimeFormat}
          months={labels?.months}
          onTimeChange={handleTimeChange}
          onDragStart={() => { isDraggingRef.current = true; }}
          onDragEnd={() => { isDraggingRef.current = false; }}
          swimLanes={swimLanes}
          showSwimLanes={swimLanesExpanded}
          onSwimLaneItemClick={onSwimLaneItemClick}
          onSwimLaneItemHover={onSwimLaneItemHover}
          onSwimLaneItemDoubleClick={onSwimLaneItemDoubleClick}
          onSwimLaneItemContextMenu={onSwimLaneItemContextMenu}
          onSwimLaneReorder={onSwimLaneReorder}
        />
      )}
    </div>
  );
};

export default Timeline;
