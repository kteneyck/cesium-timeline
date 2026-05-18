import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Cesium from 'cesium';
import {
  twoD,
  makeLabel,
  nextTic,
  clampSpan,
  zoomRange,
  zoomAroundMs,
  calcEpochMs,
  resolveItemStyle,
  totalSwimLaneHeight,
  hitTestSwimLane,
  hitTestLaneLabel,
  isInSwimLaneRegion,
  drawTimeline,
} from './CanvasEngine';
import { defaultTheme } from '../types/TimelineTheme';
import { defaultSwimLaneStyle, DEFAULT_LANE_HEIGHT } from '../types/SwimLane';
import { MIN_SPAN_MS, MAX_SPAN_MS, TICK_AREA_HEIGHT } from '../constants';

vi.mock('cesium', () => {
  const dates = new Map<number, Date>();
  let id = 0;
  class JulianDate {
    _id: number;
    constructor(d?: Date) {
      this._id = ++id;
      if (d) dates.set(this._id, d);
    }
    static fromDate(d: Date) { return new JulianDate(d); }
    static toDate(jd: JulianDate) { return dates.get(jd._id) ?? new Date(0); }
    static clone(jd: JulianDate) { return JulianDate.fromDate(JulianDate.toDate(jd)); }
  }
  return { JulianDate };
});

// ── Reference timestamp: 2026-02-24 14:04:07.042 UTC ─────────────────────────
const REF_MS = Date.UTC(2026, 1, 24, 14, 4, 7, 42);

// ── Canvas context stub ───────────────────────────────────────────────────────
function makeCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    setLineDash: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

// ── twoD ─────────────────────────────────────────────────────────────────────

describe('twoD', () => {
  it('pads single digits', () => { expect(twoD(5)).toBe('05'); });
  it('leaves double digits unchanged', () => { expect(twoD(12)).toBe('12'); });
  it('handles 0', () => { expect(twoD(0)).toBe('00'); });
  it('handles 10 exactly', () => { expect(twoD(10)).toBe('10'); });
});

// ── makeLabel ─────────────────────────────────────────────────────────────────

describe('makeLabel', () => {
  // Fixed reference: 2026-02-24 14:04:07 UTC
  const ms = REF_MS;

  it('returns year only for very long durations (>315360000s)', () => {
    expect(makeLabel(ms, 400_000_000, 'UTC')).toBe('2026');
  });

  it('returns "MMM YYYY" for long durations (>31536000s)', () => {
    expect(makeLabel(ms, 40_000_000, 'UTC')).toBe('Feb 2026');
  });

  it('returns "MMM D" for week-range durations (>604800s)', () => {
    expect(makeLabel(ms, 800_000, 'UTC')).toBe('Feb 24');
  });

  it('returns "MMM D HH:mm" for day-range durations (>86400s)', () => {
    expect(makeLabel(ms, 100_000, 'UTC')).toBe('Feb 24 14:04');
  });

  it('returns "HH:mm" for hour-range durations (>3600s)', () => {
    expect(makeLabel(ms, 4000, 'UTC')).toBe('14:04');
  });

  it('returns "HH:mm:ss" for minute-range durations (>60s)', () => {
    expect(makeLabel(ms, 70, 'UTC')).toBe('14:04:07');
  });

  it('returns "HH:mm:ss.mmm" with sub-second precision', () => {
    expect(makeLabel(ms, 10, 'UTC')).toBe('14:04:07.042');
  });

  it('omits milliseconds when ms = 0', () => {
    const msNoMs = Date.UTC(2026, 1, 24, 14, 4, 7, 0);
    expect(makeLabel(msNoMs, 10, 'UTC')).toBe('14:04:07');
  });

  it('uses 12-hour clock with AM/PM when use12h=true', () => {
    expect(makeLabel(ms, 4000, 'UTC', true)).toBe('02:04 PM');
  });

  it('uses 12-hour clock in "MMM D HH:mm" tier', () => {
    expect(makeLabel(ms, 100_000, 'UTC', true)).toBe('Feb 24 02:04 PM');
  });

  it('uses custom months array', () => {
    const fr = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    expect(makeLabel(ms, 40_000_000, 'UTC', false, fr)).toBe('Fév 2026');
  });

  it('custom months used in day-tier label', () => {
    const fr = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    expect(makeLabel(ms, 800_000, 'UTC', false, fr)).toBe('Fév 24');
  });

  it('falls back to English months when months array is omitted', () => {
    expect(makeLabel(ms, 800_000, 'UTC')).toBe('Feb 24');
  });
});

// ── nextTic ───────────────────────────────────────────────────────────────────

describe('nextTic', () => {
  it('advances past the current position', () => {
    expect(nextTic(0, 60)).toBeGreaterThan(0);
  });

  it('returns a multiple of scale', () => {
    const result = nextTic(123, 60);
    expect(result % 60).toBeCloseTo(0);
  });

  it('advances when already on a boundary', () => {
    // ceil(60/60 + 0.5) * 60 = ceil(1.5)*60 = 2*60 = 120
    expect(nextTic(60, 60)).toBe(120);
  });
});

// ── clampSpan ─────────────────────────────────────────────────────────────────

describe('clampSpan', () => {
  it('clamps below minimum', () => {
    expect(clampSpan(0)).toBe(MIN_SPAN_MS);
    expect(clampSpan(-100)).toBe(MIN_SPAN_MS);
  });

  it('clamps above maximum', () => {
    expect(clampSpan(MAX_SPAN_MS * 2)).toBe(MAX_SPAN_MS);
  });

  it('returns value unchanged when within range', () => {
    const mid = MIN_SPAN_MS * 1000;
    expect(clampSpan(mid)).toBe(mid);
  });
});

// ── zoomRange ─────────────────────────────────────────────────────────────────

describe('zoomRange', () => {
  const start = 1_000_000_000_000;
  const end   = start + 3_600_000; // 1-hour window

  it('zooms in (amount < 1) reduces span', () => {
    const { startMs, endMs } = zoomRange(start, end, 0.5);
    expect(endMs - startMs).toBeLessThan(end - start);
  });

  it('zooms out (amount > 1) increases span', () => {
    const { startMs, endMs } = zoomRange(start, end, 2);
    expect(endMs - startMs).toBeGreaterThan(end - start);
  });

  it('preserves center after zoom', () => {
    const center = (start + end) / 2;
    const { startMs, endMs } = zoomRange(start, end, 0.5);
    expect((startMs + endMs) / 2).toBeCloseTo(center, -3);
  });

  it('clamps result when zoom would exceed MAX_SPAN_MS', () => {
    const { startMs, endMs } = zoomRange(start, end, 1e12);
    expect(endMs - startMs).toBe(MAX_SPAN_MS);
  });

  it('clamps result when zoom would go below MIN_SPAN_MS', () => {
    const { startMs, endMs } = zoomRange(start, end, 1e-12);
    expect(endMs - startMs).toBe(MIN_SPAN_MS);
  });
});

// ── zoomAroundMs ──────────────────────────────────────────────────────────────

describe('zoomAroundMs', () => {
  const start = 1_000_000_000_000;
  const end   = start + 3_600_000; // 1-hour window

  it('keeps pivot at the same fractional position after zoom in', () => {
    const pivot    = start + 900_000; // 25% into the range
    const fraction = (pivot - start) / (end - start);
    const { startMs, endMs } = zoomAroundMs(start, end, 0.5, pivot);
    const newFraction = (pivot - startMs) / (endMs - startMs);
    expect(newFraction).toBeCloseTo(fraction, 5);
  });

  it('keeps pivot at the same fractional position after zoom out', () => {
    const pivot    = start + 2_700_000; // 75% into the range
    const fraction = (pivot - start) / (end - start);
    const { startMs, endMs } = zoomAroundMs(start, end, 2, pivot);
    const newFraction = (pivot - startMs) / (endMs - startMs);
    expect(newFraction).toBeCloseTo(fraction, 5);
  });

  it('reduces span when zooming in', () => {
    const { startMs, endMs } = zoomAroundMs(start, end, 0.5, (start + end) / 2);
    expect(endMs - startMs).toBeLessThan(end - start);
  });

  it('clamps result when zoom would exceed MAX_SPAN_MS', () => {
    const { startMs, endMs } = zoomAroundMs(start, end, 1e12, (start + end) / 2);
    expect(endMs - startMs).toBe(MAX_SPAN_MS);
  });

  it('clamps result when zoom would go below MIN_SPAN_MS', () => {
    const { startMs, endMs } = zoomAroundMs(start, end, 1e-12, (start + end) / 2);
    expect(endMs - startMs).toBe(MIN_SPAN_MS);
  });
});

// ── calcEpochMs ───────────────────────────────────────────────────────────────

describe('calcEpochMs', () => {
  const DAY_MS = 86_400_000;
  const startMs = Date.UTC(2026, 1, 24, 14, 30, 0); // mid-day UTC

  it('returns start-of-day in UTC for sub-day duration', () => {
    const epoch = calcEpochMs(startMs, 3600, 'UTC');
    expect(epoch).toBe(Date.UTC(2026, 1, 24, 0, 0, 0));
  });

  it('returns start-of-year in UTC for year-range duration', () => {
    const epoch = calcEpochMs(startMs, 200_000_000, 'UTC');
    // calcEpochMs snaps to Jan 1 of the epoch year — verify it is Jan 1 at midnight UTC
    const d = new Date(epoch);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
  });

  it('returns a number (does not throw) for local timezone', () => {
    const epoch = calcEpochMs(startMs, DAY_MS * 2);
    expect(typeof epoch).toBe('number');
  });
});

// ── resolveItemStyle ──────────────────────────────────────────────────────────

describe('resolveItemStyle', () => {
  const baseLane = { id: 'l1', label: 'L1', items: [] };
  const baseItem = { id: 'i1' };

  it('uses item style over lane style', () => {
    const lane = { ...baseLane, style: { color: 'laneColor' } };
    const item = { ...baseItem, style: { color: 'itemColor' } };
    expect(resolveItemStyle(lane, item).color).toBe('itemColor');
  });

  it('falls back to lane style when item has no override', () => {
    const lane = { ...baseLane, style: { color: 'laneColor' } };
    expect(resolveItemStyle(lane, baseItem).color).toBe('laneColor');
  });

  it('falls back to defaultSwimLaneStyle when neither item nor lane specifies', () => {
    expect(resolveItemStyle(baseLane, baseItem).color).toBe(defaultSwimLaneStyle.color);
  });

  it('uses theme swimLaneItemBorderColor when lane/item border omitted', () => {
    const theme = { ...defaultTheme, swimLaneItemBorderColor: '#ff0000' };
    expect(resolveItemStyle(baseLane, baseItem, theme).borderColor).toBe('#ff0000');
  });
});

// ── totalSwimLaneHeight ───────────────────────────────────────────────────────

describe('totalSwimLaneHeight', () => {
  it('returns 0 for empty array', () => {
    expect(totalSwimLaneHeight([])).toBe(0);
  });

  it('uses DEFAULT_LANE_HEIGHT when height not specified', () => {
    const lanes = [{ id: 'a', label: 'A', items: [] }];
    expect(totalSwimLaneHeight(lanes)).toBe(DEFAULT_LANE_HEIGHT + 1); // +LANE_GAP=1
  });

  it('uses custom height when specified', () => {
    const lanes = [{ id: 'a', label: 'A', items: [], height: 40 }];
    expect(totalSwimLaneHeight(lanes)).toBe(41); // 40 + LANE_GAP=1
  });

  it('sums multiple lanes', () => {
    const lanes = [
      { id: 'a', label: 'A', items: [], height: 30 },
      { id: 'b', label: 'B', items: [], height: 20 },
    ];
    expect(totalSwimLaneHeight(lanes)).toBe(52); // 30+1 + 20+1
  });
});

// ── hitTestSwimLane ───────────────────────────────────────────────────────────

describe('hitTestSwimLane', () => {
  const startMs = 0;
  const endMs   = 10_000;
  const canvasW = 1000;
  const canvasH = 200;

  function makeState(showSwimLanes = true) {
    const start = Cesium.JulianDate.fromDate(new Date(1000));
    const stop  = Cesium.JulianDate.fromDate(new Date(5000));
    return {
      swimLanes: [{
        id: 'l1', label: 'L1',
        items: [{ id: 'i1', interval: { start, stop, isSimple: true } as Cesium.TimeInterval }],
      }],
      showSwimLanes,
      scrollTop: 0,
      startMs,
      endMs,
      theme: defaultTheme,
    };
  }

  it('returns null when showSwimLanes=false', () => {
    expect(hitTestSwimLane(100, 5, canvasW, canvasH, makeState(false))).toBeNull();
  });

  it('returns null when click is in tick area (y >= canvasH - TICK_AREA_HEIGHT)', () => {
    const y = canvasH - TICK_AREA_HEIGHT;
    expect(hitTestSwimLane(100, y, canvasW, canvasH, makeState())).toBeNull();
  });

  it('hits an interval item when x is within its time range', () => {
    // item spans 1000–5000ms → x = 100–500 at full width 1000
    const result = hitTestSwimLane(300, 5, canvasW, canvasH, makeState());
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('i1');
  });

  it('misses when x is outside the interval', () => {
    expect(hitTestSwimLane(800, 5, canvasW, canvasH, makeState())).toBeNull();
  });
});

// ── hitTestLaneLabel ──────────────────────────────────────────────────────────

describe('hitTestLaneLabel', () => {
  const state = {
    swimLanes: [{ id: 'l1', label: 'L1', items: [], height: 40 }],
    showSwimLanes: true,
    scrollTop: 0,
  };
  const canvasH = 200;

  it('hits the label when x <= 80 and y is within the lane', () => {
    expect(hitTestLaneLabel(40, 10, canvasH, state)).not.toBeNull();
  });

  it('returns null when x > 80', () => {
    expect(hitTestLaneLabel(90, 10, canvasH, state)).toBeNull();
  });

  it('returns null when y is in the tick area', () => {
    expect(hitTestLaneLabel(40, canvasH - TICK_AREA_HEIGHT + 1, canvasH, state)).toBeNull();
  });

  it('returns null when showSwimLanes=false', () => {
    expect(hitTestLaneLabel(40, 10, canvasH, { ...state, showSwimLanes: false })).toBeNull();
  });
});

// ── isInSwimLaneRegion ────────────────────────────────────────────────────────

describe('isInSwimLaneRegion', () => {
  const state = {
    swimLanes: [{ id: 'l1', label: 'L1', items: [] }],
    showSwimLanes: true,
  };
  const canvasH = 200;

  it('returns true when y is in the lane area', () => {
    expect(isInSwimLaneRegion(10, canvasH, state)).toBe(true);
  });

  it('returns false when y is in the tick area', () => {
    expect(isInSwimLaneRegion(canvasH - TICK_AREA_HEIGHT + 1, canvasH, state)).toBe(false);
  });

  it('returns false when showSwimLanes=false', () => {
    expect(isInSwimLaneRegion(10, canvasH, { ...state, showSwimLanes: false })).toBe(false);
  });
});

// ── drawTimeline (smoke test) ─────────────────────────────────────────────────

describe('drawTimeline', () => {
  const baseState = {
    startMs: REF_MS - 3_600_000,
    endMs:   REF_MS + 3_600_000,
    currentMs: REF_MS,
    theme: defaultTheme,
    swimLanes: [],
    showSwimLanes: false,
    scrollTop: 0,
    reorderState: null,
  };

  it('does not throw and returns a number (scrollTop)', () => {
    const ctx = makeCtx();
    const result = drawTimeline(ctx, 800, 200, baseState);
    expect(typeof result).toBe('number');
  });

  it('calls fillRect for background', () => {
    const ctx = makeCtx();
    drawTimeline(ctx, 800, 200, baseState);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('uses 12h labels without throwing', () => {
    const ctx = makeCtx();
    expect(() => drawTimeline(ctx, 800, 200, { ...baseState, use12h: true })).not.toThrow();
  });

  it('uses custom months without throwing', () => {
    const ctx = makeCtx();
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    expect(() => drawTimeline(ctx, 800, 200, { ...baseState, months })).not.toThrow();
  });

  it('returns 0 when duration is zero or negative', () => {
    const ctx = makeCtx();
    expect(drawTimeline(ctx, 800, 200, { ...baseState, startMs: 100, endMs: 100 })).toBe(0);
  });
});
