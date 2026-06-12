import React, { useRef, useState, useEffect, useMemo } from 'react';
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
  /** @see TimelineBaseProps.live */
  live?: boolean;
}

const NARROW_BREAKPOINT = 520;

/** Two vertical bars rendered as SVG — consistent across all platforms. */
const PauseIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
    <rect x="1" y="0" width="4" height="16" rx="1" />
    <rect x="9" y="0" width="4" height="16" rx="1" />
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
  onDateTimeClick,
  theme,
  swimLanesVisible,
  onToggleSwimLanes,
  labels: labelOverrides,
  liveButtonSize = 'md',
  liveButtonPosition = 'left',
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

  const LiveButton = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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

      {/* Speed reset badge — hidden in live mode */}
      {!isNormalSpeed && !live && (
        <button
          onClick={() => onResetSpeed()}
          style={{
            ...baseBtn,
            fontSize: '11px',
            color: theme.buttonActiveColor,
            borderColor: `${theme.buttonActiveColor}44`,
            width: `${liveSize.width}px`,
            minWidth: `${liveSize.width}px`,
            height: `${liveSize.height}px`,
          }}
          onMouseEnter={e => onEnter(e, true)}
          onMouseLeave={onLeave}
          title={L.resetSpeedTooltip}
        >
          {isRewinding ? `◀ ${absMultiplier}×` : `${absMultiplier}× ▶`}
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: isNarrow ? 'flex' : 'grid',
        gridTemplateColumns: isNarrow ? undefined : '1fr auto 1fr',
        alignItems: 'center',
        padding: '6px 16px',
        backgroundColor: theme.controlBarBackground,
        borderBottom: `1px solid ${theme.controlBarBorder}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Left: Datetime + (LIVE if position=left) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
          }}
          onMouseEnter={e => { if (!live && onDateTimeClick) e.currentTarget.style.background = theme.buttonHoverColor + '44'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {(() => {
            const { timeFormat, dateFormat } = splitForDisplay(dateTimeFormat);
            const tzAbbr = getTimezoneAbbr(currentTime, timezone);
            return (
              <>
                {timeFormat && (
                  <div style={{ fontSize: '2em', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                    {formatDateTime(currentTime, timeFormat, timezone)}
                  </div>
                )}
                {dateFormat && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              </>
            );
          })()}
        </div>

        {liveButtonPosition === 'left' && LiveButton}
      </div>

      {/* ── Center: Transport buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', ...(isNarrow ? { flex: 1, justifyContent: 'center' } : {}) }}>

        {!live && showJumpToStart && (
          <button
            onClick={hasStartTime ? onJumpToStart : undefined}
            disabled={!hasStartTime}
            style={{ ...btn(false), opacity: hasStartTime ? 1 : 0.3, cursor: hasStartTime ? 'pointer' : 'default' }}
            onMouseEnter={hasStartTime ? e => onEnter(e, false) : undefined}
            onMouseLeave={hasStartTime ? onLeave : undefined}
            title={hasStartTime ? L.jumpToStartTooltip : L.noStartTimeTooltip}
          >⏮</button>
        )}

        {!live && (
          <button
            onClick={onRewind}
            style={{ ...btn(isRewinding), width: '64px', minWidth: '64px', gap: '3px' }}
            onMouseEnter={e => onEnter(e, isRewinding)}
            onMouseLeave={onLeave}
            title={isRewinding ? resolveLabel(L.rewindActiveTooltip, absMultiplier) : L.rewindTooltip}
          >
            {isRewinding ? (
              <><span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span>◀◀</>
            ) : '◀◀'}
          </button>
        )}

        {!live && (
          <button
            onClick={() => onPlayPause(!isPlaying)}
            style={{
              ...baseBtn,
              color: theme.buttonActiveColor,
              fontSize: '18px',
              width: '40px',
              minWidth: '40px',
              height: '40px',
              borderColor: `${theme.buttonActiveColor}55`,
              borderRadius: '50%',
              paddingLeft: isPlaying ? '0' : '2px',
            }}
            onMouseEnter={e => onEnter(e, true)}
            onMouseLeave={onLeave}
            title={isPlaying ? L.pauseTooltip : (isRewinding ? L.playFromRewindTooltip : L.playTooltip)}
          >
            {isPlaying ? <PauseIcon /> : '▶'}
          </button>
        )}

        {!live && (
          <button
            onClick={onFastForward}
            style={{ ...btn(isFastForward), width: '64px', minWidth: '64px', gap: '3px' }}
            onMouseEnter={e => onEnter(e, isFastForward)}
            onMouseLeave={onLeave}
            title={isFastForward ? resolveLabel(L.fastForwardActiveTooltip, absMultiplier) : L.fastForwardTooltip}
          >
            {isFastForward ? (
              <>▶▶<span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span></>
            ) : '▶▶'}
          </button>
        )}

        {!live && showJumpToEnd && (
          <button
            onClick={hasEndTime ? onJumpToEnd : undefined}
            disabled={!hasEndTime}
            style={{ ...btn(false), opacity: hasEndTime ? 1 : 0.3, cursor: hasEndTime ? 'pointer' : 'default' }}
            onMouseEnter={hasEndTime ? e => onEnter(e, false) : undefined}
            onMouseLeave={hasEndTime ? onLeave : undefined}
            title={hasEndTime ? L.jumpToEndTooltip : L.noEndTimeTooltip}
          >⏭</button>
        )}

      </div>

      {/* ── Right: LIVE (if position=right) + swim-lane toggle (or spacer) ── */}
      {!isNarrow && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
          {liveButtonPosition === 'right' && LiveButton}
          {onToggleSwimLanes != null && swimLanesVisible != null && (
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
          )}
        </div>
      )}

      {isNarrow && onToggleSwimLanes != null && swimLanesVisible != null && (
        <button
          onClick={onToggleSwimLanes}
          style={{
            ...baseBtn,
            color: theme.buttonActiveColor,
            borderColor: `${theme.buttonActiveColor}33`,
            marginLeft: '4px',
          }}
          onMouseEnter={e => onEnter(e, swimLanesVisible)}
          onMouseLeave={onLeave}
          title={swimLanesVisible ? L.collapseSwimLanesTooltip : L.expandSwimLanesTooltip}
        >
          {swimLanesVisible ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      )}
    </div>
  );
};
