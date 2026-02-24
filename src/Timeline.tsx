import React, { useRef, useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import { TimelineProps, defaultTheme } from './types';
import { TimelineControls } from './components/TimelineControls';
import { TimelineCanvas, TimelineCanvasHandle } from './components/TimelineCanvas';
import { toJulianDate } from './utils/timeConversion';

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

      // Auto-scroll: keep needle inside visible range
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTimeChange = (t: Cesium.JulianDate) => {
    setCurrentTime(t);
    if (clock) clock.currentTime = Cesium.JulianDate.clone(t);
    onTimeChange?.(t);
  };

  const handlePlayPause = (playing: boolean) => {
    if (clock) clock.shouldAnimate = playing;
    onPlayPause?.(playing);
  };

  const handleMultiplierChange = (m: number) => {
    if (clock) clock.multiplier = m;
    onMultiplierChange?.(m);
  };

  const handleRewind = () => {
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
          onPlayPause={handlePlayPause}
          onRewind={handleRewind}
          onMultiplierChange={handleMultiplierChange}
          onJumpToEnd={handleJumpToEnd}
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
