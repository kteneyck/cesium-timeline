import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  it('calls onPlayPause(true) when play button clicked while stopped', () => {
    const onPlayPause = vi.fn();
    render(<TimelineControls {...makeProps({ isPlaying: false, onPlayPause })} />);
    fireEvent.click(screen.getByText('▶'));
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

  it('calls onRewind when ◀◀ clicked', () => {
    const onRewind = vi.fn();
    render(<TimelineControls {...makeProps({ onRewind })} />);
    fireEvent.click(screen.getByText('◀◀'));
    expect(onRewind).toHaveBeenCalledOnce();
  });

  it('calls onFastForward when ▶▶ clicked', () => {
    const onFastForward = vi.fn();
    render(<TimelineControls {...makeProps({ onFastForward })} />);
    fireEvent.click(screen.getByText('▶▶'));
    expect(onFastForward).toHaveBeenCalledOnce();
  });

  it('does NOT show speed badge when multiplier=1', () => {
    render(<TimelineControls {...makeProps({ multiplier: 1 })} />);
    expect(document.querySelector('[title="Reset to 1× speed"]')).toBeNull();
  });

  it('shows speed badge when multiplier != 1', () => {
    render(<TimelineControls {...makeProps({ multiplier: 4 })} />);
    expect(document.querySelector('[title="Reset to 1× speed"]')).not.toBeNull();
  });

  it('calls onResetSpeed when speed badge clicked', () => {
    const onResetSpeed = vi.fn();
    render(<TimelineControls {...makeProps({ multiplier: 4, onResetSpeed })} />);
    const badge = document.querySelector('[title="Reset to 1× speed"]') as HTMLButtonElement;
    fireEvent.click(badge);
    expect(onResetSpeed).toHaveBeenCalledOnce();
  });

  it('hides ⏮ button when showJumpToStart=false', () => {
    render(<TimelineControls {...makeProps({ showJumpToStart: false })} />);
    expect(screen.queryByText('⏮')).toBeNull();
  });

  it('disables ⏮ button when hasStartTime=false', () => {
    render(<TimelineControls {...makeProps({ hasStartTime: false })} />);
    const btn = screen.getByText('⏮').closest('button') as HTMLButtonElement;
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
});
