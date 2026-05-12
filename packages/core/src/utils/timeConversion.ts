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

/** Convenience constants for the `timezone` prop. */
export const Timezones = {
  /** Use the browser's local timezone (default behavior). */
  LOCAL: 'local',
  /** Coordinated Universal Time. */
  UTC: 'UTC',
} as const;

/** Decomposed date/time fields extracted in a specific timezone. `mo` is 0-indexed. */
export interface DateParts {
  yr: number;
  mo: number;
  day: number;
  hr24: number;
  hr12: number;
  min: number;
  sec: number;
  ms: number;
  ampm: 'AM' | 'PM';
}

/**
 * Extract date/time components in the given timezone.
 * When `timezone` is `undefined` or `'local'`, the browser's local time methods are used.
 * Otherwise, `Intl.DateTimeFormat#formatToParts` is used for timezone-accurate extraction.
 */
export function getDateParts(date: Date, timezone?: string): DateParts {
  if (!timezone || timezone === 'local') {
    const yr   = date.getFullYear();
    const mo   = date.getMonth();
    const day  = date.getDate();
    const hr24 = date.getHours();
    const hr12 = hr24 % 12 || 12;
    const min  = date.getMinutes();
    const sec  = date.getSeconds();
    const ms   = date.getMilliseconds();
    return { yr, mo, day, hr24, hr12, min, sec, ms, ampm: hr24 < 12 ? 'AM' : 'PM' };
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }

  const yr   = parseInt(p.year);
  const mo   = parseInt(p.month) - 1;
  const day  = parseInt(p.day);
  let   hr24 = parseInt(p.hour);
  if (hr24 === 24) hr24 = 0; // Intl occasionally returns 24 at midnight
  const hr12 = hr24 % 12 || 12;
  const min  = parseInt(p.minute);
  const sec  = parseInt(p.second);
  const ms   = date.getMilliseconds(); // sub-second is timezone-independent
  return { yr, mo, day, hr24, hr12, min, sec, ms, ampm: hr24 < 12 ? 'AM' : 'PM' };
}

/**
 * Return the short timezone abbreviation for the given date in the given timezone,
 * e.g. `"UTC"`, `"EST"`, `"PDT"`. Returns `null` when timezone is `undefined` or `'local'`.
 */
export function getTimezoneAbbr(date: Cesium.JulianDate | Date, timezone?: string): string | null {
  if (!timezone || timezone === 'local') return null;
  const d = toDate(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(d);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? null;
}

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
  format: string = DateTimeFormats.DEFAULT,
  timezone?: string
): string {
  const d = toDate(date);
  const { yr, mo, day, hr24, hr12, min, sec, ms, ampm } = getDateParts(d, timezone);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  const tokens: Record<string, string> = {
    YYYY: String(yr),
    YY:   String(yr).slice(-2),
    MMMM: MONTH_LONG[mo],
    MMM:  MONTH_SHORT[mo],
    MM:   pad2(mo + 1),
    M:    String(mo + 1),
    DD:   pad2(day),
    D:    String(day),
    HH:   pad2(hr24),
    H:    String(hr24),
    hh:   pad2(hr12),
    h:    String(hr12),
    mm:   pad2(min),
    ss:   pad2(sec),
    SSS:  pad3(ms),
    A:    ampm,
    a:    ampm.toLowerCase(),
  };

  // Single-pass replacement — longest tokens listed first in the alternation
  // so 'MMMM' matches before 'MMM', 'MMM' before 'MM', etc.
  return format.replace(
    /YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|hh|h|mm|ss|SSS|A|a/g,
    token => tokens[token] ?? token
  );
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
