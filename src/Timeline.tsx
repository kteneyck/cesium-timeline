import React, { useRef, useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import { TimelineProps, defaultTheme } from './types';
import { TimelineControls } from './components/TimelineControls';
import { TimelineCanvas, TimelineCanvasHandle } from './components/TimelineCanvas';
import { toJulianDate } from './utils/timeConversion';

// FF cycles forward: 2→4→8→16→32→1 (1 resets to normal)
const FF_SPEEDS = [2, 4, 8, 16, 32, 1];
// RW cycles reverse magnitude: 1→2→4→8→16→32 (wraps)
const RW_SPEEDS = [1, 2, 4, 8, 16, 32];

export const Timeline: React.FC<TimelineProps> = ({
  startTime: providedStart,
  endTime:   providedEnd,
  currentTime: initialTime,
  clock,
  onTimeChange,
  onPlayPause,
  onMultiplierChange,
  height       = 120,
  showControls = true,
  enableDrag   = true,
  dateTimeFormat,
  onDateTimeClick,
  jumpToTime,
  theme: customTheme,
  className,
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
  const [isPlaying,  setIsPlaying]  = useState(clock?.shouldAnimate ?? false);
  const [multiplier, setMultiplier] = useState(clock?.multiplier    ?? 1);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<TimelineCanvasHandle>(null);
  const finalTheme = { ...defaultTheme, ...customTheme };

  // ── Cesium clock sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!clock) return;
    const onTick = () => {
      const ct = Cesium.JulianDate.clone(clock.currentTime);
      setCurrentTime(ct);
      setIsPlaying(clock.shouldAnimate);
      setMultiplier(clock.multiplier);

      if (!isDragging && canvasRef.current) {
        const { startMs, endMs } = canvasRef.current.getVisibleRange();
        const span  = endMs - startMs;
        const ctMs  = Cesium.JulianDate.toDate(ct).getTime();
        const pos   = ctMs - startMs;
        if (pos < span * 0.1) {
          canvasRef.current.zoomTo(startMs - span * 0.2, endMs - span * 0.2);
        } else if (pos > span * 0.9) {
          canvasRef.current.zoomTo(startMs + span * 0.2, endMs + span * 0.2);
        }
      }
    };
    clock.onTick.addEventListener(onTick);
    return () => { clock.onTick.removeEventListener(onTick); };
  }, [clock, isDragging]);

  // ── Fallback: real-time tick when no clock ────────────────────────────────
  useEffect(() => {
    if (clock) return;
    const id = setInterval(() => {
      const ct = Cesium.JulianDate.fromDate(new Date());
      setCurrentTime(ct);
      if (!isDragging && canvasRef.current) {
        const { startMs, endMs } = canvasRef.current.getVisibleRange();
        const span = endMs - startMs;
        const pos  = Cesium.JulianDate.toDate(ct).getTime() - startMs;
        if (pos < span * 0.1)       canvasRef.current.zoomTo(startMs - span * 0.2, endMs - span * 0.2);
        else if (pos > span * 0.9)  canvasRef.current.zoomTo(startMs + span * 0.2, endMs + span * 0.2);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clock, isDragging]);

  // ── jumpToTime prop: pan canvas and set time when implementer resolves their picker ──
  useEffect(() => {
    if (!jumpToTime) return;
    const t = toJulianDate(jumpToTime);
    handleTimeChange(t);
    if (canvasRef.current) {
      const { startMs, endMs } = canvasRef.current.getVisibleRange();
      const span  = endMs - startMs;
      const newMs = Cesium.JulianDate.toDate(t).getTime();
      canvasRef.current.zoomTo(newMs - span / 2, newMs + span / 2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToTime]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const applyMultiplier = (m: number, play = true) => {
    if (clock) { clock.multiplier = m; if (play) clock.shouldAnimate = true; }
    setMultiplier(m);
    if (play) setIsPlaying(true);
    onMultiplierChange?.(m);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTimeChange = (t: Cesium.JulianDate) => {
    setCurrentTime(t);
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    onTimeChange?.(t);
  };

  const handlePlayPause = (playing: boolean) => {
    if (playing && multiplier < 0) {
      // Coming out of reverse — snap back to 1×
      applyMultiplier(1, false);
    }
    if (clock) clock.shouldAnimate = playing;
    setIsPlaying(playing);
    onPlayPause?.(playing);
  };

  const handleFastForward = () => {
    const cur = multiplier > 1 ? multiplier : 1;
    const idx = FF_SPEEDS.indexOf(cur);
    const next = FF_SPEEDS[idx < 0 || idx === FF_SPEEDS.length - 1 ? 0 : idx + 1];
    applyMultiplier(next);
  };

  const handleRewindSpeed = () => {
    const curAbs = multiplier < 0 ? Math.abs(multiplier) : 0;
    const idx    = RW_SPEEDS.indexOf(curAbs);
    const next   = -(RW_SPEEDS[idx < 0 || idx === RW_SPEEDS.length - 1 ? 0 : idx + 1]);
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
    canvasRef.current?.zoomTo(nowMs - 12 * 3600 * 1000, nowMs + 12 * 3600 * 1000);
  };

  // Consider "live" when current time is within 10 seconds of wall-clock now
  const isLive = Math.abs(Cesium.JulianDate.toDate(currentTime).getTime() - Date.now()) < 10_000;

  return (
    <div
      className={className}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {showControls && (
        <TimelineControls
          currentTime={currentTime}
          isPlaying={isPlaying}
          multiplier={multiplier}
          isLive={isLive}
          onPlayPause={handlePlayPause}
          onJumpToStart={handleJumpToStart}
          onRewind={handleRewindSpeed}
          onFastForward={handleFastForward}
          onJumpToEnd={handleJumpToEnd}
          onJumpToLive={handleJumpToLive}
          onResetSpeed={() => applyMultiplier(1)}
          onDateTimeClick={onDateTimeClick}
          dateTimeFormat={dateTimeFormat}
          theme={finalTheme}
        />
      )}

      {enableDrag !== false && (
        <TimelineCanvas
          ref={canvasRef}
          currentTime={currentTime}
          defaultStartMs={defaultStartMs}
          defaultEndMs={defaultEndMs}
          height={height}
          theme={finalTheme}
          onTimeChange={handleTimeChange}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
        />
      )}
    </div>
  );
};

export default Timeline;
