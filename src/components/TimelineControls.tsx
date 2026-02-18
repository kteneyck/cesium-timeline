import React from 'react';
import { ControlsProps } from '../types';
import { formatTime } from '../utils/timeConversion';

const SPEED_MULTIPLIERS = [0.5, 1, 2, 5, 10];

export const TimelineControls: React.FC<ControlsProps & { onJumpToEnd?: () => void }> = ({
  currentTime,
  isPlaying,
  multiplier,
  onPlayPause,
  onRewind,
  onMultiplierChange,
  onJumpToEnd,
  theme,
}) => {
  const handleRewind = () => {
    const currentIndex = SPEED_MULTIPLIERS.indexOf(Math.abs(multiplier));
    if (currentIndex < SPEED_MULTIPLIERS.length - 1) {
      onMultiplierChange(-SPEED_MULTIPLIERS[currentIndex + 1]);
    }
  };

  const handleFastForward = () => {
    const currentIndex = SPEED_MULTIPLIERS.indexOf(Math.abs(multiplier));
    if (currentIndex < SPEED_MULTIPLIERS.length - 1) {
      onMultiplierChange(SPEED_MULTIPLIERS[currentIndex + 1]);
    }
  };

  const speedDisplay = multiplier < 0 ? `${Math.abs(multiplier)}x ◀` : `${multiplier}x ▶`;

  const buttonStyle = {
    background: 'none',
    border: 'none',
    color: theme.buttonColor,
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  };

  const handleButtonEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.buttonHoverColor;
  };

  const handleButtonLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '8px 16px',
        backgroundColor: theme.controlBarBackground,
        borderBottom: `1px solid ${theme.controlBarBorder}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Current Time Display */}
      <div
        style={{
          minWidth: '120px',
          textAlign: 'center',
          color: theme.labelColor,
          fontSize: theme.fontSize,
          fontWeight: 'bold',
        }}
      >
        {formatTime(currentTime, true)}
      </div>

      {/* Jump to Start Button */}
      <button
        onClick={onRewind}
        style={buttonStyle as React.CSSProperties}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
        title="Jump to start"
      >
        ⏮
      </button>

      {/* Rewind Button */}
      <button
        onClick={handleRewind}
        style={buttonStyle as React.CSSProperties}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
        title="Decrease playback speed (rewind mode)"
      >
        ⏪
      </button>

      {/* Play/Pause Button */}
      <button
        onClick={() => onPlayPause(!isPlaying)}
        style={buttonStyle as React.CSSProperties}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Fast Forward Button */}
      <button
        onClick={handleFastForward}
        style={buttonStyle as React.CSSProperties}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
        title="Increase playback speed"
      >
        ⏩
      </button>

      {/* Jump to End Button */}
      <button
        onClick={onJumpToEnd}
        style={buttonStyle as React.CSSProperties}
        onMouseEnter={handleButtonEnter}
        onMouseLeave={handleButtonLeave}
        title="Jump to end"
      >
        ⏭
      </button>

      {/* Speed Display */}
      <div
        style={{
          minWidth: '80px',
          textAlign: 'center',
          color: theme.labelColor,
          fontSize: theme.fontSize,
          fontWeight: 'bold',
          marginLeft: '8px',
        }}
      >
        {speedDisplay}
      </div>
    </div>
  );
};
