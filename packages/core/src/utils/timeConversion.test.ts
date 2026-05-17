import { describe, it, expect } from 'vitest';
import {
  getDateParts,
  getTimezoneAbbr,
  formatDateTime,
  splitForDisplay,
  DateTimeFormats,
  Timezones,
} from './timeConversion';

// Fixed reference date: 2026-02-24 14:04:07.042 UTC
const REF_MS = Date.UTC(2026, 1, 24, 14, 4, 7, 42);
const REF_DATE = new Date(REF_MS);

// ─── getDateParts ─────────────────────────────────────────────────────────────

describe('getDateParts', () => {
  it('returns correct fields in UTC', () => {
    const p = getDateParts(REF_DATE, 'UTC');
    expect(p.yr).toBe(2026);
    expect(p.mo).toBe(1);    // 0-indexed February
    expect(p.day).toBe(24);
    expect(p.hr24).toBe(14);
    expect(p.hr12).toBe(2);
    expect(p.min).toBe(4);
    expect(p.sec).toBe(7);
    expect(p.ms).toBe(42);
    expect(p.ampm).toBe('PM');
  });

  it('returns AM for morning hours in UTC', () => {
    const morning = new Date(Date.UTC(2026, 0, 1, 9, 30, 0));
    const p = getDateParts(morning, 'UTC');
    expect(p.hr24).toBe(9);
    expect(p.hr12).toBe(9);
    expect(p.ampm).toBe('AM');
  });

  it('hr12 is 12 at midnight in UTC', () => {
    const midnight = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const p = getDateParts(midnight, 'UTC');
    expect(p.hr24).toBe(0);
    expect(p.hr12).toBe(12);
    expect(p.ampm).toBe('AM');
  });

  it('hr12 is 12 at noon in UTC', () => {
    const noon = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const p = getDateParts(noon, 'UTC');
    expect(p.hr24).toBe(12);
    expect(p.hr12).toBe(12);
    expect(p.ampm).toBe('PM');
  });

  it('returns a result for local timezone (no crash)', () => {
    const p = getDateParts(REF_DATE);
    expect(typeof p.yr).toBe('number');
    expect(typeof p.mo).toBe('number');
    expect(typeof p.day).toBe('number');
  });

  it('treats "local" the same as undefined', () => {
    const pUndef = getDateParts(REF_DATE, undefined);
    const pLocal = getDateParts(REF_DATE, 'local');
    expect(pUndef).toEqual(pLocal);
  });
});

// ─── getTimezoneAbbr ──────────────────────────────────────────────────────────

describe('getTimezoneAbbr', () => {
  it('returns null for local timezone', () => {
    expect(getTimezoneAbbr(REF_DATE)).toBeNull();
    expect(getTimezoneAbbr(REF_DATE, 'local')).toBeNull();
  });

  it('returns "UTC" for UTC timezone', () => {
    expect(getTimezoneAbbr(REF_DATE, 'UTC')).toBe('UTC');
  });

  it('returns a non-empty string for a named IANA timezone', () => {
    const abbr = getTimezoneAbbr(REF_DATE, 'America/New_York');
    expect(typeof abbr).toBe('string');
    expect((abbr as string).length).toBeGreaterThan(0);
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('formats with DEFAULT preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.DEFAULT, 'UTC')).toBe('Feb 24 2026 14:04:07');
  });

  it('formats with ISO preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.ISO, 'UTC')).toBe('2026-02-24 14:04:07');
  });

  it('formats with TWELVE_HR preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.TWELVE_HR, 'UTC')).toBe('Feb 24 2026 02:04:07 PM');
  });

  it('formats with US preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.US, 'UTC')).toBe('02/24/2026 14:04');
  });

  it('formats with EU preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.EU, 'UTC')).toBe('24/02/2026 14:04');
  });

  it('formats with TIME_ONLY preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.TIME_ONLY, 'UTC')).toBe('14:04:07');
  });

  it('formats with TIME_12 preset in UTC', () => {
    expect(formatDateTime(REF_DATE, DateTimeFormats.TIME_12, 'UTC')).toBe('02:04:07 PM');
  });

  it('includes milliseconds with SSS token', () => {
    expect(formatDateTime(REF_DATE, 'HH:mm:ss.SSS', 'UTC')).toBe('14:04:07.042');
  });

  it('uses full month name with MMMM token', () => {
    expect(formatDateTime(REF_DATE, 'MMMM D YYYY', 'UTC')).toBe('February 24 2026');
  });

  it('uses 2-digit year with YY token', () => {
    expect(formatDateTime(REF_DATE, 'YY', 'UTC')).toBe('26');
  });

  it('uses lowercase am/pm with a token', () => {
    expect(formatDateTime(REF_DATE, 'h:mm a', 'UTC')).toBe('2:04 pm');
  });

  it('uses no-padded day with D token', () => {
    const d = new Date(Date.UTC(2026, 0, 5, 0, 0, 0));
    expect(formatDateTime(d, 'D', 'UTC')).toBe('5');
  });

  it('does not crash without explicit format (uses default)', () => {
    const result = formatDateTime(REF_DATE, undefined, 'UTC');
    expect(result).toBe('Feb 24 2026 14:04:07');
  });
});

// ─── splitForDisplay ──────────────────────────────────────────────────────────

describe('splitForDisplay', () => {
  it('splits DEFAULT format into time and date parts', () => {
    const { timeFormat, dateFormat } = splitForDisplay(DateTimeFormats.DEFAULT);
    expect(timeFormat).toBe('HH:mm:ss');
    expect(dateFormat).toBe('MMM DD YYYY');
  });

  it('splits ISO format correctly', () => {
    const { timeFormat, dateFormat } = splitForDisplay(DateTimeFormats.ISO);
    expect(timeFormat).toBe('HH:mm:ss');
    expect(dateFormat).toBe('YYYY-MM-DD');
  });

  it('returns empty dateFormat for time-only format', () => {
    const { timeFormat, dateFormat } = splitForDisplay(DateTimeFormats.TIME_ONLY);
    expect(timeFormat).toBe('HH:mm:ss');
    expect(dateFormat).toBe('');
  });

  it('uses DEFAULT format when called with no arguments', () => {
    const { timeFormat, dateFormat } = splitForDisplay();
    expect(timeFormat).toBe('HH:mm:ss');
    expect(dateFormat).toBe('MMM DD YYYY');
  });
});

// ─── Timezones constants ──────────────────────────────────────────────────────

describe('Timezones', () => {
  it('has LOCAL and UTC constants', () => {
    expect(Timezones.LOCAL).toBe('local');
    expect(Timezones.UTC).toBe('UTC');
  });
});

// ─── DST & timezone edge cases ────────────────────────────────────────────────

describe('getDateParts — timezone edge cases', () => {
  it('handles DST spring-forward in America/New_York without crashing', () => {
    // 2026-03-08 07:00 UTC = 02:00 EST → clocks spring forward to 03:00 EDT
    const dst = new Date(Date.UTC(2026, 2, 8, 7, 0, 0));
    expect(() => getDateParts(dst, 'America/New_York')).not.toThrow();
    const p = getDateParts(dst, 'America/New_York');
    expect(typeof p.hr24).toBe('number');
  });

  it('handles midnight boundary in Asia/Tokyo', () => {
    // 2026-01-01 15:00 UTC = 2026-01-02 00:00 JST
    const midnight = new Date(Date.UTC(2026, 0, 1, 15, 0, 0));
    const p = getDateParts(midnight, 'Asia/Tokyo');
    expect(p.hr24).toBe(0);
    expect(p.day).toBe(2);
  });

  it('hr12 is 12 at noon (12h edge case)', () => {
    const noon = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
    const p = getDateParts(noon, 'UTC');
    expect(p.hr12).toBe(12);
    expect(p.ampm).toBe('PM');
  });

  it('hr12 is 12 at midnight (12h edge case)', () => {
    const midnight = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
    const p = getDateParts(midnight, 'UTC');
    expect(p.hr12).toBe(12);
    expect(p.ampm).toBe('AM');
  });
});

// ─── All DateTimeFormats presets ──────────────────────────────────────────────

describe('formatDateTime — all presets do not throw', () => {
  it.each(Object.entries(DateTimeFormats))('%s', (_name, fmt) => {
    expect(() => formatDateTime(REF_DATE, fmt as string, 'UTC')).not.toThrow();
    const result = formatDateTime(REF_DATE, fmt as string, 'UTC');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── splitForDisplay — additional formats ─────────────────────────────────────

describe('splitForDisplay — additional formats', () => {
  it('splits 12-hour format', () => {
    const { timeFormat, dateFormat } = splitForDisplay(DateTimeFormats.TWELVE_HR);
    expect(timeFormat).toBeTruthy();
    expect(dateFormat).toBeTruthy();
  });

  it('handles TIME_12 (time-only 12h)', () => {
    const { timeFormat, dateFormat } = splitForDisplay(DateTimeFormats.TIME_12);
    expect(timeFormat).toBeTruthy();
    expect(dateFormat).toBe('');
  });

  it('returns empty dateFormat for time-only format string', () => {
    const { dateFormat } = splitForDisplay('HH:mm:ss');
    expect(dateFormat).toBe('');
  });
});
