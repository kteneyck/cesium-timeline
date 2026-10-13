import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimelineControls, ControlsProps } from './TimelineControls';
import { defaultTheme } from '@kteneyck/cesium-timeline-core';
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

function makeProps(overrides: Partial<ControlsProps> = {}): ControlsProps {
  return {
    currentTime: Cesium.JulianDate.fromDate(new Date('2026-02-24T14:04:07Z')),
    isPlaying: false,
    multiplier: 1,
    isLive: false,
    hasStartTime: true,
    hasEndTime: true,
    onPlayPause: vi.fn(),
    onJumpToStart: vi.fn(),
    onRewind: vi.fn(),
    onFastForward: vi.fn(),
    onJumpToEnd: vi.fn(),
    onJumpToLive: vi.fn(),
    onResetSpeed: vi.fn(),
    onSetSpeed: vi.fn(),
    theme: defaultTheme,
    ...overrides,
  };
}

describe('TimelineControls', () => {
  it('renders without crashing', () => {
    render(<TimelineControls {...makeProps()} />);
  });

  it('shows LIVE label when not live', () => {
    render(<TimelineControls {...makeProps({ isLive: false })} />);
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('shows active LIVE label when live', () => {
    render(<TimelineControls {...makeProps({ isLive: true })} />);
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('calls onJumpToLive when LIVE button clicked', () => {
    const onJumpToLive = vi.fn();
    render(<TimelineControls {...makeProps({ onJumpToLive })} />);
    fireEvent.click(screen.getByText('LIVE'));
    expect(onJumpToLive).toHaveBeenCalledOnce();
  });

  it('hides the LIVE button when showLive is false', () => {
    render(<TimelineControls {...makeProps({ showLive: false })} />);
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('still shows the speed badge when showLive is false', () => {
    render(<TimelineControls {...makeProps({ showLive: false, multiplier: 2 })} />);
    expect(screen.queryByText('LIVE')).toBeNull();
    expect(document.querySelector('[title="Playback speed — click to adjust"]')).not.toBeNull();
  });

  it('calls onPlayPause(true) when play button clicked while stopped', () => {
    const onPlayPause = vi.fn();
    render(<TimelineControls {...makeProps({ isPlaying: false, onPlayPause })} />);
    fireEvent.click(screen.getByTitle('Play'));
    expect(onPlayPause).toHaveBeenCalledWith(true);
  });

  it('calls onPlayPause(false) when pause button clicked while playing', () => {
    const onPlayPause = vi.fn();
    render(<TimelineControls {...makeProps({ isPlaying: true, onPlayPause })} />);
    // pause button is rendered as PauseIcon SVG; find by title
    const btn = document.querySelector('[title="Pause"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onPlayPause).toHaveBeenCalledWith(false);
  });

  it('calls onRewind when rewind clicked', () => {
    const onRewind = vi.fn();
    render(<TimelineControls {...makeProps({ onRewind })} />);
    fireEvent.click(screen.getByTitle('Rewind'));
    expect(onRewind).toHaveBeenCalledOnce();
  });

  it('calls onFastForward when fast forward clicked', () => {
    const onFastForward = vi.fn();
    render(<TimelineControls {...makeProps({ onFastForward })} />);
    fireEvent.click(screen.getByTitle('Fast forward'));
    expect(onFastForward).toHaveBeenCalledOnce();
  });

  it('does NOT show speed badge when multiplier=1', () => {
    render(<TimelineControls {...makeProps({ multiplier: 1 })} />);
    expect(document.querySelector('[title="Playback speed — click to adjust"]')).toBeNull();
  });

  it('shows speed badge when multiplier != 1', () => {
    render(<TimelineControls {...makeProps({ multiplier: 4 })} />);
    expect(document.querySelector('[title="Playback speed — click to adjust"]')).not.toBeNull();
  });

  it('opens the speed overlay when the speed badge is clicked', () => {
    render(<TimelineControls {...makeProps({ multiplier: 4 })} />);
    expect(screen.queryByLabelText('Speed multiplier')).toBeNull();
    const badge = document.querySelector('[title="Playback speed — click to adjust"]') as HTMLButtonElement;
    fireEvent.click(badge);
    expect(screen.getAllByLabelText('Speed multiplier').length).toBe(2); // slider + number input
  });

  it('calls onSetSpeed when the overlay slider changes', () => {
    const onSetSpeed = vi.fn();
    render(<TimelineControls {...makeProps({ multiplier: 4, onSetSpeed })} />);
    const badge = document.querySelector('[title="Playback speed — click to adjust"]') as HTMLButtonElement;
    fireEvent.click(badge);
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '10' } });
    expect(onSetSpeed).toHaveBeenCalledWith(10);
  });

  it('allows a number input value above maxSpeed and applies it as-is on blur', () => {
    const onSetSpeed = vi.fn();
    render(<TimelineControls {...makeProps({ multiplier: 4, onSetSpeed, maxSpeed: 100 })} />);
    const badge = document.querySelector('[title="Playback speed — click to adjust"]') as HTMLButtonElement;
    fireEvent.click(badge);
    const numberInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(numberInput, { target: { value: '500' } });
    expect(numberInput.value).toBe('500');
    fireEvent.blur(numberInput);
    expect(onSetSpeed).toHaveBeenCalledWith(500);
    expect(numberInput.value).toBe('500');
  });

  it('calls onResetSpeed when the overlay reset link is clicked', () => {
    const onResetSpeed = vi.fn();
    render(<TimelineControls {...makeProps({ multiplier: 4, onResetSpeed })} />);
    const badge = document.querySelector('[title="Playback speed — click to adjust"]') as HTMLButtonElement;
    fireEvent.click(badge);
    fireEvent.click(screen.getByText('Reset'));
    expect(onResetSpeed).toHaveBeenCalledOnce();
  });

  it('hides jump-to-start button when showJumpToStart=false', () => {
    render(<TimelineControls {...makeProps({ showJumpToStart: false })} />);
    expect(screen.queryByTitle('Jump to start')).toBeNull();
  });

  it('disables jump-to-start button when hasStartTime=false', () => {
    render(<TimelineControls {...makeProps({ hasStartTime: false })} />);
    const btn = screen.getByTitle('No start time set') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('applies custom labels from labels prop', () => {
    render(<TimelineControls {...makeProps({
      isLive: false,
      labels: { liveLabel: 'EN DIRECT' },
    })} />);
    expect(screen.getByText('EN DIRECT')).toBeTruthy();
  });

  it('uses custom liveActiveLabel when live', () => {
    render(<TimelineControls {...makeProps({
      isLive: true,
      labels: { liveActiveLabel: '🔴 LIVE' },
    })} />);
    expect(screen.getByText('🔴 LIVE')).toBeTruthy();
  });

  describe('compact (two-row) layout', () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;

    beforeEach(() => {
      // Report a phone-sized container so the controls switch to the compact layout.
      globalThis.ResizeObserver = class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
      globalThis.ResizeObserver = OriginalResizeObserver;
    });

    it('splits status and transport into two rows', () => {
      const { container } = render(<TimelineControls {...makeProps({ swimLanesVisible: true, onToggleSwimLanes: vi.fn() })} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.dataset.layout).toBe('compact');
      expect(root.style.flexDirection).toBe('column');

      const [statusRow, transportRow] = Array.from(root.children) as HTMLElement[];
      expect(statusRow.textContent).toContain('LIVE');
      expect(statusRow.querySelector('[title="Collapse swim lanes"]')).not.toBeNull();
      expect(transportRow.querySelector('[title="Jump to start"]')).not.toBeNull();
      expect(transportRow.querySelector('[title="Jump to end"]')).not.toBeNull();
      expect(transportRow.style.justifyContent).toBe('space-evenly');
    });

    it('uses wide-but-short transport buttons and a smaller play button', () => {
      render(<TimelineControls {...makeProps()} />);
      const rewind = screen.getByTitle('Rewind');
      expect(rewind.style.minWidth).toBe('44px');
      expect(rewind.style.height).toBe('32px');
      expect(screen.getByTitle('Play').style.height).toBe('34px');
    });

    it('keeps the speed badge reachable in the status row', () => {
      render(<TimelineControls {...makeProps({ multiplier: 4 })} />);
      expect(document.querySelector('[title="Playback speed — click to adjust"]')).not.toBeNull();
    });

    it('omits the transport row in live mode', () => {
      const { container } = render(<TimelineControls {...makeProps({ live: true })} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.children).toHaveLength(1);
      expect(screen.queryByTitle('Rewind')).toBeNull();
    });
  });

  it('renders transport controls as SVG icons, not text glyphs', () => {
    render(<TimelineControls {...makeProps()} />);
    for (const title of ['Jump to start', 'Rewind', 'Play', 'Fast forward', 'Jump to end']) {
      const btn = screen.getByTitle(title);
      expect(btn.querySelector('svg')).not.toBeNull();
      expect(btn.textContent).toBe('');
    }
  });
});
