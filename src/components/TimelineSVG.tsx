import React, { useMemo, useRef } from 'react';
import * as Cesium from 'cesium';
import { TimelineTheme } from '../types';
import { generateTicks, timeToPosition, snapToTick } from '../utils/timeMapping';
import { TickInterval } from '../types';

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

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(width, x));

    // Check if click is on the red bar (±10px)
    const isOnBar = Math.abs(clampedX - indicatorX) <= 10;

    if (!isOnBar) {
      // Click elsewhere on timeline - jump to that time
      let finalX = clampedX;
      if (snapEnabled) {
        finalX = snapToTick(clampedX, ticks, 10);
      }

      const newTime = Cesium.JulianDate.fromDate(
        new Date(
          new Date(startTime as any).getTime() +
            (finalX / width) *
              (new Date(endTime as any).getTime() - new Date(startTime as any).getTime())
        )
      );

      onTimeChange(newTime);
      return;
    }

    // Click on the bar - enter drag mode
    onDragStart?.();

    let pendingUpdate = false;
    let pendingX = 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - rect.left;
      const clampedX = Math.max(0, Math.min(width, x));

      let finalX = clampedX;
      if (snapEnabled) {
        finalX = snapToTick(clampedX, ticks, 10);
      }

      pendingX = finalX;
      pendingUpdate = true;

      // Use requestAnimationFrame for smooth, responsive dragging
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingUpdate) {
            const newTime = Cesium.JulianDate.fromDate(
              new Date(
                new Date(startTime as any).getTime() +
                  (pendingX / width) *
                    (new Date(endTime as any).getTime() - new Date(startTime as any).getTime())
              )
            );

            onTimeChange(newTime);
            pendingUpdate = false;
          }
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Cancel any pending animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <svg
      width="100%"
      height={height}
      style={{
        backgroundColor: theme.backgroundColor,
        display: 'block',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Timeline background */}
      <rect width={width} height={height} fill={theme.backgroundColor} />

      {/* Ticks */}
      {ticks.map((tick, index) => (
        <g key={index}>
          {/* Tick line */}
          <line
            x1={tick.position}
            y1={height - (tick.isMajor ? theme.majorTickHeight : theme.minorTickHeight)}
            x2={tick.position}
            y2={height}
            stroke={tick.isMajor ? theme.majorTickColor : theme.tickColor}
            strokeWidth="1"
          />

          {/* Tick label */}
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
        x1={indicatorX}
        y1="0"
        x2={indicatorX}
        y2={height}
        stroke={theme.indicatorColor}
        strokeWidth={theme.indicatorLineWidth}
        pointerEvents="none"
      />

      {/* Draggable hit area (invisible) */}
      {enableDrag && (
        <rect
          x={Math.max(0, indicatorX - 10)}
          y="0"
          width="20"
          height={height}
          fill="transparent"
          style={{ cursor: 'grab' }}
          pointerEvents="auto"
        />
      )}

      {/* Current time circle indicator */}
      <circle
        cx={indicatorX}
        cy="5"
        r="4"
        fill={theme.indicatorColor}
        pointerEvents="none"
      />
    </svg>
  );
};
