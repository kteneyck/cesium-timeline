import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleChange } from '@angular/core';
import { TimelineComponent } from './timeline.component';
import * as Cesium from 'cesium';

vi.mock('cesium', () => {
  const dates = new Map<number, Date>();
  let nextId = 1;
  class JulianDate {
    _id: number;
    constructor(d?: Date) { this._id = nextId++; if (d) dates.set(this._id, d); }
    static fromDate(d: Date) { return new JulianDate(d); }
    static toDate(jd: JulianDate) { return dates.get(jd._id) ?? new Date(0); }
    static clone(jd: JulianDate) { return JulianDate.fromDate(JulianDate.toDate(jd)); }
  }

  class TickEvent {
    private listeners: Array<(c: unknown) => void> = [];
    addEventListener(fn: (c: unknown) => void) { this.listeners.push(fn); }
    removeEventListener(fn: (c: unknown) => void) { this.listeners = this.listeners.filter(l => l !== fn); }
    fire() { this.listeners.forEach(l => l(null)); }
  }

  class Clock {
    shouldAnimate = false;
    multiplier = 1;
    currentTime = new JulianDate(new Date());
    onTick = new TickEvent();
  }

  return { JulianDate, Clock };
});

describe('TimelineComponent', () => {
  let fixture: ComponentFixture<TimelineComponent>;
  let component: TimelineComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('renders without crashing', () => {
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders canvas element', () => {
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  it('isLive is true by default (currentTime ≈ now)', () => {
    expect(component.isLive).toBe(true);
  });

  it('isLive is false when currentTimeState is in the past', () => {
    component.currentTimeState = Cesium.JulianDate.fromDate(new Date(Date.now() - 60_000));
    expect(component.isLive).toBe(false);
  });

  it('handleFastForward cycles through ffSpeeds', () => {
    const spy = vi.spyOn(component.multiplierChange, 'emit');
    component.ffSpeeds = [2, 4, 8];
    component.handleFastForward(); // from multiplier=1 → next=2
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('handleFastForward wraps at end of ffSpeeds', () => {
    const spy = vi.spyOn(component.multiplierChange, 'emit');
    component.ffSpeeds = [2, 1];
    component.handleFastForward(); // → 2
    component.handleFastForward(); // 2 is at idx 0 → next idx 1 = 1
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it('handleRewindSpeed produces negative multiplier', () => {
    const spy = vi.spyOn(component.multiplierChange, 'emit');
    component.rwSpeeds = [1, 2, 4];
    component.handleRewindSpeed();
    expect(spy).toHaveBeenCalledWith(-1);
  });

  it('handleJumpToLive preserves zoom span', () => {
    // Set a narrow zoom via canvasComp if available
    if (component.canvasComp) {
      const narrow = 1_800_000; // 30 min
      const now = Date.now();
      component.canvasComp.zoomTo(now - narrow / 2, now + narrow / 2);
    }
    expect(() => component.handleJumpToLive()).not.toThrow();
    // After jump, canvasComp should have a span that is not hardcoded 24h
    if (component.canvasComp) {
      const { startMs, endMs } = component.canvasComp.getVisibleRange();
      expect(endMs - startMs).toBeLessThanOrEqual(3_600_000);
    }
  });

  it('ngOnChanges with showSwimLanes updates swimLanesExpanded', () => {
    component.showSwimLanes = false;
    component.ngOnChanges({
      showSwimLanes: new SimpleChange(undefined, false, false),
    });
    expect(component.swimLanesExpanded).toBe(false);
  });

  it('handleToggleSwimLanes emits showSwimLanesChange', () => {
    const emitted: boolean[] = [];
    component.showSwimLanesChange.subscribe((v: boolean) => emitted.push(v));
    const was = component.swimLanesExpanded;
    component.handleToggleSwimLanes();
    expect(emitted[0]).toBe(!was);
  });

  it('applyMultiplier updates multiplierState', () => {
    component.applyMultiplier(4, false);
    expect(component.multiplierState).toBe(4);
  });

  it('ngOnDestroy does not throw', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
