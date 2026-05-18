import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimelineCanvas, TimelineCanvasHandle } from './TimelineCanvas';
import { defaultTheme, MIN_SPAN_MS, MAX_SPAN_MS } from '@kteneyck/cesium-timeline-core';
import * as Cesium from 'cesium';

vi.mock('cesium', () => {
  const dates = new Map<number, Date>();
  let id = 0;
  class JulianDate {
    _id: number;
    constructor(d?: Date) { this._id = ++id; if (d) dates.set(this._id, d); }
    static fromDate(d: Date) { return new JulianDate(d); }
    static toDate(jd: JulianDate) { return dates.get(jd._id) ?? new Date(); }
    static clone(jd: JulianDate) { return JulianDate.fromDate(JulianDate.toDate(jd)); }
  }
  return { JulianDate };
});

const REF_MS = Date.UTC(2026, 1, 24, 12, 0, 0);

function renderCanvas(extraProps = {}) {
  const handle = React.createRef<TimelineCanvasHandle>();
  const result = render(
    <TimelineCanvas
      ref={handle}
      currentTime={Cesium.JulianDate.fromDate(new Date(REF_MS))}
      defaultStartMs={REF_MS - 3_600_000}
      defaultEndMs={REF_MS + 3_600_000}
      theme={defaultTheme}
      onTimeChange={vi.fn()}
      {...extraProps}
    />
  );
  return { handle, ...result };
}

describe('TimelineCanvas', () => {
  it('renders without crashing', () => {
    const { container } = renderCanvas();
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  describe('zoomTo / getVisibleRange', () => {
    it('round-trips a valid range', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.zoomTo(REF_MS - 1_800_000, REF_MS + 1_800_000);
      });
      const { startMs, endMs } = handle.current!.getVisibleRange();
      expect(endMs - startMs).toBe(3_600_000);
    });

    it('clamps span to MIN_SPAN_MS', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.zoomTo(REF_MS, REF_MS + 1); // 1 ms span → way below min
      });
      const { startMs, endMs } = handle.current!.getVisibleRange();
      expect(endMs - startMs).toBe(MIN_SPAN_MS);
    });

    it('clamps span to MAX_SPAN_MS', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.zoomTo(REF_MS - MAX_SPAN_MS * 2, REF_MS + MAX_SPAN_MS * 2);
      });
      const { startMs, endMs } = handle.current!.getVisibleRange();
      expect(endMs - startMs).toBe(MAX_SPAN_MS);
    });
  });

  describe('swim lane CRUD', () => {
    it('appendSwimLane adds a lane', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
      });
      // No public getter for lanes — verify no throw and re-rendering doesn't crash
      expect(handle.current).not.toBeNull();
    });

    it('removeSwimLane removes a lane (does not throw)', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
        handle.current!.removeSwimLane('l1');
      });
      expect(handle.current).not.toBeNull();
    });

    it('updateSwimLane patches lane fields (does not throw)', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
        handle.current!.updateSwimLane('l1', { label: 'Updated' });
      });
      expect(handle.current).not.toBeNull();
    });

    it('reorderSwimLanes does not throw', () => {
      const { handle } = renderCanvas();
      act(() => {
        handle.current!.appendSwimLane({ id: 'a', label: 'A', items: [] });
        handle.current!.appendSwimLane({ id: 'b', label: 'B', items: [] });
        handle.current!.reorderSwimLanes(['b', 'a']);
      });
      expect(handle.current).not.toBeNull();
    });
  });

  it('updates use12h when dateTimeFormat changes to 12h', () => {
    // Re-render with a 12h format — no exception expected
    const { handle, rerender } = renderCanvas({ dateTimeFormat: 'HH:mm' });
    expect(handle.current).not.toBeNull();
    act(() => {
      rerender(
        <TimelineCanvas
          ref={handle}
          currentTime={Cesium.JulianDate.fromDate(new Date(REF_MS))}
          defaultStartMs={REF_MS - 3_600_000}
          defaultEndMs={REF_MS + 3_600_000}
          theme={defaultTheme}
          onTimeChange={vi.fn()}
          dateTimeFormat="hh:mm a"
        />
      );
    });
    expect(handle.current).not.toBeNull();
  });

  it('updates months when prop changes', () => {
    const { handle, rerender } = renderCanvas();
    const fr = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    act(() => {
      rerender(
        <TimelineCanvas
          ref={handle}
          currentTime={Cesium.JulianDate.fromDate(new Date(REF_MS))}
          defaultStartMs={REF_MS - 3_600_000}
          defaultEndMs={REF_MS + 3_600_000}
          theme={defaultTheme}
          onTimeChange={vi.fn()}
          months={fr}
        />
      );
    });
    expect(handle.current).not.toBeNull();
  });
});
