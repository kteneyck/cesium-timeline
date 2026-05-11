import React, { useRef, useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  formatDateTime,
  splitForDisplay,
} from '@kteneyck/cesium-timeline-core';

/** React-specific controls props (uses Cesium.JulianDate for currentTime). */
export interface ControlsProps {
  currentTime: Cesium.JulianDate;
  isPlaying: boolean;
  multiplier: number;
  dateTimeFormat?: string;
  onDateTimeClick?: () => void;
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

export const TimelineControls: React.FC<ControlsProps> = ({
  currentTime,
  isPlaying,
  multiplier,
  dateTimeFormat,
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
}) => {
  const isRewinding    = multiplier < 0;
  const isFastForward  = multiplier > 1;
  const isNormalSpeed  = multiplier === 1;
  const absMultiplier  = Math.abs(multiplier);

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
      {/* ── Left: Datetime + LIVE + speed badge ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div
          onClick={onDateTimeClick}
          title={onDateTimeClick ? 'Click to jump to a date/time' : undefined}
          style={{
            color: theme.labelColor,
            fontFamily: 'monospace',
            lineHeight: 1.15,
            cursor: onDateTimeClick ? 'pointer' : 'default',
            borderRadius: '4px',
            padding: '2px 4px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (onDateTimeClick) e.currentTarget.style.background = theme.buttonHoverColor + '44'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {(() => {
            const { timeFormat, dateFormat } = splitForDisplay(dateTimeFormat);
            return (
              <>
                {timeFormat && (
                  <div style={{ fontSize: '2em', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                    {formatDateTime(currentTime, timeFormat)}
                  </div>
                )}
                {dateFormat && (
                  <div style={{ fontSize: '1.15em', letterSpacing: '0.03em', color: theme.buttonActiveColor }}>
                    {formatDateTime(currentTime, dateFormat)}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* LIVE + speed badge — stacked to mirror the two-line datetime height */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
          {/* LIVE */}
          <button
            onClick={onJumpToLive}
            style={{
              ...baseBtn,
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '0.05em',
              width: '52px',
              minWidth: '52px',
              height: '20px',
              borderRadius: '3px',
              color:   isLive ? theme.controlBarBackground : theme.buttonActiveColor,
              backgroundColor: isLive ? theme.buttonActiveColor : 'transparent',
              borderColor: theme.buttonActiveColor,
              opacity: isLive ? 1 : 0.55,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = isLive ? '1' : '0.55'; }}
            title={isLive ? 'Currently live' : 'Jump to live (now)'}
          >
            {isLive ? '● LIVE' : 'LIVE'}
          </button>

          {/* Speed reset badge — same slot height whether visible or not */}
          <div style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
            {!isNormalSpeed && (
              <button
                onClick={() => onResetSpeed()}
                style={{
                  ...baseBtn,
                  fontSize: '11px',
                  color: theme.buttonActiveColor,
                  borderColor: `${theme.buttonActiveColor}44`,
                  width: '52px',
                  minWidth: '52px',
                  height: '20px',
                }}
                onMouseEnter={e => onEnter(e, true)}
                onMouseLeave={onLeave}
                title="Reset to 1× speed"
              >
                {isRewinding ? `◀ ${absMultiplier}×` : `${absMultiplier}× ▶`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Center: Transport buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', ...(isNarrow ? { flex: 1, justifyContent: 'center' } : {}) }}>

        {showJumpToStart && (
          <button
            onClick={hasStartTime ? onJumpToStart : undefined}
            disabled={!hasStartTime}
            style={{ ...btn(false), opacity: hasStartTime ? 1 : 0.3, cursor: hasStartTime ? 'pointer' : 'default' }}
            onMouseEnter={hasStartTime ? e => onEnter(e, false) : undefined}
            onMouseLeave={hasStartTime ? onLeave : undefined}
            title={hasStartTime ? 'Jump to start' : 'No start time set'}
          >⏮</button>
        )}

        <button
          onClick={onRewind}
          style={{ ...btn(isRewinding), width: '64px', minWidth: '64px', gap: '3px' }}
          onMouseEnter={e => onEnter(e, isRewinding)}
          onMouseLeave={onLeave}
          title={isRewinding ? `Reverse ${absMultiplier}× — click to speed up, press play to stop` : 'Rewind'}
        >
          {isRewinding ? (
            <><span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span>◀◀</>
          ) : '◀◀'}
        </button>

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
          title={isPlaying ? 'Pause' : (isRewinding ? 'Play (reset to 1×)' : 'Play')}
        >
          {isPlaying ? <PauseIcon /> : '▶'}
        </button>

        <button
          onClick={onFastForward}
          style={{ ...btn(isFastForward), width: '64px', minWidth: '64px', gap: '3px' }}
          onMouseEnter={e => onEnter(e, isFastForward)}
          onMouseLeave={onLeave}
          title={isFastForward ? `${absMultiplier}× speed — click to increase, click again at max to reset` : 'Fast forward'}
        >
          {isFastForward ? (
            <>▶▶<span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span></>
          ) : '▶▶'}
        </button>

        {showJumpToEnd && (
          <button
            onClick={hasEndTime ? onJumpToEnd : undefined}
            disabled={!hasEndTime}
            style={{ ...btn(false), opacity: hasEndTime ? 1 : 0.3, cursor: hasEndTime ? 'pointer' : 'default' }}
            onMouseEnter={hasEndTime ? e => onEnter(e, false) : undefined}
            onMouseLeave={hasEndTime ? onLeave : undefined}
            title={hasEndTime ? 'Jump to end' : 'No end time set'}
          >⏭</button>
        )}

      </div>

      {/* ── Right: swim-lane toggle (or spacer) ── */}
      {!isNarrow && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
              title={swimLanesVisible ? 'Collapse swim lanes' : 'Expand swim lanes'}
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
          title={swimLanesVisible ? 'Collapse swim lanes' : 'Expand swim lanes'}
        >
          {swimLanesVisible ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      )}
    </div>
  );
};
