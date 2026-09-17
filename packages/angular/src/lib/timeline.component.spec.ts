import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, SimpleChange } from '@angular/core';
import { By } from '@angular/platform-browser';
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

/** Host that binds the inputs through a template, the way a consumer does. */
@Component({
  standalone: true,
  imports: [TimelineComponent],
  template: `<ct-timeline
    [startTime]="startTime"
    [endTime]="endTime"
    [restrictToRange]="true"
  />`,
})
class HostComponent {
  startTime?: Cesium.JulianDate;
  endTime?: Cesium.JulianDate;
}

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

  it('ngOnChanges jumps to now when live is toggled on', () => {
    component.currentTimeState = Cesium.JulianDate.fromDate(new Date(Date.now() - 3_600_000));
    expect(component.isLive).toBe(false);
    component.live = true;
    component.ngOnChanges({
      live: new SimpleChange(false, true, false),
    });
    expect(component.isLive).toBe(true);
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

  describe('restrictToRange — lifecycle ordering', () => {
    const T0 = Date.UTC(2026, 1, 24, 12, 0, 0);

    // Angular runs ngOnChanges BEFORE ngOnInit, so on the first pass
    // defaultStartMs/defaultEndMs are still their field initializers (0).
    // A first-render jumpToTime must not be clamped against those.
    it('does not clamp a first-render jumpToTime to the epoch', () => {
      const fresh = TestBed.createComponent(TimelineComponent);
      const c = fresh.componentInstance;
      const target = T0 + 1_800_000;

      c.restrictToRange = true;
      c.startTime = Cesium.JulianDate.fromDate(new Date(T0));
      c.endTime   = Cesium.JulianDate.fromDate(new Date(T0 + 3_600_000));
      c.jumpToTime = Cesium.JulianDate.fromDate(new Date(target));

      const emitted: Cesium.JulianDate[] = [];
      c.timeChange.subscribe((t: Cesium.JulianDate) => emitted.push(t));

      c.ngOnChanges({
        startTime:  new SimpleChange(undefined, c.startTime, true),
        endTime:    new SimpleChange(undefined, c.endTime, true),
        jumpToTime: new SimpleChange(undefined, c.jumpToTime, true),
      });

      expect(emitted.length).toBe(1);
      expect(Cesium.JulianDate.toDate(emitted[0]).getTime()).toBe(target);
      fresh.destroy();
    });

    // Driven through a real host binding: the parent calls canvasComp.zoomTo()
    // inside its own ngOnChanges, before Angular propagates the new
    // [limitStartMs]/[limitEndMs] bindings down to the child — so the new range
    // must not be clamped against the previous limits.
    it('sizes the window from the new limits when startTime/endTime are rebound', () => {
      const host = TestBed.createComponent(HostComponent);
      host.componentInstance.startTime = Cesium.JulianDate.fromDate(new Date(T0));
      host.componentInstance.endTime   = Cesium.JulianDate.fromDate(new Date(T0 + 3_600_000));
      host.detectChanges();

      const timeline: TimelineComponent =
        host.debugElement.query(By.directive(TimelineComponent)).componentInstance;
      timeline.canvasComp!.zoomTo(T0, T0 + 3_600_000);

      // Rebind to a later, wider window.
      const newStart = T0 + 10 * 3_600_000;
      const newEnd   = T0 + 12 * 3_600_000;
      host.componentInstance.startTime = Cesium.JulianDate.fromDate(new Date(newStart));
      host.componentInstance.endTime   = Cesium.JulianDate.fromDate(new Date(newEnd));
      // Zoneless: field mutation doesn't mark the host dirty on its own.
      host.componentRef.changeDetectorRef.markForCheck();
      host.detectChanges();

      const { startMs, endMs } = timeline.canvasComp!.getVisibleRange();
      expect(endMs - startMs).toBe(2 * 3_600_000);
      expect(startMs).toBe(newStart);
      expect(endMs).toBe(newEnd);
      host.destroy();
    });
  });

  describe('restrictToRange — needle clamping', () => {
    const start = Date.now() - 3_600_000;
    const end   = Date.now() + 3_600_000;

    function attachClock(clock: InstanceType<typeof Cesium.Clock>) {
      component.startTime = Cesium.JulianDate.fromDate(new Date(start));
      component.endTime   = Cesium.JulianDate.fromDate(new Date(end));
      component.defaultStartMs = start;
      component.defaultEndMs   = end;
      component.clock = clock;
      component.ngOnChanges({
        clock: new SimpleChange(undefined, clock, false),
      });
    }

    it('stops playback at the end boundary instead of running past it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end - 1000));
      clock.shouldAnimate = true;
      component.restrictToRange = true;
      attachClock(clock);

      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end + 3_600_000));
      clock.onTick.fire();

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(end);
      expect(clock.shouldAnimate).toBe(false);
    });

    it('stops rewind at the start boundary instead of running past it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start + 1000));
      clock.shouldAnimate = true;
      clock.multiplier = -1; // actually rewinding, i.e. into the start wall
      component.restrictToRange = true;
      attachClock(clock);

      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start - 3_600_000));
      clock.onTick.fire();

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(start);
      expect(clock.shouldAnimate).toBe(false);
    });

    it('keeps playing when a clock below the range is moving back into it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start - 3_600_000));
      clock.shouldAnimate = true;
      clock.multiplier = 1; // forward, i.e. heading toward the range
      component.restrictToRange = true;
      attachClock(clock);

      clock.onTick.fire();

      // Snapped to the start limit, but playback must survive — the clamp is
      // in the same direction as travel, not against it.
      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(start);
      expect(clock.shouldAnimate).toBe(true);
    });

    it('keeps rewinding when a clock above the range is moving back into it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end + 3_600_000));
      clock.shouldAnimate = true;
      clock.multiplier = -1; // rewinding, i.e. heading toward the range
      component.restrictToRange = true;
      attachClock(clock);

      clock.onTick.fire();

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(end);
      expect(clock.shouldAnimate).toBe(true);
    });

    it('does not clamp the needle when restrictToRange is not set', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end - 1000));
      clock.shouldAnimate = true;
      attachClock(clock);

      const pastEnd = end + 3_600_000;
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(pastEnd));
      clock.onTick.fire();

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(pastEnd);
      expect(clock.shouldAnimate).toBe(true);
    });
  });
});
