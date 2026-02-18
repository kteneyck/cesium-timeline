import * as Cesium from 'cesium';

export function toJulianDate(date: Cesium.JulianDate | Date): Cesium.JulianDate {
  if (date instanceof Cesium.JulianDate) {
    return Cesium.JulianDate.clone(date);
  }
  return Cesium.JulianDate.fromDate(date);
}

export function toDate(date: Cesium.JulianDate | Date): Date {
  if (date instanceof Cesium.JulianDate) {
    return Cesium.JulianDate.toDate(date);
  }
  return date;
}

export function toMilliseconds(date: Cesium.JulianDate | Date): number {
  const jsDate = toDate(date);
  return jsDate.getTime();
}

export function fromMilliseconds(ms: number): Cesium.JulianDate {
  return Cesium.JulianDate.fromDate(new Date(ms));
}

export function getDurationMs(
  startTime: Cesium.JulianDate | Date,
  endTime: Cesium.JulianDate | Date
): number {
  const startMs = toMilliseconds(startTime);
  const endMs = toMilliseconds(endTime);
  return endMs - startMs;
}

export function formatTime(date: Cesium.JulianDate | Date, includeSeconds = false): string {
  const jsDate = toDate(date);
  const hours = jsDate.getHours().toString().padStart(2, '0');
  const minutes = jsDate.getMinutes().toString().padStart(2, '0');
  
  if (includeSeconds) {
    const seconds = jsDate.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  
  return `${hours}:${minutes}`;
}
