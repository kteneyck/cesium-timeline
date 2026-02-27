import { useState, useEffect, useRef } from 'react';
import { Timeline } from '../src/Timeline';
import { defaultTheme } from '../src/types';
import type { TimelineTheme } from '../src/types';
import { DateTimeFormats } from '../src/utils';
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

  // Timeline props
  const [timelineHeight, setTimelineHeight] = useState(35);
  const [showControls, setShowControls] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [snapToTicks, setSnapToTicks] = useState(false);
  const [enableDrag, setEnableDrag] = useState(true);
  const [tickInterval, setTickInterval] = useState<number>(60);
  const [dateTimeFormat, setDateTimeFormat] = useState(DateTimeFormats.DEFAULT);

  // Theme
  const [theme, setTheme] = useState<TimelineTheme>({ ...defaultTheme, backgroundColor: '#2a2a2a' });

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

  const handlePlayPause = (playing: boolean) => {
    if (viewerRef.current) {
      viewerRef.current.clock.shouldAnimate = playing;
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

  const setThemeProp= <K extends keyof TimelineTheme>(key: K, value: TimelineTheme[K]) =>
    setTheme(t => ({ ...t, [key]: value }));

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

        input[type="color"] {
          padding: 2px;
          height: 32px;
          width: 100%;
          background: #333;
          border: 1px solid #555;
          border-radius: 4px;
          cursor: pointer;
        }

        .prop-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
        }

        .prop-row label {
          color: #aaa;
          flex-shrink: 0;
        }

        .prop-row input, .prop-row select {
          flex: 1;
          min-width: 0;
        }

        .toggle-btn {
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          border-radius: 3px;
          min-width: 40px;
          height: 24px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }

        .toggle-btn.on {
          background: #4da6ff;
          color: #111;
          border-color: #4da6ff;
        }

        .toggle-btn.off {
          background: #333;
          color: #666;
          border-color: #555;
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
            currentTime={currentTime}
            clock={viewerRef.current?.clock}
            onTimeChange={handleCurrentTimeChange}
            onPlayPause={handlePlayPause}
            onMultiplierChange={handleMultiplierChange}
            showControls={showControls}
            showLabels={showLabels}
            snapToTicks={snapToTicks}
            enableDrag={enableDrag}
            height={timelineHeight}
            tickInterval={tickInterval}
            dateTimeFormat={dateTimeFormat}
            theme={theme}
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

          {/* ── Timeline Props ── */}
          <div className="control-section">
            <div className="section-title">Timeline Props</div>

            <div className="prop-row">
              <label>Height</label>
              <input type="range" min="30" max="200" value={timelineHeight}
                onChange={e => setTimelineHeight(+e.target.value)} />
              <span style={{ color: '#4da6ff', minWidth: '36px', textAlign: 'right', fontSize: '12px' }}>{timelineHeight}px</span>
            </div>

            <div className="prop-row">
              <label>Show Controls</label>
              <button className={`toggle-btn ${showControls ? 'on' : 'off'}`} onClick={() => setShowControls(v => !v)}>
                {showControls ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="prop-row">
              <label>Show Labels</label>
              <button className={`toggle-btn ${showLabels ? 'on' : 'off'}`} onClick={() => setShowLabels(v => !v)}>
                {showLabels ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="prop-row">
              <label>Snap to Ticks</label>
              <button className={`toggle-btn ${snapToTicks ? 'on' : 'off'}`} onClick={() => setSnapToTicks(v => !v)}>
                {snapToTicks ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="prop-row">
              <label>Enable Drag</label>
              <button className={`toggle-btn ${enableDrag ? 'on' : 'off'}`} onClick={() => setEnableDrag(v => !v)}>
                {enableDrag ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="prop-row">
              <label>Tick Interval</label>
              <select value={tickInterval} onChange={e => setTickInterval(+e.target.value)}>
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour</option>
              </select>
            </div>

            <div className="prop-row">
              <label>Date/Time Format</label>
              <select value={dateTimeFormat} onChange={e => setDateTimeFormat(e.target.value)}>
                {Object.entries(DateTimeFormats).map(([key, fmt]) => (
                  <option key={key} value={fmt}>{key.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="divider" />

          {/* ── Theme ── */}
          <div className="control-section">
            <div className="section-title">Theme — Colors</div>

            {([
              ['backgroundColor',     'Background'],
              ['controlBarBackground','Control Bar Bg'],
              ['controlBarBorder',    'Control Bar Border'],
              ['tickColor',           'Tick'],
              ['majorTickColor',      'Major Tick'],
              ['labelColor',          'Label'],
              ['indicatorColor',      'Indicator'],
              ['buttonColor',         'Button'],
              ['buttonHoverColor',    'Button Hover'],
              ['buttonActiveColor',   'Button Active'],
            ] as [keyof TimelineTheme, string][]).map(([key, label]) => (
              <div className="prop-row" key={key}>
                <label>{label}</label>
                <input type="color" value={theme[key] as string}
                  onChange={e => setThemeProp(key, e.target.value)} />
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="control-section">
            <div className="section-title">Theme — Sizes</div>

            {([
              ['indicatorLineWidth', 'Indicator Width', 1, 8],
              ['majorTickHeight',    'Major Tick H',    4, 24],
              ['minorTickHeight',    'Minor Tick H',    2, 16],
              ['fontSize',          'Font Size',        8, 20],
            ] as [keyof TimelineTheme, string, number, number][]).map(([key, label, min, max]) => (
              <div className="prop-row" key={key}>
                <label>{label}</label>
                <input type="range" min={min} max={max} value={theme[key] as number}
                  onChange={e => setThemeProp(key, +e.target.value)} />
                <span style={{ color: '#4da6ff', minWidth: '28px', textAlign: 'right', fontSize: '12px' }}>{theme[key]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestApp;
