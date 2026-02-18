import { useState, useEffect, useRef } from 'react';
import { Timeline } from '../src/Timeline';
import type { TickInterval } from '../src/types';
import * as Cesium from 'cesium';

// Set Cesium base URL for assets
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwN2JhODAwMS1iZTE2LTRmZmYtYTk2YS0yOWNmZjI1ZGZiYjEiLCJpZCI6MTcyLCJpYXQiOjE3MTM4MzY4Nzh9.YNelHnfVnWcjF6imsMI8uQAPWJUWnp96ywhDYRt83bo';

// Use offline Cesium assets from public folder
if (!window.CESIUM_BASE_URL) {
  window.CESIUM_BASE_URL = import.meta.env.CESIUM_BASE_URL || '/cesium/';
}

export const TestApp: React.FC = () => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const [cesiumClock, setCesiumClock] = useState<Cesium.Clock | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [timelineHeight, setTimelineHeight] = useState(80);
  const [tickInterval, setTickInterval] = useState<TickInterval>('1h');

  // Initialize Cesium viewer
  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    let viewer: Cesium.Viewer | null = null;

    try {
      viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
      });

      // Configure the clock for today
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      viewer.clock.startTime = Cesium.JulianDate.fromDate(startOfDay);
      viewer.clock.stopTime = Cesium.JulianDate.fromDate(endOfDay);
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
      viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      viewer.clock.multiplier = 1;

      viewerRef.current = viewer;
      setCesiumClock(viewer.clock);
      setCurrentTime(now);

      // Listen to clock tick updates
      const onClockTick = (clock: Cesium.Clock) => {
        const dateFromClock = Cesium.JulianDate.toDate(clock.currentTime);
        setCurrentTime(dateFromClock);
      };

      viewer.clock.onTick.addEventListener(onClockTick);

      return () => {
        if (viewer) {
          viewer.clock.onTick.removeEventListener(onClockTick);
          viewer.destroy();
          viewerRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to initialize Cesium viewer:', error);
      if (viewer) {
        try {
          viewer.destroy();
        } catch (e) {
          console.error('Failed to clean up viewer:', e);
        }
      }
    }
  }, []);

  // Update clock multiplier when speed changes
  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.clock.multiplier = speedMultiplier;
    }
  }, [speedMultiplier]);

  const handlePlay = () => {
    if (viewerRef.current) {
      viewerRef.current.clock.shouldAnimate = true;
    }
  };

  const handlePause = () => {
    if (viewerRef.current) {
      viewerRef.current.clock.shouldAnimate = false;
    }
  };

  const handlePlayPause = (playing: boolean) => {
    if (viewerRef.current) {
      viewerRef.current.clock.shouldAnimate = playing;
    }
  };

  const handleRewind = () => {
    if (viewerRef.current) {
      const startOfDay = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 0, 0, 0);
      viewerRef.current.clock.currentTime = Cesium.JulianDate.fromDate(startOfDay);
      viewerRef.current.clock.shouldAnimate = false;
    }
  };

  const handleCurrentTimeChange = (newTime: Cesium.JulianDate) => {
    if (viewerRef.current) {
      viewerRef.current.clock.currentTime = newTime;
    }
  };

  const handleMultiplierChange = (multiplier: number) => {
    if (viewerRef.current) {
      viewerRef.current.clock.multiplier = multiplier;
    }
  };

  const startTime = new Date();
  startTime.setHours(0, 0, 0, 0);
  const endTime = new Date();
  endTime.setHours(23, 59, 59, 999);

  const isPlaying = viewerRef.current?.clock.shouldAnimate ?? false;

  return (
    <div className="app-container">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body, #root {
          width: 100%;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #1a1a1a;
          color: #e0e0e0;
        }

        .app-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #1a1a1a;
        }

        .timeline-wrapper {
          width: 100%;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
          padding: 0;
        }

        .content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .cesium-container {
          flex: 1;
          background: #000;
          position: relative;
          min-height: 0;
          overflow: hidden;
        }

        .cesium-container canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        .loading-message {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #999;
          font-size: 18px;
          background: rgba(0, 0, 0, 0.7);
          padding: 20px 40px;
          border-radius: 8px;
          text-align: center;
          z-index: 10;
        }

        .control-panel {
          width: 280px;
          background: #1a1a1a;
          border-left: 1px solid #444;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 0;
        }

        .control-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: #999;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .control-group {
          display: flex;
          gap: 8px;
        }

        .control-group button {
          flex: 1;
        }

        button {
          padding: 8px 12px;
          background: #333;
          border: 1px solid #555;
          color: #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        button:hover:not(:disabled) {
          background: #444;
          border-color: #666;
        }

        button:active:not(:disabled) {
          background: #555;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        select, input[type="range"], input[type="number"] {
          padding: 8px;
          background: #333;
          border: 1px solid #555;
          color: #e0e0e0;
          border-radius: 4px;
          font-size: 13px;
        }

        select:focus, input[type="range"]:focus, input[type="number"]:focus {
          outline: none;
          border-color: #666;
          background: #3a3a3a;
        }

        input[type="range"] {
          padding: 0;
          width: 100%;
          cursor: pointer;
        }

        .info-panel {
          background: #252525;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 12px;
          font-size: 12px;
          font-family: 'Monaco', 'Menlo', monospace;
          line-height: 1.6;
        }

        .info-row {
          display: flex;
          gap: 8px;
        }

        .info-label {
          color: #999;
          min-width: 100px;
        }

        .info-value {
          color: #4da6ff;
          word-break: break-all;
        }

        .divider {
          height: 1px;
          background: #444;
          margin: 8px 0;
        }

        .error-message {
          background: #3a2525;
          border: 1px solid #6a3535;
          color: #ff8888;
          padding: 12px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="timeline-wrapper">
        {cesiumClock && (
          <Timeline
            startTime={startTime}
            endTime={endTime}
            currentTime={currentTime}
            clock={viewerRef.current?.clock}
            onTimeChange={handleCurrentTimeChange}
            onPlayPause={handlePlayPause}
            onMultiplierChange={handleMultiplierChange}
            showControls={true}
            showLabels={true}
            snapToTicks={false}
            height={timelineHeight}
            tickInterval={tickInterval}
            theme={{
              backgroundColor: '#2a2a2a',
              lineColor: '#666',
              majorLineColor: '#999',
              textColor: '#ccc',
              indicatorColor: '#ff4444',
              indicatorLabelColor: '#e0e0e0',
            }}
          />
        )}
      </div>

      <div className="content">
        <div className="cesium-container" ref={cesiumContainerRef}>
          {!cesiumClock && (
            <div className="loading-message">Initializing Cesium Viewer...</div>
          )}
        </div>

        <div className="control-panel">
          {!cesiumClock && (
            <div className="error-message">
              ⚠️ Cesium Viewer is loading. Make sure Cesium assets are available.
            </div>
          )}

          <div className="control-section">
            <div className="section-title">Playback</div>
            <div className="control-group">
              <button onClick={handlePlay} disabled={!cesiumClock || isPlaying}>
                ▶ Play
              </button>
              <button onClick={handlePause} disabled={!cesiumClock || !isPlaying}>
                ⏸ Pause
              </button>
            </div>
            <button onClick={handleRewind} disabled={!cesiumClock}>
              ⏮ Rewind
            </button>
          </div>

          <div className="divider"></div>

          <div className="control-section">
            <div className="section-title">Speed Multiplier</div>
            <select
              value={speedMultiplier}
              onChange={(e) => {
                const newMultiplier = parseFloat(e.target.value);
                if (viewerRef.current) {
                  viewerRef.current.clock.multiplier = newMultiplier;
                }
              }}
              disabled={!cesiumClock}
            >
              <option value={0.5}>0.5x (Slow)</option>
              <option value={1}>1x (Normal)</option>
              <option value={2}>2x (Fast)</option>
              <option value={5}>5x (Very Fast)</option>
              <option value={10}>10x (Extreme)</option>
            </select>
          </div>

          <div className="divider"></div>

          <div className="control-section">
            <div className="section-title">Timeline Height</div>
            <div className="control-group">
              <input
                type="range"
                min="60"
                max="200"
                value={timelineHeight}
                onChange={(e) => setTimelineHeight(parseInt(e.target.value))}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#999', textAlign: 'center' }}>
              {timelineHeight}px
            </div>
          </div>

          <div className="divider"></div>

          <div className="control-section">
            <div className="section-title">Tick Interval</div>
            <select
              value={tickInterval}
              onChange={(e) => setTickInterval(e.target.value as TickInterval)}
            >
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="30m">30 Minutes</option>
              <option value="1h">1 Hour</option>
            </select>
          </div>

          <div className="divider"></div>

          <div className="info-panel">
            <div className="info-row">
              <span className="info-label">Playing:</span>
              <span className="info-value">{isPlaying ? 'Yes' : 'No'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Current:</span>
              <span className="info-value">{currentTime.toLocaleTimeString()}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Multiplier:</span>
              <span className="info-value">{speedMultiplier}x</span>
            </div>
            <div className="divider"></div>
            <div className="info-row">
              <span className="info-label">Viewer:</span>
              <span className="info-value">{cesiumClock ? 'Ready' : 'Loading'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestApp;
