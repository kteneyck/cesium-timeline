import React, { useMemo, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type TickInterval,
  generateTicks,
  timeToPosition,
  snapToTick,
} from '@bariumstudios/cesium-timeline-core';

interface TimelineSVGProps {
  startTime: Cesium.JulianDate | Date;
  endTime: Cesium.JulianDate | Date;
  currentTime: Cesium.JulianDate | Date;
  width: number;
  height: number;
  tickInterval: TickInterval | number;
  showLabels: boolean;
  snapToTicks: boolean;
  enableDrag: boolean;
  theme: TimelineTheme;
  onTimeChange: (time: Cesium.JulianDate) => void;
  onVisibleRangeChange?: (start: Cesium.JulianDate, end: Cesium.JulianDate) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export const TimelineSVG: React.FC<TimelineSVGProps> = ({
  startTime,
  endTime,
  currentTime,
  width,
  height,
  tickInterval,
  showLabels,
  snapToTicks: snapEnabled,
  enableDrag,
  theme,
  onTimeChange,
  onVisibleRangeChange,
  onDragStart,
  onDragEnd,
}) => {
  const ticks = useMemo(
    () => generateTicks(startTime, endTime, tickInterval, width),
    [startTime, endTime, tickInterval, width]
  );

  const indicatorX = useMemo(
    () => timeToPosition(currentTime, startTime, endTime, width),
    [currentTime, startTime, endTime, width]
  );

  const rafRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!enableDrag) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(width, x));
    const isOnBar = Math.abs(clampedX - indicatorX) <= 10;

    if (!isOnBar) {
      let finalX = clampedX;
      if (snapEnabled) finalX = snapToTick(clampedX, ticks, 10);
      const startMs = new Date(startTime as any).getTime();
      const endMs   = new Date(endTime as any).getTime();
      onTimeChange(Cesium.JulianDate.fromDate(new Date(startMs + (finalX / width) * (endMs - startMs))));
      return;
    }

    onDragStart?.();

    const dragStartClientX = e.clientX;
    const dragStartMs = new Date(currentTime as any).getTime();
    const startMs = new Date(startTime as any).getTime();
    const endMs   = new Date(endTime as any).getTime();
    const msPerPx = (endMs - startMs) / width;

    let pendingDelta = 0;
    let pending = false;

    const onMouseMove = (me: MouseEvent) => {
      pendingDelta = me.clientX - dragStartClientX;
      pending = true;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pending) {
            const newMs = dragStartMs + pendingDelta * msPerPx;
            onTimeChange(Cesium.JulianDate.fromDate(new Date(newMs)));
            pending = false;
          }
          rafRef.current = null;
        });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      onDragEnd?.();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.shiftKey ? e.deltaY : (e.deltaX !== 0 ? e.deltaX : e.deltaY);
    if (Math.abs(delta) < 1) return;

    const startMs = new Date(startTime as any).getTime();
    const endMs   = new Date(endTime as any).getTime();
    const shift   = (delta / width) * (endMs - startMs) * 0.5;

    onVisibleRangeChange?.(
      Cesium.JulianDate.fromDate(new Date(startMs + shift)),
      Cesium.JulianDate.fromDate(new Date(endMs   + shift))
    );
  };

  return (
    <svg
      width="100%"
      height={height}
      style={{ backgroundColor: theme.backgroundColor, display: 'block', cursor: 'default' }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <rect width={width} height={height} fill={theme.backgroundColor} />

      {ticks.map((tick, i) => (
        <g key={i}>
          <line
            x1={tick.position}
            y1={height - (tick.isMajor ? theme.majorTickHeight : theme.minorTickHeight)}
            x2={tick.position}
            y2={height}
            stroke={tick.isMajor ? theme.majorTickColor : theme.tickColor}
            strokeWidth="1"
          />
          {showLabels && tick.isMajor && tick.label && (
            <text
              x={tick.position}
              y={height - theme.majorTickHeight - 5}
              textAnchor="middle"
              fill={theme.labelColor}
              fontSize={theme.fontSize}
              fontFamily="monospace"
            >
              {tick.label}
            </text>
          )}
        </g>
      ))}

      {/* Current time indicator line */}
      <line
        x1={indicatorX} y1={0} x2={indicatorX} y2={height}
        stroke={theme.indicatorColor}
        strokeWidth={theme.indicatorLineWidth}
        pointerEvents="none"
      />

      {/* Wider grab hit area — cursor only over bar */}
      {enableDrag && (
        <rect
          x={Math.max(0, indicatorX - 10)}
          y={0}
          width={20}
          height={height}
          fill="transparent"
          style={{ cursor: 'ew-resize' }}
          pointerEvents="visiblePainted"
        />
      )}

      <circle cx={indicatorX} cy={5} r={4} fill={theme.indicatorColor} pointerEvents="none" />
    </svg>
  );
};
