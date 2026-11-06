import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimelineCanvasComponent } from './timeline-canvas.component';
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

describe('TimelineCanvasComponent', () => {
  let fixture: ComponentFixture<TimelineCanvasComponent>;
  let component: TimelineCanvasComponent;

  function setInputs(overrides: Partial<TimelineCanvasComponent> = {}) {
    component.currentTime = Cesium.JulianDate.fromDate(new Date(REF_MS));
    component.defaultStartMs = REF_MS - 3_600_000;
    component.defaultEndMs   = REF_MS + 3_600_000;
    component.theme = defaultTheme;
    Object.assign(component, overrides);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineCanvasComponent);
    component = fixture.componentInstance;
  });

  it('renders canvas element', () => {
    setInputs();
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  describe('zoomTo / getVisibleRange', () => {
    it('round-trips a valid range', () => {
      setInputs();
      component.zoomTo(REF_MS - 1_800_000, REF_MS + 1_800_000);
      const { startMs, endMs } = component.getVisibleRange();
      expect(endMs - startMs).toBe(3_600_000);
    });

    it('clamps span to MIN_SPAN_MS', () => {
      setInputs();
      component.zoomTo(REF_MS, REF_MS + 1);
      const { startMs, endMs } = component.getVisibleRange();
      expect(endMs - startMs).toBe(MIN_SPAN_MS);
    });

    it('clamps span to MAX_SPAN_MS', () => {
      setInputs();
      component.zoomTo(REF_MS - MAX_SPAN_MS * 2, REF_MS + MAX_SPAN_MS * 2);
      const { startMs, endMs } = component.getVisibleRange();
      expect(endMs - startMs).toBe(MAX_SPAN_MS);
    });
  });

  describe('restrictToRange', () => {
    const limitStartMs = REF_MS - 3_600_000;
    const limitEndMs   = REF_MS + 3_600_000;

    it('clamps zoomTo to the configured limits', () => {
      setInputs({ restrictToRange: true, limitStartMs, limitEndMs });
      // Recenter around a pivot near the end limit with the full-range span —
      // mirrors the needle auto-scroll recenter that pushes 10% past an edge.
      component.zoomTo(limitEndMs - 100_000, limitEndMs + 7_100_000);
      const { startMs, endMs } = component.getVisibleRange();
      expect(startMs).toBe(limitStartMs);
      expect(endMs).toBe(limitEndMs);
    });

    // Regression test: the needle auto-scroll recenter (timeline.component.ts's
    // 10%/90% threshold) can shift the visible window before `restrictToRange`
    // takes effect (e.g. it flips from false to true, or the limits are set
    // after the fact). Nothing should leave the window permanently out of
    // bounds once restrictToRange/limits are in effect — draw() must self-correct.
    it('self-corrects an out-of-bounds window when restrictToRange turns on', () => {
      setInputs();
      // Simulate a shift that happened while restrictToRange was off.
      component.zoomTo(limitEndMs - 100_000, limitEndMs + 7_100_000);
      const before = component.getVisibleRange();
      expect(before.endMs).toBeGreaterThan(limitEndMs);

      component.restrictToRange = true;
      component.limitStartMs = limitStartMs;
      component.limitEndMs = limitEndMs;
      component.ngOnChanges({
        restrictToRange: new SimpleChange(false, true, false),
      });

      const after = component.getVisibleRange();
      expect(after.startMs).toBe(limitStartMs);
      expect(after.endMs).toBe(limitEndMs);
    });
  });

  describe('@Input() changes', () => {
    it('updating dateTimeFormat to 12h does not throw', () => {
      setInputs({ dateTimeFormat: 'HH:mm' });
      expect(() => {
        component.dateTimeFormat = 'hh:mm a';
        fixture.detectChanges();
      }).not.toThrow();
    });

    it('updating months does not throw', () => {
      setInputs();
      const fr = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      expect(() => {
        component.months = fr;
        fixture.detectChanges();
      }).not.toThrow();
    });
  });

  describe('swim lane methods', () => {
    it('appendSwimLane does not throw', () => {
      setInputs();
      expect(() => {
        component.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
      }).not.toThrow();
    });

    it('removeSwimLane does not throw', () => {
      setInputs();
      component.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
      expect(() => component.removeSwimLane('l1')).not.toThrow();
    });

    it('updateSwimLane patches label (does not throw)', () => {
      setInputs();
      component.appendSwimLane({ id: 'l1', label: 'Lane 1', items: [] });
      expect(() => component.updateSwimLane('l1', { label: 'Updated' })).not.toThrow();
    });

    it('reorderSwimLanes does not throw', () => {
      setInputs();
      component.appendSwimLane({ id: 'a', label: 'A', items: [] });
      component.appendSwimLane({ id: 'b', label: 'B', items: [] });
      expect(() => component.reorderSwimLanes(['b', 'a'])).not.toThrow();
    });
  });

  describe('single click in tick area', () => {
    function tickAreaMouseEvent(canvas: HTMLCanvasElement): MouseEvent {
      const rect = canvas.getBoundingClientRect();
      return {
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height - 2,
        preventDefault: () => {},
      } as MouseEvent;
    }

    it('moves the needle when not in live mode', () => {
      setInputs();
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      const spy = vi.fn();
      component.timeChange.subscribe(spy);

      component.onCanvasMouseDown(tickAreaMouseEvent(canvas));
      // simulate mouseup with no drag
      (component as unknown as { onDocMouseUp(): void }).onDocMouseUp();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not move the needle in live mode', () => {
      setInputs({ disableNeedleDrag: true });
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      const spy = vi.fn();
      component.timeChange.subscribe(spy);

      component.onCanvasMouseDown(tickAreaMouseEvent(canvas));
      (component as unknown as { onDocMouseUp(): void }).onDocMouseUp();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('ngOnDestroy cleans up without throwing', () => {
    setInputs();
    expect(() => fixture.destroy()).not.toThrow();
  });

  // The canvas is 800×200 px showing REF_MS ± 1 h, so one pixel is 9 000 ms.
  // The needle sits at x = 400 and wins presses near it, so the item is half an
  // hour later, at x = 600. The lane occupies y 0–24.
  describe('swim-lane item drag', () => {
    const MS_PER_PX = 9_000;

    function setup(draggable = true, overrides: Partial<TimelineCanvasComponent> = {}) {
      setInputs({
        swimLanes: [{
          id: 'lane',
          label: 'Lane',
          items: [{ id: 'k', instant: Cesium.JulianDate.fromDate(new Date(REF_MS + 1_800_000)), draggable }],
        }],
        showSwimLanes: true,
        ...overrides,
      });
      const canvas: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
      const starts = vi.fn(), moves = vi.fn(), ends = vi.fn(), clicks = vi.fn();
      component.swimLaneItemDragStart.subscribe(starts);
      component.swimLaneItemDrag.subscribe(moves);
      component.swimLaneItemDragEnd.subscribe(ends);
      component.swimLaneItemClick.subscribe(clicks);
      return { canvas, starts, moves, ends, clicks };
    }

    const press = (canvas: HTMLCanvasElement, x: number) =>
      canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: x, clientY: 12, bubbles: true }));
    const moveTo = (x: number) =>
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 12 }));
    const release = (x: number) =>
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: 12 }));

    it('reports the offset while dragging and on the drop', () => {
      const { canvas, starts, moves, ends } = setup();
      press(canvas, 600);
      moveTo(650);
      expect(starts).toHaveBeenCalledTimes(1);
      expect(moves).toHaveBeenLastCalledWith(expect.objectContaining({ laneId: 'lane', deltaMs: 50 * MS_PER_PX }));
      release(650);
      expect(ends).toHaveBeenCalledWith(expect.objectContaining({ deltaMs: 50 * MS_PER_PX, cancelled: false }));
    });

    it('treats a press that barely moves as a click', () => {
      const { canvas, starts, ends, clicks } = setup();
      press(canvas, 600);
      moveTo(601);
      release(601);
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 601, clientY: 12, bubbles: true }));
      expect(starts).not.toHaveBeenCalled();
      expect(ends).not.toHaveBeenCalled();
      expect(clicks).toHaveBeenCalledTimes(1);
    });

    it('does not report a click after a drag', () => {
      const { canvas, clicks } = setup();
      press(canvas, 600);
      moveTo(660);
      release(660);
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 660, clientY: 12, bubbles: true }));
      expect(clicks).not.toHaveBeenCalled();
    });

    it('uses the offset constrainSwimLaneItemDrag returns', () => {
      const { canvas, ends } = setup(true, { constrainSwimLaneItemDrag: () => 1234 });
      press(canvas, 600);
      moveTo(700);
      release(700);
      expect(ends).toHaveBeenCalledWith(expect.objectContaining({ deltaMs: 1234 }));
    });

    it('cancels on Escape', () => {
      const { canvas, ends } = setup();
      press(canvas, 600);
      moveTo(650);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(ends).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }));
      release(650);
      expect(ends).toHaveBeenCalledTimes(1);
    });

    it('lets allowSwimLaneItemDrag refuse a drag', () => {
      const { canvas, starts, moves, ends } = setup(true, { allowSwimLaneItemDrag: () => false });
      press(canvas, 600);
      moveTo(650);
      release(650);
      expect(starts).not.toHaveBeenCalled();
      expect(moves).not.toHaveBeenCalled();
      expect(ends).not.toHaveBeenCalled();
    });

    it('ignores items that are not draggable', () => {
      const { canvas, starts, ends } = setup(false);
      press(canvas, 600);
      moveTo(650);
      release(650);
      expect(starts).not.toHaveBeenCalled();
      expect(ends).not.toHaveBeenCalled();
    });
  });
});
