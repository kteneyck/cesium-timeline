import * as Cesium from 'cesium';
import { toMilliseconds, getDurationMs } from './timeConversion';
import { TickInterval } from '../types/TickInterval';

export interface TimePosition {
  x: number;
  time: Cesium.JulianDate;
}

export function timeToPosition(
  time: Cesium.JulianDate | Date,
  startTime: Cesium.JulianDate | Date,
  endTime: Cesium.JulianDate | Date,
  width: number
): number {
  const timeMs = toMilliseconds(time);
  const startMs = toMilliseconds(startTime);
  const endMs = toMilliseconds(endTime);
  
  if (endMs === startMs) return 0;
  
  const progress = (timeMs - startMs) / (endMs - startMs);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return clampedProgress * width;
}

export function positionToTime(
  x: number,
  startTime: Cesium.JulianDate | Date,
  endTime: Cesium.JulianDate | Date,
  width: number
): Cesium.JulianDate {
  const progress = Math.max(0, Math.min(1, x / width));
  const startMs = toMilliseconds(startTime);
  const endMs = toMilliseconds(endTime);
  const timeMs = startMs + progress * (endMs - startMs);
  
  return Cesium.JulianDate.fromDate(new Date(timeMs));
}

export interface Tick {
  position: number;
  isMajor: boolean;
  label?: string;
}

export function generateTicks(
  startTime: Cesium.JulianDate | Date,
  endTime: Cesium.JulianDate | Date,
  tickInterval: TickInterval | number,
  width: number
): Tick[] {
  const ticks: Tick[] = [];
  const durationMs = getDurationMs(startTime, endTime);
  const startMs = toMilliseconds(startTime);
  
  // Convert interval to milliseconds
  let intervalMs: number;
  if (typeof tickInterval === 'number' && tickInterval in TickInterval) {
    intervalMs = (tickInterval as number) * 60 * 1000;
  } else if (typeof tickInterval === 'number') {
    intervalMs = tickInterval * 60 * 1000;
  } else {
    intervalMs = 60 * 60 * 1000; // Default 1 hour
  }
  
  // Determine major tick interval (every 4th tick for hourly, adjust as needed)
  const majorInterval = intervalMs * 4;
  
  let currentMs = startMs;
  let tickCount = 0;
  
  while (currentMs <= startMs + durationMs) {
    const isMajor = (tickCount * intervalMs) % majorInterval === 0;
    const x = timeToPosition(
      new Date(currentMs),
      startTime,
      endTime,
      width
    );
    
    let label: string | undefined;
    if (isMajor) {
      const date = new Date(currentMs);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      label = `${hours}:${minutes}`;
    }
    
    ticks.push({
      position: x,
      isMajor,
      label,
    });
    
    currentMs += intervalMs;
    tickCount++;
  }
  
  return ticks;
}

export function snapToTick(
  x: number,
  ticks: Tick[],
  snapDistance: number = 10
): number {
  let closestTick = ticks[0];
  let closestDistance = Math.abs(closestTick.position - x);
  
  for (const tick of ticks) {
    const distance = Math.abs(tick.position - x);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestTick = tick;
    }
  }
  
  if (closestDistance <= snapDistance) {
    return closestTick.position;
  }
  
  return x;
}
