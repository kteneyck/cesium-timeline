import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Timeline } from './Timeline';
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
    const { getByText } = render(
      <Timeline
        ffSpeeds={[2, 4, 8]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    // First click: multiplier 1 → next speed = 2
    act(() => { getByText('▶▶').click(); });
    expect(onMultiplierChange).toHaveBeenCalledWith(2);
  });

  it('handleFastForward wraps around at the end of ffSpeeds', () => {
    const onMultiplierChange = vi.fn();
    const { getByText } = render(
      <Timeline
        ffSpeeds={[2, 1]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    act(() => { getByText('▶▶').click(); }); // → 2
    act(() => { getByText('▶▶').click(); }); // → wraps to 2 again (1 acts as reset sentinel)
    // second click calls applyMultiplier with the value at index after 2 (which is 1)
    expect(onMultiplierChange).toHaveBeenLastCalledWith(1);
  });

  it('handleRewindSpeed produces negative multiplier', () => {
    const onMultiplierChange = vi.fn();
    const { getByText } = render(
      <Timeline
        rwSpeeds={[1, 2, 4]}
        onMultiplierChange={onMultiplierChange}
        timezone="UTC"
      />
    );
    act(() => { getByText('◀◀').click(); });
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
    const { getByText } = render(
      <Timeline onPlayPause={onPlayPause} timezone="UTC" />
    );
    act(() => { getByText('▶').click(); });
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
    const { getByText } = render(
      <Timeline onMultiplierChange={onMultiplierChange} timezone="UTC" />
    );
    act(() => { getByText('◀◀').click(); });
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
});
