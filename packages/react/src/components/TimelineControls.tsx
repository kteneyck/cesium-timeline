import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type TimelineLabels,
  DEFAULT_LABELS,
  resolveLabel,
  formatDateTime,
  getTimezoneAbbr,
  splitForDisplay,
} from '@kteneyck/cesium-timeline-core';

/** React-specific controls props (uses Cesium.JulianDate for currentTime). */
export interface ControlsProps {
  currentTime: Cesium.JulianDate;
  isPlaying: boolean;
  multiplier: number;
  dateTimeFormat?: string;
  onDateTimeClick?: () => void;
  /** @see TimelineBaseProps.timezone */
  timezone?: string;
  onPlayPause: (isPlaying: boolean) => void;
  onJumpToStart: () => void;
  onRewind: () => void;
  onFastForward: () => void;
  onJumpToEnd: () => void;
  onJumpToLive: () => void;
  onResetSpeed: () => void;
  onSetSpeed: (value: number) => void;
  /** @see TimelineBaseProps.minSpeed */
  minSpeed?: number;
  /** @see TimelineBaseProps.maxSpeed */
  maxSpeed?: number;
  isLive: boolean;
  hasStartTime: boolean;
  hasEndTime: boolean;
  showJumpToStart?: boolean;
  showJumpToEnd?: boolean;
  theme: TimelineTheme;
  swimLanesVisible?: boolean;
  onToggleSwimLanes?: () => void;
  /** Overrides for control-bar labels and tooltips (i18n / custom verbiage). */
  labels?: Partial<TimelineLabels>;
  /** @see TimelineBaseProps.liveButtonSize */
  liveButtonSize?: 'sm' | 'md' | 'lg';
  /** @see TimelineBaseProps.liveButtonPosition */
  liveButtonPosition?: 'left' | 'right';
  /** @see TimelineBaseProps.showLive */
  showLive?: boolean;
  /** @see TimelineBaseProps.live */
  live?: boolean;
}

const NARROW_BREAKPOINT = 520;
/** Minimum touch-target size for transport buttons in the compact layout. */
const TOUCH_TARGET = 44;

/** Two vertical bars rendered as SVG — consistent across all platforms. */
const PauseIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
    <rect x="1" y="0" width="4" height="16" rx="1" />
    <rect x="9" y="0" width="4" height="16" rx="1" />
  </svg>
);

/**
 * Transport icons — SVG rather than Unicode glyphs (⏮ ◀◀ ▶ ▶▶ ⏭), which render
 * as color emoji on iOS and at inconsistent sizes across fonts. A thin stroke in
 * the fill color softens the triangle corners.
 */
const iconProps = {
  fill: 'currentColor',
  stroke: 'currentColor',
  strokeWidth: 1,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const PlayIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" {...iconProps}>
    <polygon points="2,1.5 13,8 2,14.5" />
  </svg>
);

const RewindIcon = () => (
  <svg width="18" height="16" viewBox="0 0 18 16" {...iconProps}>
    <polygon points="8.5,2 1.5,8 8.5,14" />
    <polygon points="16.5,2 9.5,8 16.5,14" />
  </svg>
);

const FastForwardIcon = () => (
  <svg width="18" height="16" viewBox="0 0 18 16" {...iconProps}>
    <polygon points="1.5,2 8.5,8 1.5,14" />
    <polygon points="9.5,2 16.5,8 9.5,14" />
  </svg>
);

const JumpToStartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...iconProps}>
    <rect x="1.5" y="2" width="1.5" height="12" />
    <polygon points="9,2.5 4.5,8 9,13.5" />
    <polygon points="14.5,2.5 10,8 14.5,13.5" />
  </svg>
);

const JumpToEndIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...iconProps}>
    <polygon points="1.5,2.5 6,8 1.5,13.5" />
    <polygon points="7,2.5 11.5,8 7,13.5" />
    <rect x="13" y="2" width="1.5" height="12" />
  </svg>
);

/** Chevron pointing upward (swim lanes expanded — click to collapse). */
const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3,5 7,9 11,5" />
  </svg>
);

/** Chevron pointing downward (swim lanes collapsed — click to expand). */
const ChevronUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3,9 7,5 11,9" />
  </svg>
);

const LIVE_SIZE_MAP = {
  sm: { width: 44, height: 18, fontSize: '10px', dot: 5, borderRadius: '3px' },
  md: { width: 56, height: 22, fontSize: '11px', dot: 6, borderRadius: '3px' },
  lg: { width: 72, height: 30, fontSize: '13px', dot: 8, borderRadius: '4px' },
} as const;

export const TimelineControls: React.FC<ControlsProps> = ({
  currentTime,
  isPlaying,
  multiplier,
  dateTimeFormat,
  timezone,
  isLive,
  hasStartTime,
  hasEndTime,
  showJumpToStart = true,
  showJumpToEnd = true,
  onPlayPause,
  onJumpToStart,
  onRewind,
  onFastForward,
  onJumpToEnd,
  onJumpToLive,
  onResetSpeed,
  onSetSpeed,
  minSpeed = 1,
  maxSpeed = 100,
  onDateTimeClick,
  theme,
  swimLanesVisible,
  onToggleSwimLanes,
  labels: labelOverrides,
  liveButtonSize = 'md',
  liveButtonPosition = 'left',
  showLive = true,
  live = false,
}) => {
  const isRewinding    = multiplier < 0;
  const isFastForward  = multiplier > 1;
  const isNormalSpeed  = multiplier === 1;
  const absMultiplier  = Math.abs(multiplier);

  const L = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Playback-speed overlay (slider + input, opened from the speed badge) ──
  const [speedOverlayOpen, setSpeedOverlayOpen] = useState(false);
  const [speedInputValue, setSpeedInputValue] = useState(() => String(Math.abs(multiplier)));
  const speedBadgeRef = useRef<HTMLButtonElement>(null);
  const speedOverlayRef = useRef<HTMLDivElement>(null);

  // Fixed-position coordinates (viewport-relative) so the overlay escapes any
  // ancestor's `overflow: hidden` and stacks above other page content (e.g. a
  // Cesium globe elsewhere on the page). Recomputed on open/resize/scroll.
  const [speedOverlayPos, setSpeedOverlayPos] = useState<{ bottom: number; left?: number; right?: number } | null>(null);

  useEffect(() => {
    setSpeedInputValue(String(Math.abs(multiplier)));
  }, [multiplier]);

  useEffect(() => {
    if (multiplier === 1 || live) setSpeedOverlayOpen(false);
  }, [multiplier, live]);

  useLayoutEffect(() => {
    if (!speedOverlayOpen) { setSpeedOverlayPos(null); return; }
    const updatePosition = () => {
      const badge = speedBadgeRef.current;
      if (!badge) return;
      const rect = badge.getBoundingClientRect();
      setSpeedOverlayPos(
        // In the compact layout the LIVE/speed group always sits on the right edge.
        liveButtonPosition === 'right' || isNarrow
          ? { bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right }
          : { bottom: window.innerHeight - rect.top + 6, left: rect.left }
      );
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [speedOverlayOpen, liveButtonPosition, isNarrow]);

  useEffect(() => {
    if (!speedOverlayOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (speedOverlayRef.current?.contains(target)) return;
      if (speedBadgeRef.current?.contains(target)) return;
      setSpeedOverlayOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSpeedOverlayOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [speedOverlayOpen]);

  const commitSpeedInput = () => {
    const parsed = Math.round(Number(speedInputValue));
    if (Number.isFinite(parsed)) {
      onSetSpeed(parsed);
      setSpeedInputValue(String(parsed));
    } else {
      setSpeedInputValue(String(Math.abs(multiplier)));
    }
  };

  const baseBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    transition: 'background-color 0.15s, color 0.15s',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    flexShrink: 0,
    lineHeight: 1,
  };

  const btn  = (active: boolean): React.CSSProperties => ({
    ...baseBtn,
    color:  active ? theme.buttonActiveColor : theme.buttonColor,
    borderColor: active ? `${theme.buttonActiveColor}33` : 'transparent',
  });

  const onEnter = (e: React.MouseEvent<HTMLButtonElement>, active: boolean) => {
    e.currentTarget.style.backgroundColor = active
      ? `${theme.buttonActiveColor}22`
      : theme.buttonHoverColor + '44';
  };
  const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  };

  const liveSize = LIVE_SIZE_MAP[liveButtonSize];

  const LiveButton = !showLive ? null : (
    <button
      onClick={live ? undefined : onJumpToLive}
      style={{
        ...baseBtn,
        fontSize: liveSize.fontSize,
        fontWeight: 'bold',
        letterSpacing: '0.05em',
        width: `${liveSize.width}px`,
        minWidth: `${liveSize.width}px`,
        height: `${liveSize.height}px`,
        borderRadius: liveSize.borderRadius,
        color:   live || isLive ? theme.controlBarBackground : theme.buttonActiveColor,
        backgroundColor: live || isLive ? theme.buttonActiveColor : 'transparent',
        borderColor: theme.buttonActiveColor,
        opacity: 1,
        gap: '4px',
        cursor: live ? 'default' : 'pointer',
      }}
      onMouseEnter={live ? undefined : (e => { e.currentTarget.style.opacity = '1'; })}
      onMouseLeave={live ? undefined : (e => { e.currentTarget.style.opacity = isLive ? '1' : '0.55'; })}
      title={live ? L.liveActiveTooltip : (isLive ? L.liveActiveTooltip : L.liveTooltip)}
    >
      {(live || isLive) && (
        <span style={{
          width: `${liveSize.dot}px`,
          height: `${liveSize.dot}px`,
          borderRadius: '50%',
          backgroundColor: theme.liveDotColor,
          display: 'inline-block',
          flexShrink: 0,
        }} />
      )}
      {live || isLive ? L.liveActiveLabel : L.liveLabel}
    </button>
  );

  /** Speed badge — shown independently of the LIVE button; hidden in live mode. */
  const SpeedBadge = (!isNormalSpeed && !live) ? (
    <button
      ref={speedBadgeRef}
      onClick={() => setSpeedOverlayOpen(o => !o)}
      style={{
        ...baseBtn,
        fontSize: '11px',
        color: theme.buttonActiveColor,
        borderColor: `${theme.buttonActiveColor}44`,
        width: 'auto',
        minWidth: `${liveSize.width}px`,
        height: `${liveSize.height}px`,
        paddingLeft: '8px',
        paddingRight: '8px',
      }}
      onMouseEnter={e => onEnter(e, true)}
      onMouseLeave={onLeave}
      title={L.resetSpeedTooltip}
    >
      {isRewinding ? `◀ ${absMultiplier}×` : `${absMultiplier}× ▶`}
    </button>
  ) : null;

  const SpeedOverlay = (speedOverlayOpen && SpeedBadge && speedOverlayPos) ? (
    <div
      ref={speedOverlayRef}
      style={{
        position: 'fixed',
        ...speedOverlayPos,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '6px',
        backgroundColor: theme.controlBarBackground,
        border: `1px solid ${theme.controlBarBorder}`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        minWidth: '170px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <style>{`
        .ct-speed-input::-webkit-outer-spin-button,
        .ct-speed-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .ct-speed-input {
          -moz-appearance: textfield;
        }
      `}</style>
      <div style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.03em', color: theme.labelColor }}>
        {L.speedOverlayTitle}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="range"
          min={minSpeed}
          max={maxSpeed}
          step={1}
          value={absMultiplier}
          onChange={e => onSetSpeed(Number(e.target.value))}
          aria-label={L.speedInputLabel}
          style={{ flex: 1, accentColor: theme.buttonActiveColor }}
        />
        <input
          type="number"
          className="ct-speed-input"
          value={speedInputValue}
          onChange={e => setSpeedInputValue(e.target.value)}
          onBlur={commitSpeedInput}
          onKeyDown={e => {
            if (e.key === 'Enter') { commitSpeedInput(); (e.target as HTMLInputElement).blur(); }
          }}
          aria-label={L.speedInputLabel}
          style={{
            width: '48px',
            fontSize: '12px',
            padding: '2px 4px',
            borderRadius: '4px',
            border: `1px solid ${theme.controlBarBorder}`,
            backgroundColor: 'transparent',
            color: theme.labelColor,
            fontFamily: 'inherit',
          }}
        />
      </div>
      <button
        onClick={() => { onResetSpeed(); setSpeedOverlayOpen(false); }}
        title={L.resetSpeedTitle}
        style={{
          ...baseBtn,
          alignSelf: 'flex-start',
          width: 'auto',
          height: `${liveSize.height}px`,
          paddingLeft: '10px',
          paddingRight: '10px',
          fontSize: '11px',
          color: theme.buttonActiveColor,
          borderColor: `${theme.buttonActiveColor}44`,
        }}
        onMouseEnter={e => onEnter(e, true)}
        onMouseLeave={onLeave}
      >
        {L.resetSpeedLabel}
      </button>
    </div>
  ) : null;

  const LiveAndSpeedGroup = (LiveButton || SpeedBadge) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {LiveButton}
      {SpeedBadge}
      {SpeedOverlay}
    </div>
  );

  const { timeFormat, dateFormat } = splitForDisplay(dateTimeFormat);
  const tzAbbr = getTimezoneAbbr(currentTime, timezone);

  const DateTimeDisplay = (
    <div
      onClick={live ? undefined : onDateTimeClick}
      title={(!live && onDateTimeClick) ? L.dateTimeClickTooltip : undefined}
      style={{
        color: theme.labelColor,
        fontFamily: 'monospace',
        lineHeight: 1.15,
        cursor: (!live && onDateTimeClick) ? 'pointer' : 'default',
        borderRadius: '4px',
        padding: '2px 4px',
        transition: 'background 0.15s',
        // Compact: time and date share one line (wrapping if they must).
        ...(isNarrow ? { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '8px', minWidth: 0 } : {}),
      }}
      onMouseEnter={e => { if (!live && onDateTimeClick) e.currentTarget.style.background = theme.buttonHoverColor + '44'; }}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {timeFormat && (
        <div style={{ fontSize: isNarrow ? '1.5em' : '2em', fontWeight: 'bold', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          {formatDateTime(currentTime, timeFormat, timezone)}
        </div>
      )}
      {dateFormat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '1.15em', letterSpacing: '0.03em', color: theme.buttonActiveColor }}>
            {formatDateTime(currentTime, dateFormat, timezone)}
          </span>
          {tzAbbr && (
            <span style={{
              fontSize: '0.9em',
              color: theme.labelColor,
              opacity: 0.7,
              fontWeight: 'bold',
              letterSpacing: '0.04em',
            }}>
              {tzAbbr}
            </span>
          )}
        </div>
      )}
    </div>
  );

  /** Larger hit areas for the transport buttons in the compact layout. */
  const touch: React.CSSProperties = isNarrow
    ? { width: `${TOUCH_TARGET}px`, minWidth: `${TOUCH_TARGET}px`, height: `${TOUCH_TARGET}px` }
    : {};

  const Transport = !live && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        ...(isNarrow ? { justifyContent: 'space-evenly' } : {}),
      }}
    >
      {showJumpToStart && (
        <button
          onClick={hasStartTime ? onJumpToStart : undefined}
          disabled={!hasStartTime}
          style={{ ...btn(false), ...touch, opacity: hasStartTime ? 1 : 0.3, cursor: hasStartTime ? 'pointer' : 'default' }}
          onMouseEnter={hasStartTime ? e => onEnter(e, false) : undefined}
          onMouseLeave={hasStartTime ? onLeave : undefined}
          title={hasStartTime ? L.jumpToStartTooltip : L.noStartTimeTooltip}
        ><JumpToStartIcon /></button>
      )}

      <button
        onClick={onRewind}
        style={{ ...btn(isRewinding), ...touch }}
        onMouseEnter={e => onEnter(e, isRewinding)}
        onMouseLeave={onLeave}
        title={isRewinding ? resolveLabel(L.rewindActiveTooltip, absMultiplier) : L.rewindTooltip}
      ><RewindIcon /></button>

      <button
        onClick={() => onPlayPause(!isPlaying)}
        style={{
          ...baseBtn,
          color: theme.buttonActiveColor,
          fontSize: '18px',
          width: isNarrow ? '48px' : '40px',
          minWidth: isNarrow ? '48px' : '40px',
          height: isNarrow ? '48px' : '40px',
          borderColor: `${theme.buttonActiveColor}55`,
          borderRadius: '50%',
          paddingLeft: isPlaying ? '0' : '2px',
        }}
        onMouseEnter={e => onEnter(e, true)}
        onMouseLeave={onLeave}
        title={isPlaying ? L.pauseTooltip : (isRewinding ? L.playFromRewindTooltip : L.playTooltip)}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        onClick={onFastForward}
        style={{ ...btn(isFastForward), ...touch }}
        onMouseEnter={e => onEnter(e, isFastForward)}
        onMouseLeave={onLeave}
        title={isFastForward ? resolveLabel(L.fastForwardActiveTooltip, absMultiplier) : L.fastForwardTooltip}
      ><FastForwardIcon /></button>

      {showJumpToEnd && (
        <button
          onClick={hasEndTime ? onJumpToEnd : undefined}
          disabled={!hasEndTime}
          style={{ ...btn(false), ...touch, opacity: hasEndTime ? 1 : 0.3, cursor: hasEndTime ? 'pointer' : 'default' }}
          onMouseEnter={hasEndTime ? e => onEnter(e, false) : undefined}
          onMouseLeave={hasEndTime ? onLeave : undefined}
          title={hasEndTime ? L.jumpToEndTooltip : L.noEndTimeTooltip}
        ><JumpToEndIcon /></button>
      )}
    </div>
  );

  const SwimLaneToggle = onToggleSwimLanes != null && swimLanesVisible != null && (
    <button
      onClick={onToggleSwimLanes}
      style={{
        ...baseBtn,
        color: theme.buttonActiveColor,
        borderColor: `${theme.buttonActiveColor}33`,
      }}
      onMouseEnter={e => onEnter(e, swimLanesVisible)}
      onMouseLeave={onLeave}
      title={swimLanesVisible ? L.collapseSwimLanesTooltip : L.expandSwimLanesTooltip}
    >
      {swimLanesVisible ? <ChevronDownIcon /> : <ChevronUpIcon />}
    </button>
  );

  return (
    <div
      ref={containerRef}
      data-layout={isNarrow ? 'compact' : 'full'}
      style={{
        ...(isNarrow
          ? { display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 12px' }
          : { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '6px 16px' }),
        backgroundColor: theme.controlBarBackground,
        borderBottom: `1px solid ${theme.controlBarBorder}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {isNarrow ? (
        <>
          {/* ── Row 1: Datetime · LIVE/speed · swim-lane toggle ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{DateTimeDisplay}</div>
            {LiveAndSpeedGroup}
            {SwimLaneToggle}
          </div>

          {/* ── Row 2: Transport buttons, spread across the full width ── */}
          {Transport}
        </>
      ) : (
        <>
          {/* ── Left: Datetime + (LIVE if position=left) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {DateTimeDisplay}
            {liveButtonPosition === 'left' && LiveAndSpeedGroup}
          </div>

          {/* ── Center: Transport buttons ── */}
          {/* Empty placeholder in live mode keeps the right column in place. */}
          {Transport || <div />}

          {/* ── Right: LIVE (if position=right) + swim-lane toggle (or spacer) ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
            {liveButtonPosition === 'right' && LiveAndSpeedGroup}
            {SwimLaneToggle}
          </div>
        </>
      )}
    </div>
  );
};
