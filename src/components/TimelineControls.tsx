import React from 'react';
import { ControlsProps } from '../types';
import { formatTime } from '../utils/timeConversion';

export const TimelineControls: React.FC<ControlsProps> = ({
  currentTime,
  isPlaying,
  multiplier,
  onPlayPause,
  onRewind,
  onMultiplierChange,
  multiplierOptions,
  theme,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '8px 16px',
        backgroundColor: theme.controlBarBackground,
        borderBottom: `1px solid ${theme.controlBarBorder}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Current Time Display */}
      <div
        style={{
          minWidth: '100px',
          textAlign: 'center',
          color: theme.labelColor,
          fontSize: theme.fontSize,
          fontWeight: 'bold',
        }}
      >
        {formatTime(currentTime, true)}
      </div>

      {/* Play/Pause Button */}
      <button
        onClick={() => onPlayPause(!isPlaying)}
        style={{
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
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = theme.buttonHoverColor)
        }
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Rewind Button */}
      <button
        onClick={onRewind}
        style={{
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
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = theme.buttonHoverColor)
        }
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Rewind to start"
      >
        ⏮
      </button>

      {/* Multiplier Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label
          htmlFor="multiplier-select"
          style={{
            color: theme.labelColor,
            fontSize: theme.fontSize,
          }}
        >
          Speed:
        </label>
        <select
          id="multiplier-select"
          value={multiplier}
          onChange={(e) => onMultiplierChange(parseFloat(e.target.value))}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: `1px solid ${theme.buttonColor}`,
            backgroundColor: theme.controlBarBackground,
            color: theme.labelColor,
            cursor: 'pointer',
            fontSize: theme.fontSize,
          }}
        >
          {multiplierOptions.map((option) => (
            <option key={option} value={option}>
              {option}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
