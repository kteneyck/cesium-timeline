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
  return toDate(date).getTime();
}

export function fromMilliseconds(ms: number): Cesium.JulianDate {
  return Cesium.JulianDate.fromDate(new Date(ms));
}

export function getDurationMs(
  startTime: Cesium.JulianDate | Date,
  endTime: Cesium.JulianDate | Date
): number {
  return toMilliseconds(endTime) - toMilliseconds(startTime);
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Built-in format presets. Pass one of these (or any custom string) as `dateTimeFormat`. */
export const DateTimeFormats = {
  /** e.g. "Feb 24 2026 14:04:07" — default */
  DEFAULT:   'MMM DD YYYY HH:mm:ss',
  /** e.g. "Feb 24 2026 02:04:07 PM" */
  TWELVE_HR: 'MMM DD YYYY hh:mm:ss A',
  /** e.g. "2026-02-24 14:04:07" */
  ISO:       'YYYY-MM-DD HH:mm:ss',
  /** e.g. "02/24/2026 14:04" */
  US:        'MM/DD/YYYY HH:mm',
  /** e.g. "24/02/2026 14:04" */
  EU:        'DD/MM/YYYY HH:mm',
  /** e.g. "14:04:07" */
  TIME_ONLY: 'HH:mm:ss',
  /** e.g. "02:04:07 PM" */
  TIME_12:   'hh:mm:ss A',
} as const;

/**
 * Format a date using a token-based format string.
 *
 * Supported tokens (longest-first to avoid partial matches):
 *  YYYY  – 4-digit year                 e.g. 2026
 *  YY    – 2-digit year                 e.g. 26
 *  MMMM  – full month name              e.g. February
 *  MMM   – abbreviated month name       e.g. Feb
 *  MM    – zero-padded month number     e.g. 02
 *  M     – month number                 e.g. 2
 *  DD    – zero-padded day              e.g. 05
 *  D     – day                          e.g. 5
 *  HH    – 24-hour, zero-padded         e.g. 14
 *  H     – 24-hour                      e.g. 14
 *  hh    – 12-hour, zero-padded         e.g. 02
 *  h     – 12-hour                      e.g. 2
 *  mm    – minutes, zero-padded         e.g. 04
 *  ss    – seconds, zero-padded         e.g. 07
 *  SSS   – milliseconds, zero-padded    e.g. 042
 *  A     – AM / PM uppercase
 *  a     – am / pm lowercase
 */
export function formatDateTime(
  date: Cesium.JulianDate | Date,
  format: string = DateTimeFormats.DEFAULT
): string {
  const d    = toDate(date);
  const yr   = d.getFullYear();
  const mo   = d.getMonth();
  const day  = d.getDate();
  const hr24 = d.getHours();
  const hr12 = hr24 % 12 || 12;
  const min  = d.getMinutes();
  const sec  = d.getSeconds();
  const ms   = d.getMilliseconds();
  const ampm = hr24 < 12 ? 'AM' : 'PM';

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return format
    .replace('YYYY', String(yr))
    .replace('YY',   String(yr).slice(-2))
    .replace('MMMM', MONTH_LONG[mo])
    .replace('MMM',  MONTH_SHORT[mo])
    .replace('MM',   pad2(mo + 1))
    .replace('M',    String(mo + 1))
    .replace('DD',   pad2(day))
    .replace('D',    String(day))
    .replace('HH',   pad2(hr24))
    .replace('H',    String(hr24))
    .replace('hh',   pad2(hr12))
    .replace('h',    String(hr12))
    .replace('mm',   pad2(min))
    .replace('ss',   pad2(sec))
    .replace('SSS',  pad3(ms))
    .replace('A',    ampm)
    .replace('a',    ampm.toLowerCase());
}

/**
 * Split a format string into separate time and date parts for two-line display.
 * Strips date tokens to derive the time format, and time tokens to derive the date format.
 * Returns empty string for either part if no relevant tokens exist in the format.
 */
export function splitForDisplay(format: string = DateTimeFormats.DEFAULT): { timeFormat: string; dateFormat: string } {
  const DATE_TOKENS = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D'];
  const TIME_TOKENS = ['HH', 'H', 'hh', 'h', 'mm', 'ss', 'SSS', 'A', 'a'];

  const cleanup = (s: string) => s.replace(/\s{2,}/g, ' ').trim().replace(/^[\s\W]+|[\s\W]+$/g, '').trim();

  let timeFormat = format;
  for (const t of DATE_TOKENS) timeFormat = timeFormat.replace(t, '');

  let dateFormat = format;
  for (const t of TIME_TOKENS) dateFormat = dateFormat.replace(t, '');

  return { timeFormat: cleanup(timeFormat), dateFormat: cleanup(dateFormat) };
}

/** @deprecated Use formatDateTime instead */
export function formatTime(date: Cesium.JulianDate | Date, includeSeconds = false): string {
  return formatDateTime(date, includeSeconds ? 'HH:mm:ss' : 'HH:mm');
}
