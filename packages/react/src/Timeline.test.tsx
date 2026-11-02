import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Timeline, type TimelineHandle } from './Timeline';
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

  class Event {
    private listeners: Array<() => void> = [];
    addEventListener(fn: () => void) { this.listeners.push(fn); }
    removeEventListener(fn: () => void) { this.listeners = this.listeners.filter(l => l !== fn); }
    fire() { this.listeners.forEach(l => l()); }
  }

  class Clock {
    shouldAnimate = false;
    multiplier = 1;
    currentTime = new JulianDate(new Date());
    onTick = new Event();
  }

  return { JulianDate, Clock };
});

const REF_MS = Date.UTC(2026, 1, 24, 14, 0, 0);

describe('Timeline', () => {
  it('renders without crashing', () => {
    const { container } = render(<Timeline />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders with showControls=false (canvas only)', () => {
    const { container } = render(<Timeline showControls={false} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('handleFastForward cycles through ffSpeeds', () => {
    const onMultiplierChange = vi.fn();
    const { getByTitle } = render(
      <Timeline
        ffSpeeds={[2, 4, 8]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    // First click: multiplier 1 → next speed = 2
    act(() => { getByTitle('Fast forward').click(); });
    expect(onMultiplierChange).toHaveBeenCalledWith(2);
  });

  it('handleFastForward wraps around at the end of ffSpeeds', () => {
    const onMultiplierChange = vi.fn();
    const { getByTitle } = render(
      <Timeline
        ffSpeeds={[2, 1]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    act(() => { getByTitle('Fast forward').click(); }); // → 2
    act(() => { getByTitle(/× speed/).click(); }); // → wraps to 2 again (1 acts as reset sentinel)
    // second click calls applyMultiplier with the value at index after 2 (which is 1)
    expect(onMultiplierChange).toHaveBeenLastCalledWith(1);
  });

  it('handleRewindSpeed produces negative multiplier', () => {
    const onMultiplierChange = vi.fn();
    const { getByTitle } = render(
      <Timeline
        rwSpeeds={[1, 2, 4]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    act(() => { getByTitle('Rewind').click(); });
    expect(onMultiplierChange).toHaveBeenCalledWith(-1);
  });

  it('isLive is true when currentTime is close to now', () => {
    // Render with default currentTime (approximately now)
    const { getByTitle } = render(<Timeline timezone="UTC" />);
    expect(getByTitle('Currently live')).toBeTruthy();
  });

  it('isLive is false when currentTime is in the past', () => {
    const pastDate = new Date(Date.now() - 60_000);
    const pastTime = Cesium.JulianDate.fromDate(pastDate);
    const { getByTitle } = render(
      <Timeline currentTime={pastTime} timezone="UTC" />
    );
    expect(getByTitle('Jump to live (now)')).toBeTruthy();
  });

  it('onPlayPause callback fires when play clicked', () => {
    const onPlayPause = vi.fn();
    const { getByTitle } = render(
      <Timeline onPlayPause={onPlayPause} timezone="UTC" />
    );
    act(() => { getByTitle('Play').click(); });
    expect(onPlayPause).toHaveBeenCalledWith(true);
  });

  it('handleJumpToLive preserves the visible span', () => {
    // Render with a past currentTime so LIVE button is clickable (not already live)
    const past = Cesium.JulianDate.fromDate(new Date(REF_MS - 3_600_000));
    const { getByText } = render(
      <Timeline
        currentTime={past}
        timezone="UTC"
        startTime={Cesium.JulianDate.fromDate(new Date(REF_MS - 12 * 3600_000))}
        endTime={Cesium.JulianDate.fromDate(new Date(REF_MS + 12 * 3600_000))}
      />
    );
    act(() => { getByText('LIVE').click(); });
    // We can't inspect canvasRef internals from outside, but no throw = pass
  });

  it('jumps to current time when live is toggled on', () => {
    const past = Cesium.JulianDate.fromDate(new Date(Date.now() - 3_600_000));
    const { getByTitle, rerender } = render(
      <Timeline currentTime={past} live={false} timezone="UTC" />
    );
    // Starts in the past → not live
    expect(getByTitle('Jump to live (now)')).toBeTruthy();
    // Toggle live on → should jump to now
    act(() => {
      rerender(<Timeline currentTime={past} live={true} timezone="UTC" />);
    });
    expect(getByTitle('Currently live')).toBeTruthy();
  });

  it('onMultiplierChange fires when rewinding', () => {
    const onMultiplierChange = vi.fn();
    const { getByTitle } = render(
      <Timeline onMultiplierChange={onMultiplierChange} timezone="UTC" />
    );
    act(() => { getByTitle('Rewind').click(); });
    expect(onMultiplierChange).toHaveBeenCalled();
    expect(onMultiplierChange.mock.calls[0][0]).toBeLessThan(0);
  });

  it('clock onTick updates currentTime', () => {
    const clock = new (Cesium as any).Clock();
    const { getByText } = render(
      <Timeline clock={clock} timezone="UTC" />
    );
    const futureDate = new Date(Date.now() - 86_400_000);
    clock.currentTime = Cesium.JulianDate.fromDate(futureDate);
    act(() => { clock.onTick.fire(); });
    // After tick the LIVE button should show as inactive (time is in past)
    expect(getByText('LIVE')).toBeTruthy();
  });

  describe('restrictToRange — needle clamping', () => {
    const start = REF_MS - 3_600_000;
    const end   = REF_MS + 3_600_000;

    it('stops playback at the end boundary instead of running past it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end - 1000));
      clock.shouldAnimate = true;
      render(
        <Timeline
          clock={clock}
          timezone="UTC"
          startTime={Cesium.JulianDate.fromDate(new Date(start))}
          endTime={Cesium.JulianDate.fromDate(new Date(end))}
          restrictToRange
        />
      );

      // Playback advances past the end limit.
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end + 3_600_000));
      act(() => { clock.onTick.fire(); });

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(end);
      expect(clock.shouldAnimate).toBe(false);
    });

    it('stops rewind at the start boundary instead of running past it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start + 1000));
      clock.shouldAnimate = true;
      clock.multiplier = -1; // actually rewinding, i.e. into the start wall
      render(
        <Timeline
          clock={clock}
          timezone="UTC"
          startTime={Cesium.JulianDate.fromDate(new Date(start))}
          endTime={Cesium.JulianDate.fromDate(new Date(end))}
          restrictToRange
        />
      );

      // Rewind advances past the start limit.
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start - 3_600_000));
      act(() => { clock.onTick.fire(); });

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(start);
      expect(clock.shouldAnimate).toBe(false);
    });

    it('keeps playing when a clock below the range is moving back into it', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(start - 3_600_000));
      clock.shouldAnimate = true;
      clock.multiplier = 1; // forward, i.e. heading toward the range
      render(
        <Timeline
          clock={clock}
          timezone="UTC"
          startTime={Cesium.JulianDate.fromDate(new Date(start))}
          endTime={Cesium.JulianDate.fromDate(new Date(end))}
          restrictToRange
        />
      );

      act(() => { clock.onTick.fire(); });

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
      render(
        <Timeline
          clock={clock}
          timezone="UTC"
          startTime={Cesium.JulianDate.fromDate(new Date(start))}
          endTime={Cesium.JulianDate.fromDate(new Date(end))}
          restrictToRange
        />
      );

      act(() => { clock.onTick.fire(); });

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(end);
      expect(clock.shouldAnimate).toBe(true);
    });

    it('does not clamp the needle when restrictToRange is not set', () => {
      const clock = new (Cesium as any).Clock();
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(end - 1000));
      clock.shouldAnimate = true;
      render(
        <Timeline
          clock={clock}
          timezone="UTC"
          startTime={Cesium.JulianDate.fromDate(new Date(start))}
          endTime={Cesium.JulianDate.fromDate(new Date(end))}
        />
      );

      const pastEnd = end + 3_600_000;
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(pastEnd));
      act(() => { clock.onTick.fire(); });

      expect(Cesium.JulianDate.toDate(clock.currentTime).getTime()).toBe(pastEnd);
      expect(clock.shouldAnimate).toBe(true);
    });
  });

  describe('initialVisibleRange', () => {
    const HOUR  = 3_600_000;
    const dayStart = REF_MS - 12 * HOUR;
    const dayEnd   = REF_MS + 12 * HOUR;
    const jd = (ms: number) => Cesium.JulianDate.fromDate(new Date(ms));
    const visible = (ref: React.RefObject<TimelineHandle | null>) => {
      const { start, end } = ref.current!.getVisibleRange();
      return { startMs: Cesium.JulianDate.toDate(start).getTime(), endMs: Cesium.JulianDate.toDate(end).getTime() };
    };

    const renderTimeline = (props: Partial<React.ComponentProps<typeof Timeline>> = {}) => {
      const ref = createRef<TimelineHandle>();
      const utils = render(
        <Timeline ref={ref} timezone="UTC" startTime={new Date(dayStart)} endTime={new Date(dayEnd)} {...props} />
      );
      const rerender = (next: Partial<React.ComponentProps<typeof Timeline>> = {}) => act(() => {
        utils.rerender(
          <Timeline ref={ref} timezone="UTC" startTime={new Date(dayStart)} endTime={new Date(dayEnd)} {...next} />
        );
      });
      return { ref, rerender };
    };

    it('opens on the full start/end span when not provided', () => {
      const { ref } = renderTimeline();
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayEnd });
    });

    it('opens on the given window instead of the full span', () => {
      const { ref } = renderTimeline({
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
      });
      expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });
    });

    it('accepts JulianDate values', () => {
      const { ref } = renderTimeline({
        initialVisibleRange: { start: jd(REF_MS), end: jd(REF_MS + HOUR) },
      });
      expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });
    });

    it('falls back to the full span when the window has no width', () => {
      const { ref } = renderTimeline({
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS) },
      });
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayEnd });
    });

    it('falls back to the full span when the window does not overlap the limits', () => {
      const { ref } = renderTimeline({
        initialVisibleRange: { start: new Date(dayEnd + HOUR), end: new Date(dayEnd + 2 * HOUR) },
      });
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayEnd });
    });

    it('is clipped to the limits when restrictToRange is set', () => {
      const { ref } = renderTimeline({
        restrictToRange: true,
        initialVisibleRange: { start: new Date(dayStart - HOUR), end: new Date(dayStart + HOUR) },
      });
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayStart + HOUR });
    });

    it('still lets the view zoom out to the full limits when restrictToRange is set', () => {
      const { ref } = renderTimeline({
        restrictToRange: true,
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
      });
      act(() => { ref.current!.zoomTo(new Date(dayStart - 48 * HOUR), new Date(dayEnd + 48 * HOUR)); });
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayEnd });
    });

    it('respects the minimum visible span', () => {
      const { ref } = renderTimeline({
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + 100) },
      });
      const { startMs, endMs } = visible(ref);
      expect(endMs - startMs).toBe(1_000);
      expect((startMs + endMs) / 2).toBe(REF_MS + 50);
    });

    it('does not re-apply on re-renders with an equal (new-identity) value', () => {
      const range = () => ({ start: new Date(REF_MS), end: new Date(REF_MS + HOUR) });
      const { ref, rerender } = renderTimeline({ initialVisibleRange: range() });
      // Stand-in for the user's own zoom/pan.
      act(() => { ref.current!.zoomTo(new Date(REF_MS - 2 * HOUR), new Date(REF_MS + 4 * HOUR)); });
      rerender({ initialVisibleRange: range() });
      expect(visible(ref)).toEqual({ startMs: REF_MS - 2 * HOUR, endMs: REF_MS + 4 * HOUR });
    });

    it('applies a changed value once', () => {
      const { ref, rerender } = renderTimeline({
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
      });
      const next = { start: new Date(REF_MS + 2 * HOUR), end: new Date(REF_MS + 3 * HOUR) };
      rerender({ initialVisibleRange: next });
      expect(visible(ref)).toEqual({ startMs: REF_MS + 2 * HOUR, endMs: REF_MS + 3 * HOUR });

      act(() => { ref.current!.zoomTo(new Date(dayStart), new Date(dayEnd)); });
      rerender({ initialVisibleRange: { ...next } });
      expect(visible(ref)).toEqual({ startMs: dayStart, endMs: dayEnd });
    });

    it('leaves the current view alone when the prop is removed', () => {
      const { ref, rerender } = renderTimeline({
        initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
      });
      rerender({});
      expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });
    });

    it('wins over the full-span reset when startTime/endTime change', () => {
      const ref = createRef<TimelineHandle>();
      const { rerender } = render(
        <Timeline ref={ref} timezone="UTC" startTime={new Date(dayStart)} endTime={new Date(dayEnd)}
          initialVisibleRange={{ start: new Date(REF_MS), end: new Date(REF_MS + HOUR) }} />
      );
      act(() => { ref.current!.zoomTo(new Date(dayStart), new Date(dayEnd)); });

      // A new scene loads: new bounds plus a new initial window.
      const nextStart = dayStart + 24 * HOUR;
      act(() => {
        rerender(
          <Timeline ref={ref} timezone="UTC" startTime={new Date(nextStart)} endTime={new Date(dayEnd + 24 * HOUR)}
            initialVisibleRange={{ start: new Date(nextStart + HOUR), end: new Date(nextStart + 2 * HOUR) }} />
        );
      });
      expect(visible(ref)).toEqual({ startMs: nextStart + HOUR, endMs: nextStart + 2 * HOUR });
    });

    it('re-applies the same window when only startTime/endTime change', () => {
      const initial = { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) };
      const ref = createRef<TimelineHandle>();
      const { rerender } = render(
        <Timeline ref={ref} timezone="UTC" startTime={new Date(dayStart)} endTime={new Date(dayEnd)}
          initialVisibleRange={initial} />
      );
      act(() => { ref.current!.zoomTo(new Date(dayStart), new Date(dayEnd)); });
      act(() => {
        rerender(
          <Timeline ref={ref} timezone="UTC" startTime={new Date(dayStart - HOUR)} endTime={new Date(dayEnd)}
            initialVisibleRange={initial} />
        );
      });
      expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });
    });

    describe('playhead auto-follow', () => {
      const makeClock = (ms: number) => {
        const clock = new (Cesium as any).Clock();
        clock.currentTime = jd(ms);
        return clock;
      };

      it('re-centres on a playhead outside the window when no initial window is set (existing behaviour)', () => {
        const clock = makeClock(dayEnd + HOUR);
        const { ref } = renderTimeline({ clock });
        act(() => { clock.onTick.fire(); });
        const span = dayEnd - dayStart;
        expect(visible(ref)).toEqual({ startMs: dayEnd + HOUR - 0.9 * span, endMs: dayEnd + HOUR + 0.1 * span });
      });

      it('keeps the initial window while the playhead is outside it', () => {
        const clock = makeClock(dayStart); // outside the 1-hour window
        const { ref } = renderTimeline({
          clock,
          initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
        });
        act(() => { clock.onTick.fire(); });
        act(() => { clock.onTick.fire(); });
        expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });
      });

      it('resumes following once the playhead is inside the window', () => {
        const clock = makeClock(dayStart);
        const { ref } = renderTimeline({
          clock,
          initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
        });
        act(() => { clock.onTick.fire(); });

        // Consumer moves the clock into the window — mid-window, no re-centre.
        clock.currentTime = jd(REF_MS + HOUR / 2);
        act(() => { clock.onTick.fire(); });
        expect(visible(ref)).toEqual({ startMs: REF_MS, endMs: REF_MS + HOUR });

        // Playback reaches the 90% edge — follow is active again and pans.
        const edgeMs = REF_MS + 0.95 * HOUR;
        clock.currentTime = jd(edgeMs);
        act(() => { clock.onTick.fire(); });
        const v = visible(ref);
        expect(v.endMs - v.startMs).toBe(HOUR);
        expect(v.startMs).toBe(edgeMs - 0.9 * HOUR);
      });

      it('keeps following normally when the playhead starts inside the window', () => {
        const clock = makeClock(REF_MS + 0.95 * HOUR);
        const { ref } = renderTimeline({
          clock,
          initialVisibleRange: { start: new Date(REF_MS), end: new Date(REF_MS + HOUR) },
        });
        act(() => { clock.onTick.fire(); });
        expect(visible(ref).startMs).toBe(REF_MS + 0.05 * HOUR);
      });

      it('pauses following after an imperative zoomTo away from the playhead', () => {
        const clock = makeClock(REF_MS);
        const { ref } = renderTimeline({ clock });
        act(() => { ref.current!.zoomTo(new Date(REF_MS + 2 * HOUR), new Date(REF_MS + 3 * HOUR)); });
        act(() => { clock.onTick.fire(); });
        expect(visible(ref)).toEqual({ startMs: REF_MS + 2 * HOUR, endMs: REF_MS + 3 * HOUR });
      });
    });
  });
});
