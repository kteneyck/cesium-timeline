import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimelineCanvas, TimelineCanvasHandle } from './TimelineCanvas';
import { defaultTheme, MIN_SPAN_MS, MAX_SPAN_MS } from '@kteneyck/cesium-timeline-core';
import * as Cesium from 'cesium';

// Capture the state the engine is actually asked to render, so needle position
// can be asserted (there is no public getter for it).
const { drawStates } = vi.hoisted(() => ({
  drawStates: [] as Array<{ startMs: number; endMs: number; currentMs: number }>,
}));

vi.mock('@kteneyck/cesium-timeline-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kteneyck/cesium-timeline-core')>();
  return {
    ...actual,
    drawTimeline: (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      state: Parameters<typeof actual.drawTimeline>[3],
    ) => {
      drawStates.push({ startMs: state.startMs, endMs: state.endMs, currentMs: state.currentMs });
      return actual.drawTimeline(ctx, w, h, state);
    },
  };
});

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

  describe('restrictToRange', () => {
    const limitStartMs = REF_MS - 3_600_000;
    const limitEndMs   = REF_MS + 3_600_000;

    it('clamps zoomTo to the configured limits', () => {
      const { handle } = renderCanvas({ restrictToRange: true, limitStartMs, limitEndMs });
      act(() => {
        // Recenter around a pivot near the end limit with the full-range span —
        // mirrors the needle auto-scroll recenter that pushes 10% past an edge.
        handle.current!.zoomTo(limitEndMs - 100_000, limitEndMs + 7_100_000);
      });
      const { startMs, endMs } = handle.current!.getVisibleRange();
      expect(startMs).toBe(limitStartMs);
      expect(endMs).toBe(limitEndMs);
    });

    it('never renders the needle outside the limits', () => {
      const { handle } = renderCanvas({ restrictToRange: true, limitStartMs, limitEndMs });
      drawStates.length = 0;
      act(() => {
        handle.current!.zoomTo(limitStartMs, limitEndMs, limitEndMs + 7_200_000);
      });
      const last = drawStates[drawStates.length - 1];
      expect(last.currentMs).toBe(limitEndMs);
    });

    // Regression test: follow-scroll advances currentMs alongside the window.
    // Once the window pins against a limit the needle must stop with it rather
    // than walking off the pinned window and drawing off-canvas.
    it('clamps the needle to the limits during follow-scroll', () => {
      const { handle } = renderCanvas({ restrictToRange: true, limitStartMs, limitEndMs });
      act(() => {
        handle.current!.zoomTo(limitEndMs - 600_000, limitEndMs, limitEndMs - 1_000);
      });

      act(() => { handle.current!.startFollow(1); });
      act(() => { handle.current!.correctFollow(limitEndMs + 3_600_000); });
      act(() => { handle.current!.stopFollow(); });

      drawStates.length = 0;
      act(() => { handle.current!.zoomTo(limitEndMs - 600_000, limitEndMs); });

      const last = drawStates[drawStates.length - 1];
      expect(last.currentMs).toBeLessThanOrEqual(limitEndMs);
      expect(last.currentMs).toBeGreaterThanOrEqual(limitStartMs);
    });

    // Regression test: the needle auto-scroll recenter (Timeline.tsx's 10%/90%
    // threshold) can shift the visible window before `restrictToRange` takes
    // effect (e.g. it flips from false to true, or the limits are set after the
    // fact). Nothing should leave the window permanently out of bounds once
    // restrictToRange/limits are in effect — draw() must self-correct.
    it('self-corrects an out-of-bounds window when restrictToRange turns on', () => {
      const { handle, rerender } = renderCanvas();
      act(() => {
        // Simulate a shift that happened while restrictToRange was off.
        handle.current!.zoomTo(limitEndMs - 100_000, limitEndMs + 7_100_000);
      });
      const before = handle.current!.getVisibleRange();
      expect(before.endMs).toBeGreaterThan(limitEndMs);

      act(() => {
        rerender(
          <TimelineCanvas
            ref={handle}
            currentTime={Cesium.JulianDate.fromDate(new Date(REF_MS))}
            defaultStartMs={REF_MS - 3_600_000}
            defaultEndMs={REF_MS + 3_600_000}
            theme={defaultTheme}
            onTimeChange={vi.fn()}
            restrictToRange={true}
            limitStartMs={limitStartMs}
            limitEndMs={limitEndMs}
          />
        );
      });

      const after = handle.current!.getVisibleRange();
      expect(after.startMs).toBe(limitStartMs);
      expect(after.endMs).toBe(limitEndMs);
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
