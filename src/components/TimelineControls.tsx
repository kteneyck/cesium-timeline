import React from 'react';
import { ControlsProps } from '../types';
import { formatDateTime, splitForDisplay } from '../utils/timeConversion';

export const TimelineControls: React.FC<ControlsProps> = ({
  currentTime,
  isPlaying,
  multiplier,
  dateTimeFormat,
  isLive,
  onPlayPause,
  onJumpToStart,
  onRewind,
  onFastForward,
  onJumpToEnd,
  onJumpToLive,
  theme,
}) => {
  const isRewinding    = multiplier < 0;
  const isFastForward  = multiplier > 1;
  const isNormalSpeed  = multiplier === 1;
  const absMultiplier  = Math.abs(multiplier);

  const baseBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '32px',
    borderRadius: '4px',
    transition: 'background-color 0.15s, color 0.15s',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const btn  = (active: boolean): React.CSSProperties => ({
    ...baseBtn,
    color:  active ? theme.buttonActiveColor : theme.buttonColor,
    border: active ? `1px solid ${theme.buttonActiveColor}33` : '1px solid transparent',
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 16px',
        backgroundColor: theme.controlBarBackground,
        borderBottom: `1px solid ${theme.controlBarBorder}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Datetime display ── */}
      <div
        style={{
          minWidth: '130px',
          color: theme.labelColor,
          fontFamily: 'monospace',
          lineHeight: 1.1,
          marginRight: '8px',
        }}
      >
        {(() => {
          const { timeFormat, dateFormat } = splitForDisplay(dateTimeFormat);
          return (
            <>
              {timeFormat && (
                <div style={{ fontSize: '1.45em', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                  {formatDateTime(currentTime, timeFormat)}
                </div>
              )}
              {dateFormat && (
                <div style={{ fontSize: '1em', letterSpacing: '0.03em', color: theme.buttonActiveColor }}>
                  {formatDateTime(currentTime, dateFormat)}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Transport controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, justifyContent: 'center' }}>

        {/* Jump to start */}
        <button
          onClick={onJumpToStart}
          style={btn(false)}
          onMouseEnter={e => onEnter(e, false)}
          onMouseLeave={onLeave}
          title="Jump to start"
        >⏮</button>

        {/* Rewind — cycles reverse speeds; active when multiplier < 0 */}
        <button
          onClick={onRewind}
          style={{ ...btn(isRewinding), gap: '3px', minWidth: isRewinding ? '52px' : '32px' }}
          onMouseEnter={e => onEnter(e, isRewinding)}
          onMouseLeave={onLeave}
          title={isRewinding ? `Reverse ${absMultiplier}× — click to speed up, press play to stop` : 'Reverse play'}
        >
          {isRewinding ? (
            <><span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span>◀◀</>
          ) : '◀◀'}
        </button>

        {/* Play / Pause */}
        <button
          onClick={() => onPlayPause(!isPlaying)}
          style={{
            ...baseBtn,
            color: theme.buttonActiveColor,
            fontSize: '20px',
            minWidth: '40px',
            height: '40px',
            border: `1px solid ${theme.buttonActiveColor}55`,
            borderRadius: '50%',
          }}
          onMouseEnter={e => onEnter(e, true)}
          onMouseLeave={onLeave}
          title={isPlaying ? 'Pause' : (isRewinding ? 'Play (reset to 1×)' : 'Play')}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Fast Forward — cycles 2×→4×→8×→16×→32×→1×; active when multiplier > 1 */}
        <button
          onClick={onFastForward}
          style={{ ...btn(isFastForward), gap: '3px', minWidth: isFastForward ? '52px' : '32px' }}
          onMouseEnter={e => onEnter(e, isFastForward)}
          onMouseLeave={onLeave}
          title={isFastForward ? `${absMultiplier}× speed — click to increase, click again at max to reset` : 'Fast forward'}
        >
          {isFastForward ? (
            <>▶▶<span style={{ fontSize: '11px', fontWeight: 'bold' }}>{absMultiplier}×</span></>
          ) : '▶▶'}
        </button>

        {/* Jump to end */}
        <button
          onClick={onJumpToEnd}
          style={btn(false)}
          onMouseEnter={e => onEnter(e, false)}
          onMouseLeave={onLeave}
          title="Jump to end"
        >⏭</button>

        {/* LIVE */}
        <button
          onClick={onJumpToLive}
          style={{
            ...baseBtn,
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            minWidth: '44px',
            padding: '3px 8px',
            borderRadius: '3px',
            color:   isLive ? theme.controlBarBackground : theme.buttonActiveColor,
            backgroundColor: isLive ? theme.buttonActiveColor : 'transparent',
            border: `1px solid ${theme.buttonActiveColor}`,
            opacity: isLive ? 1 : 0.55,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = isLive ? '1' : '0.55'; }}
          title={isLive ? 'Currently live' : 'Jump to live (now)'}
        >
          {isLive ? '● LIVE' : 'LIVE'}
        </button>

        {/* Speed reset badge */}
        {!isNormalSpeed && (
          <button
            onClick={() => onPlayPause(isPlaying)}
            style={{
              ...baseBtn,
              fontSize: '11px',
              color: theme.buttonActiveColor,
              border: `1px solid ${theme.buttonActiveColor}44`,
              minWidth: '44px',
              padding: '3px 6px',
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
  );
};

