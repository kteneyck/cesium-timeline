import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('ngOnDestroy cleans up without throwing', () => {
    setInputs();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
