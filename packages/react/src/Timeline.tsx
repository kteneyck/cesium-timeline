import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useMemo } from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type TimelineLabels,
  type SwimLane,
  type SwimLaneEventInfo,
  type SwimLaneDragInfo,
  type SwimLaneDragEndInfo,
  type VisibleRange,
  defaultTheme,
  toJulianDate,
  TICK_AREA_HEIGHT,
  clampMsToLimits,
  resolveVisibleRange,
} from '@kteneyck/cesium-timeline-core';
import { TimelineControls } from './components/TimelineControls';
import { TimelineCanvas, TimelineCanvasHandle } from './components/TimelineCanvas';

// Re-export so consumers only need @kteneyck/cesium-timeline-react
export type { TimelineCanvasHandle };
export { TICK_AREA_HEIGHT };

/**
 * Imperative handle exposed by `<Timeline ref={…}>`.
 */
export interface TimelineHandle {
  /**
   * Zoom/pan the visible window to [start, end]. The same rules as
   * `initialVisibleRange` apply: the span is clamped to the min/max zoom,
   * clipped to the limits when `restrictToRange` is set, and the call is
   * ignored when the range has no width or does not overlap the limits.
   * Playhead auto-follow pauses while the playhead is outside the new window.
   */
  zoomTo(start: Cesium.JulianDate | Date, end: Cesium.JulianDate | Date): void;
  /** The currently visible window. */
  getVisibleRange(): { start: Cesium.JulianDate; end: Cesium.JulianDate };
  /** @see TimelineCanvasHandle.appendSwimLane */
  appendSwimLane(lane: SwimLane): void;
  /** @see TimelineCanvasHandle.updateSwimLane */
  updateSwimLane(id: string, updates: Partial<SwimLane>): void;
  /** @see TimelineCanvasHandle.removeSwimLane */
  removeSwimLane(id: string): void;
  /** @see TimelineCanvasHandle.reorderSwimLanes */
  reorderSwimLanes(orderedIds: string[]): void;
}

const toMs = (t: Cesium.JulianDate | Date): number =>
  t instanceof Date ? t.getTime() : Cesium.JulianDate.toDate(t).getTime();

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
  /** @see TimelineBaseProps.minSpeed */
  minSpeed?: number;
  /** @see TimelineBaseProps.maxSpeed */
  maxSpeed?: number;
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
  /** @see TimelineBaseProps.onSwimLaneItemDragStart */
  onSwimLaneItemDragStart?: (info: SwimLaneEventInfo) => boolean | void;
  /** @see TimelineBaseProps.onSwimLaneItemDrag */
  onSwimLaneItemDrag?: (info: SwimLaneDragInfo) => number | void;
  /** @see TimelineBaseProps.onSwimLaneItemDragEnd */
  onSwimLaneItemDragEnd?: (info: SwimLaneDragEndInfo) => void;
  onRangeSelect?: (start: Cesium.JulianDate, end: Cesium.JulianDate) => void;
  /**
   * Overrides for control-bar labels and tooltips.
   * Useful for localisation or custom verbiage — provide only the strings you
   * want to change; everything else falls back to the English defaults.
   */
  labels?: Partial<TimelineLabels>;
  /** @see TimelineBaseProps.liveButtonSize */
  liveButtonSize?: 'sm' | 'md' | 'lg';
  /** @see TimelineBaseProps.liveButtonPosition */
  liveButtonPosition?: 'left' | 'right';
  /** @see TimelineBaseProps.showLive */
  showLive?: boolean;
  /** @see TimelineBaseProps.live */
  live?: boolean;
  /** @see TimelineBaseProps.invertScrollZoom */
  invertScrollZoom?: boolean;
  /** @see TimelineBaseProps.restrictToRange */
  restrictToRange?: boolean;
  /** @see TimelineBaseProps.initialVisibleRange */
  initialVisibleRange?: VisibleRange;
}

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(({
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
  minSpeed = 1,
  maxSpeed = 100,
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
  onSwimLaneItemDragStart,
  onSwimLaneItemDrag,
  onSwimLaneItemDragEnd,
  onRangeSelect,
  labels,
  liveButtonSize,
  liveButtonPosition,
  showLive,
  live,
  invertScrollZoom,
  restrictToRange,
  initialVisibleRange,
}, ref) => {
  const now = () => Date.now();
  const defaultStartMs = useMemo(
    () => providedStart
      ? Cesium.JulianDate.toDate(toJulianDate(providedStart)).getTime()
      : now() - 12 * 3600 * 1000,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providedStart],
  );
  const defaultEndMs = useMemo(
    () => providedEnd
      ? Cesium.JulianDate.toDate(toJulianDate(providedEnd)).getTime()
      : now() + 12 * 3600 * 1000,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providedEnd],
  );

  // Hard bounds for the needle (current time) when `restrictToRange` is set —
  // only meaningful (and only defined) when the corresponding prop was given.
  const limitStartMs = providedStart != null ? defaultStartMs : undefined;
  const limitEndMs   = providedEnd   != null ? defaultEndMs   : undefined;

  // Read via refs inside the clock-tick effects below so those effects don't
  // need to resubscribe (and potentially miss a tick) every time these change.
  const restrictToRangeRef = useRef(restrictToRange);
  useEffect(() => { restrictToRangeRef.current = restrictToRange; }, [restrictToRange]);
  const limitStartMsRef = useRef(limitStartMs);
  useEffect(() => { limitStartMsRef.current = limitStartMs; }, [limitStartMs]);
  const limitEndMsRef = useRef(limitEndMs);
  useEffect(() => { limitEndMsRef.current = limitEndMs; }, [limitEndMs]);

  const clampTimeMs = (ms: number): number =>
    restrictToRangeRef.current ? clampMsToLimits(ms, limitStartMsRef.current, limitEndMsRef.current) : ms;

  const [currentTime, setCurrentTime] = useState<Cesium.JulianDate>(() =>
    toJulianDate(initialTime ?? (providedStart ?? Cesium.JulianDate.fromDate(new Date())))
  );

  // ── Initial visible range ──
  // Compared by ms (not object identity) so a fresh Date/JulianDate with the
  // same value on every render doesn't re-apply it.
  const initialStartMs = initialVisibleRange ? toMs(initialVisibleRange.start) : undefined;
  const initialEndMs   = initialVisibleRange ? toMs(initialVisibleRange.end)   : undefined;
  const resolveRange = (startMs: number | undefined, endMs: number | undefined) =>
    startMs == null || endMs == null
      ? null
      : resolveVisibleRange(startMs, endMs, limitStartMs, limitEndMs, !!restrictToRange);
  // Only read for the canvas's very first render; later changes go through zoomTo.
  const mountRange = useRef(resolveRange(initialStartMs, initialEndMs)).current;

  // While true, playhead auto-follow (re-centring at the 10%/90% edges) is
  // paused, because a window was applied that doesn't contain the playhead.
  // Cleared as soon as the playhead is inside the visible window again.
  const followSuspendedRef = useRef(mountRange != null);

  // Shared auto-follow for clock ticks and the no-clock real-time fallback.
  const followPlayhead = (ctMs: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { startMs, endMs } = canvas.getVisibleRange();
    if (followSuspendedRef.current) {
      if (ctMs < startMs || ctMs > endMs) return;
      followSuspendedRef.current = false;
    }
    const span = endMs - startMs;
    const pos = ctMs - startMs;
    if (pos <= span * 0.1) {
      canvas.zoomTo(ctMs - span * 0.1, ctMs + span * 0.9, ctMs);
    } else if (pos >= span * 0.9) {
      canvas.zoomTo(ctMs - span * 0.9, ctMs + span * 0.1, ctMs);
    }
  };

  // Zoom to a programmatically chosen window, pausing auto-follow so it isn't
  // immediately thrown away if the playhead lies outside it.
  const applyVisibleRange = (range: { startMs: number; endMs: number }) => {
    followSuspendedRef.current = true;
    canvasRef.current?.zoomTo(range.startMs, range.endMs);
  };
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
        const rawMs = Cesium.JulianDate.toDate(clock.currentTime).getTime();
        const ctMs  = clampTimeMs(rawMs);
        if (ctMs !== rawMs) {
          // Hit a restrictToRange boundary — snap the needle to it. Only stop
          // playback when the clamp opposes the direction of travel; a clock
          // sitting outside the range and heading back into it keeps running.
          clock.currentTime = Cesium.JulianDate.fromDate(new Date(ctMs));
          const hitEndLimit   = ctMs < rawMs;
          const movingForward = clock.multiplier > 0;
          if (hitEndLimit ? movingForward : !movingForward) {
            clock.shouldAnimate = false;
          }
        }
        const ct = Cesium.JulianDate.clone(clock.currentTime);
        setCurrentTime(ct);
        setIsPlaying(clock.shouldAnimate);
        setMultiplier(clock.multiplier);
        followPlayhead(ctMs);
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
      const ctMs = clampTimeMs(Date.now());
      const ct   = Cesium.JulianDate.fromDate(new Date(ctMs));
      setCurrentTime(ct);
      followPlayhead(ctMs);
    }, 1000);
    return () => clearInterval(id);
  }, [clock]);

  // ── jumpToTime prop ──
  useEffect(() => {
    if (!jumpToTime || live) return;
    const t = toJulianDate(jumpToTime);
    handleTimeChange(t);
    followSuspendedRef.current = false;
    if (canvasRef.current) {
      const { startMs, endMs } = canvasRef.current.getVisibleRange();
      const span = endMs - startMs;
      const newMs = clampTimeMs(Cesium.JulianDate.toDate(t).getTime());
      canvasRef.current.zoomTo(newMs - span / 2, newMs + span / 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToTime]);

  // ── Re-apply the view window when startTime / endTime or initialVisibleRange change ──
  // New bounds (e.g. a new scene loading): show `initialVisibleRange` if it
  // resolves against them, otherwise the full span. A change to
  // `initialVisibleRange` alone is applied once; an invalid/removed value then
  // leaves the user's current view alone.
  const prevViewDeps = useRef({ defaultStartMs, defaultEndMs, initialStartMs, initialEndMs });
  useEffect(() => {
    const prev = prevViewDeps.current;
    prevViewDeps.current = { defaultStartMs, defaultEndMs, initialStartMs, initialEndMs };
    const boundsChanged  = prev.defaultStartMs !== defaultStartMs || prev.defaultEndMs !== defaultEndMs;
    const initialChanged = prev.initialStartMs !== initialStartMs || prev.initialEndMs !== initialEndMs;
    if (!boundsChanged && !initialChanged) return; // first render — the canvas mounted on the right window

    const range = resolveRange(initialStartMs, initialEndMs);
    if (range) {
      applyVisibleRange(range);
    } else if (boundsChanged && providedStart != null && providedEnd != null) {
      canvasRef.current?.zoomTo(defaultStartMs, defaultEndMs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStartMs, defaultEndMs, initialStartMs, initialEndMs]);

  // ── Imperative handle ──
  useImperativeHandle(ref, () => ({
    zoomTo(start, end) {
      const range = resolveRange(toMs(start), toMs(end));
      if (range) applyVisibleRange(range);
    },
    getVisibleRange() {
      const { startMs, endMs } = canvasRef.current?.getVisibleRange()
        ?? { startMs: mountRange?.startMs ?? defaultStartMs, endMs: mountRange?.endMs ?? defaultEndMs };
      return {
        start: Cesium.JulianDate.fromDate(new Date(startMs)),
        end:   Cesium.JulianDate.fromDate(new Date(endMs)),
      };
    },
    appendSwimLane:   lane => canvasRef.current?.appendSwimLane(lane),
    updateSwimLane:   (id, updates) => canvasRef.current?.updateSwimLane(id, updates),
    removeSwimLane:   id => canvasRef.current?.removeSwimLane(id),
    reorderSwimLanes: ids => canvasRef.current?.reorderSwimLanes(ids),
  }));

  // ── Helpers ──
  const applyMultiplier = (m: number, play = true) => {
    if (clock) { clock.multiplier = m; if (play) clock.shouldAnimate = true; }
    setMultiplier(m);
    if (play) setIsPlaying(true);
    onMultiplierChange?.(m);
  };

  const handleTimeChange = (t: Cesium.JulianDate) => {
    const rawMs = Cesium.JulianDate.toDate(t).getTime();
    const clampedMs = clampTimeMs(rawMs);
    const finalT = clampedMs === rawMs ? t : Cesium.JulianDate.fromDate(new Date(clampedMs));
    setCurrentTime(finalT);
    if (clock) clock.currentTime = Cesium.JulianDate.clone(finalT);
    onTimeChange?.(finalT);
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

  /**
   * Sets the playback speed to an explicit absolute value, preserving direction.
   * The slider is bounded by minSpeed/maxSpeed, but a value typed directly into
   * the number input is applied as-is, even outside that range.
   */
  const handleSetSpeed = (value: number) => {
    applyMultiplier(multiplier < 0 ? -value : value);
  };

  const handleJumpToStart = () => {
    const t = toJulianDate(providedStart ?? Cesium.JulianDate.fromDate(new Date(defaultStartMs)));
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    followSuspendedRef.current = false;
    canvasRef.current?.zoomTo(defaultStartMs, defaultEndMs);
  };

  const handleJumpToEnd = () => {
    const t = toJulianDate(providedEnd ?? Cesium.JulianDate.fromDate(new Date(defaultEndMs)));
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    followSuspendedRef.current = false;
    canvasRef.current?.zoomTo(defaultStartMs, defaultEndMs);
  };

  const handleJumpToLive = () => {
    const nowMs = clampTimeMs(Date.now());
    const t = Cesium.JulianDate.fromDate(new Date(nowMs));
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    setCurrentTime(t);
    applyMultiplier(1);
    followSuspendedRef.current = false;
    if (canvasRef.current) {
      const { startMs, endMs } = canvasRef.current.getVisibleRange();
      const span = endMs - startMs;
      canvasRef.current.zoomTo(nowMs - span / 2, nowMs + span / 2);
    }
  };

  // ── Jump to current time when live mode is switched on ──
  const prevLiveRef = useRef(live);
  useEffect(() => {
    if (live && !prevLiveRef.current) {
      handleJumpToLive();
    }
    prevLiveRef.current = live;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const isLive = Math.abs(Cesium.JulianDate.toDate(currentTime).getTime() - Date.now()) < 2_000;

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
            onSetSpeed={handleSetSpeed}
            minSpeed={minSpeed}
            maxSpeed={maxSpeed}
            onDateTimeClick={onDateTimeClick}
            dateTimeFormat={dateTimeFormat}
            timezone={timezone}
            theme={finalTheme}
            swimLanesVisible={hasSwimLanes ? swimLanesExpanded : undefined}
            onToggleSwimLanes={hasSwimLanes ? handleToggleSwimLanes : undefined}
            labels={labels}
            liveButtonSize={liveButtonSize}
            liveButtonPosition={liveButtonPosition}
            showLive={showLive}
            live={live}
          />
        </div>
      )}

      {(enableDrag !== false || live) && (
        <TimelineCanvas
          ref={canvasRef}
          currentTime={currentTime}
          defaultStartMs={mountRange?.startMs ?? defaultStartMs}
          defaultEndMs={mountRange?.endMs ?? defaultEndMs}
          theme={finalTheme}
          maxTicks={maxTicks}
          timezone={timezone}
          dateTimeFormat={dateTimeFormat}
          months={labels?.months}
          onTimeChange={handleTimeChange}
          onDragStart={() => { isDraggingRef.current = true; }}
          onDragEnd={() => { isDraggingRef.current = false; }}
          disableNeedleDrag={!!live}
          invertScrollZoom={invertScrollZoom}
          restrictToRange={restrictToRange}
          limitStartMs={providedStart != null ? defaultStartMs : undefined}
          limitEndMs={providedEnd != null ? defaultEndMs : undefined}
          swimLanes={swimLanes}
          showSwimLanes={swimLanesExpanded}
          onSwimLaneItemClick={onSwimLaneItemClick}
          onSwimLaneItemHover={onSwimLaneItemHover}
          onSwimLaneItemDoubleClick={onSwimLaneItemDoubleClick}
          onSwimLaneItemContextMenu={onSwimLaneItemContextMenu}
          onSwimLaneReorder={onSwimLaneReorder}
          onSwimLaneItemDragStart={onSwimLaneItemDragStart}
          onSwimLaneItemDrag={onSwimLaneItemDrag}
          onSwimLaneItemDragEnd={onSwimLaneItemDragEnd}
          onRangeSelect={onRangeSelect}
        />
      )}
    </div>
  );
});

Timeline.displayName = 'Timeline';

export default Timeline;
