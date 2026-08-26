import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
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

  // The canvas is mocked at 800 × 200 in test-setup; the tick area is the
  // bottom TICK_AREA_HEIGHT pixels and the needle sits at x = 400.
  describe('forced live mode (disableNeedleDrag)', () => {
    const TICK_Y = 190;
    const LANE_Y = 60;

    function click(canvas: Element, clientX: number, clientY: number) {
      act(() => {
        fireEvent.mouseDown(canvas, { button: 0, clientX, clientY });
        fireEvent.mouseUp(document);
      });
    }

    function drag(canvas: Element, clientX: number, clientY: number, dx: number) {
      act(() => {
        fireEvent.mouseDown(canvas, { button: 0, clientX, clientY });
        fireEvent.mouseMove(document, { clientX: clientX + dx, clientY });
        fireEvent.mouseUp(document);
      });
    }

    it('a click in the tick area moves the needle when not live', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange });
      click(container.querySelector('canvas')!, 200, TICK_Y);
      expect(onTimeChange).toHaveBeenCalled();
    });

    it('a click in the tick area leaves the time alone in live mode', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange, disableNeedleDrag: true });
      click(container.querySelector('canvas')!, 200, TICK_Y);
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('a click above the tick area leaves the time alone in live mode', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange, disableNeedleDrag: true });
      click(container.querySelector('canvas')!, 200, LANE_Y);
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('a click on the needle leaves the time alone in live mode', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange, disableNeedleDrag: true });
      click(container.querySelector('canvas')!, 400, LANE_Y);
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('a drag leaves the time alone in live mode', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange, disableNeedleDrag: true });
      drag(container.querySelector('canvas')!, 200, TICK_Y, 150);
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('a single-finger touch leaves the time alone in live mode', () => {
      const onTimeChange = vi.fn();
      const { container } = renderCanvas({ onTimeChange, disableNeedleDrag: true });
      const canvas = container.querySelector('canvas')!;
      const touch = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(touch, 'touches', { value: [{ clientX: 200, clientY: LANE_Y }] });
      act(() => { canvas.dispatchEvent(touch); });
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('a scrub already in flight stops when live mode turns on', () => {
      const onTimeChange = vi.fn();
      const { container, handle } = renderCanvas({ onTimeChange });
      const canvas = container.querySelector('canvas')!;
      act(() => { fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: LANE_Y }); });
      expect(onTimeChange).toHaveBeenCalled();

      act(() => {
        render(
          <TimelineCanvas
            ref={handle}
            currentTime={Cesium.JulianDate.fromDate(new Date(REF_MS))}
            defaultStartMs={REF_MS - 3_600_000}
            defaultEndMs={REF_MS + 3_600_000}
            theme={defaultTheme}
            onTimeChange={onTimeChange}
            disableNeedleDrag
          />,
          { container }
        );
      });
      onTimeChange.mockClear();
      act(() => {
        fireEvent.mouseMove(document, { clientX: 300, clientY: LANE_Y });
        fireEvent.mouseUp(document);
      });
      expect(onTimeChange).not.toHaveBeenCalled();
    });

    it('pointer jitter during a click does not turn it into a range-select zoom', () => {
      const onTimeChange = vi.fn();
      const { container, handle } = renderCanvas({ onTimeChange });
      const before = handle.current!.getVisibleRange();
      drag(container.querySelector('canvas')!, 200, TICK_Y, 4);
      expect(handle.current!.getVisibleRange()).toEqual(before);
      expect(onTimeChange).toHaveBeenCalled();
    });
  });
});
