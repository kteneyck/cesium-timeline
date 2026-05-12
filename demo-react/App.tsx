import { useState, useEffect, useRef, useMemo } from 'react';
import { Timeline } from '../packages/react/src/Timeline';
import { defaultTheme } from '../packages/core/src/types';
import type { TimelineTheme, SwimLane, SwimLaneEventInfo } from '../packages/core/src/types';
import { DateTimeFormats } from '../packages/core/src/utils';
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
  const [timelineHeight, setTimelineHeight] = useState(150);
  const [showControls, setShowControls] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [snapToTicks, setSnapToTicks] = useState(false);
  const [enableDrag, setEnableDrag] = useState(true);
  const [tickInterval, setTickInterval] = useState<number>(60);
  const [dateTimeFormat, setDateTimeFormat] = useState(DateTimeFormats.DEFAULT);
  const [timezone, setTimezone] = useState('local');

  const TIMEZONE_OPTIONS: [string, string][] = [
    ['local',                 'Local (browser)'],
    ['UTC',                   'UTC'],
    ['America/New_York',      'New York (ET)'],
    ['America/Chicago',       'Chicago (CT)'],
    ['America/Denver',        'Denver (MT)'],
    ['America/Los_Angeles',   'Los Angeles (PT)'],
    ['Europe/London',         'London (GMT/BST)'],
    ['Europe/Berlin',         'Berlin (CET/CEST)'],
    ['Europe/Moscow',         'Moscow (MSK)'],
    ['Asia/Dubai',            'Dubai (GST)'],
    ['Asia/Kolkata',          'India (IST)'],
    ['Asia/Tokyo',            'Tokyo (JST)'],
    ['Australia/Sydney',      'Sydney (AEST)'],
    ['Pacific/Auckland',      'Auckland (NZST)'],
  ];

  // Theme
  const [theme, setTheme] = useState<TimelineTheme>({ ...defaultTheme, backgroundColor: '#2a2a2a' });

  // DateTime picker state (demo uses a simple native datetime-local input as a stand-in)
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pickerValue, setPickerValue] = useState('');
  const [jumpToTime,  setJumpToTime]  = useState<Date | undefined>(undefined);

  // Swim lane state
  const [showSwimLanes, setShowSwimLanes] = useState(true);
  const [swimLaneTransition, setSwimLaneTransition] = useState<'animated' | 'instant'>('animated');
  const [swimLaneLog, setSwimLaneLog] = useState<string[]>([]);

  // Demo swim lane data — relative to "now"
  const swimLanes = useMemo<SwimLane[]>(() => {
    const now = new Date();
    const h = (hours: number) => {
      const d = new Date(now);
      d.setHours(d.getHours() + hours, 0, 0, 0);
      return Cesium.JulianDate.fromDate(d);
    };
    return [
      {
        id: 'satellite-passes',
        label: 'Sat Passes',
        items: [
          { id: 'pass-1', interval: new Cesium.TimeInterval({ start: h(-4), stop: h(-3) }), style: { color: '#4da6ff' }, data: { name: 'ISS Pass' } },
          { id: 'pass-2', interval: new Cesium.TimeInterval({ start: h(-1), stop: h(0.5) }), style: { color: '#4da6ff' }, data: { name: 'ISS Pass 2' } },
          { id: 'pass-3', interval: new Cesium.TimeInterval({ start: h(3), stop: h(4) }), style: { color: '#66bb6a' }, data: { name: 'Hubble Pass' } },
        ],
      },
      {
        id: 'ground-contacts',
        label: 'Ground',
        items: [
          { id: 'gc-1', interval: new Cesium.TimeInterval({ start: h(-5), stop: h(-4.5) }), style: { color: '#ff9800' } },
          { id: 'gc-2', interval: new Cesium.TimeInterval({ start: h(1), stop: h(2) }), style: { color: '#ff9800' } },
          { id: 'gc-3', interval: new Cesium.TimeInterval({ start: h(5), stop: h(6) }), style: { color: '#ffc107' } },
        ],
      },
      {
        id: 'events',
        label: 'Events',
        items: [
          { id: 'evt-1', instant: h(-3), style: { color: '#f44336', markerShape: 'diamond' as const }, data: { name: 'Anomaly' } },
          { id: 'evt-2', instant: h(0), style: { color: '#4caf50', markerShape: 'circle' as const }, data: { name: 'GO' } },
          { id: 'evt-3', instant: h(2.5), style: { color: '#e040fb', markerShape: 'line' as const }, data: { name: 'Maneuver' } },
        ],
      },
      {
        id: 'maintenance',
        label: 'Maint.',
        items: [
          { id: 'mt-1', interval: new Cesium.TimeInterval({ start: h(-8), stop: h(-6) }), style: { color: '#78909c' } },
          { id: 'mt-2', interval: new Cesium.TimeInterval({ start: h(7), stop: h(10) }), style: { color: '#78909c' } },
        ],
        style: { backgroundColor: 'rgba(120,144,156,0.08)' },
      },
    ];
  }, []);

  const handleSwimLaneClick = (info: SwimLaneEventInfo) => {
    const msg = `Click: lane=${info.laneId} item=${info.item.id}`;
    setSwimLaneLog(prev => [msg, ...prev].slice(0, 8));
  };

  const handleSwimLaneHover = (info: SwimLaneEventInfo | null) => {
    if (info) {
      const msg = `Hover: lane=${info.laneId} item=${info.item.id}`;
      setSwimLaneLog(prev => [msg, ...prev].slice(0, 8));
    }
  };

  const handleSwimLaneReorder = (ids: string[]) => {
    const msg = `Reorder: ${ids.join(', ')}`;
    setSwimLaneLog(prev => [msg, ...prev].slice(0, 8));
  };

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

  const handleDateTimeClick = () => {
    // Pre-fill with current time in datetime-local format
    const iso = new Date(currentTime.getTime() - currentTime.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    setPickerValue(iso);
    setPickerOpen(true);
  };

  const handlePickerApply = () => {
    const d = new Date(pickerValue);
    if (!isNaN(d.getTime())) {
      setJumpToTime(new Date(d));
    }
    setPickerOpen(false);
  };

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

        .content {
          flex: 1;
          display: flex;
          overflow: hidden;
          min-height: 0;
        }

        .timeline-wrapper {
          width: 100%;
          background: #2a2a2a;
          border-top: 1px solid #444;
          padding: 0;
          flex-shrink: 0;
        }

        .cesium-container {
          flex: 1;
          background: #000;
          position: relative;
          min-height: 0;
          overflow: hidden;
        }

        /* Force Cesium's internal widgets to fill the container */
        .cesium-container .cesium-viewer,
        .cesium-container .cesium-viewer-cesiumWidgetContainer,
        .cesium-container .cesium-widget,
        .cesium-container .cesium-widget canvas {
          width: 100% !important;
          height: 100% !important;
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
          width: 5rem;
          flex-shrink: 0;
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

        .prop-row input:not([type="color"]), .prop-row select {
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
              <label>Show Swim Lanes</label>
              <button className={`toggle-btn ${showSwimLanes ? 'on' : 'off'}`} onClick={() => setShowSwimLanes(v => !v)}>
                {showSwimLanes ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="prop-row">
              <label>Lane Transition</label>
              <select value={swimLaneTransition} onChange={e => setSwimLaneTransition(e.target.value as 'animated' | 'instant')}>
                <option value="animated">Animated</option>
                <option value="instant">Instant</option>
              </select>
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
              <label>Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONE_OPTIONS.map(([tz, label]) => (
                  <option key={tz} value={tz}>{label}</option>
                ))}
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
              ['swimLaneItemBorderColor', 'Lane Item Border'],
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
              ['fontSize',           'Font Size',        8, 20],
              ['swimLaneItemBorderWidth', 'Lane Item Border W', 0, 6],
            ] as [keyof TimelineTheme, string, number, number][]).map(([key, label, min, max]) => (
              <div className="prop-row" key={key}>
                <label>{label}</label>
                <input type="range" min={min} max={max} value={theme[key] as number}
                  onChange={e => setThemeProp(key, +e.target.value)} />
                <span style={{ color: '#4da6ff', minWidth: '28px', textAlign: 'right', fontSize: '12px' }}>{theme[key]}</span>
              </div>
            ))}
          </div>

          {/* ── Swim Lane Events Log ── */}
          <div className="control-section">
            <div className="section-title">Swim Lane Events</div>
            <div className="info-panel" style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '11px' }}>
              {swimLaneLog.length === 0 ? (
                <span style={{ color: '#666' }}>Click/hover swim lane items…</span>
              ) : (
                swimLaneLog.map((msg, i) => (
                  <div key={i} style={{ color: i === 0 ? '#4da6ff' : '#888' }}>{msg}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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
            timezone={timezone === 'local' ? undefined : timezone}
            onDateTimeClick={handleDateTimeClick}
            jumpToTime={jumpToTime}
            theme={theme}
            swimLanes={swimLanes}
            showSwimLanes={showSwimLanes}
            onShowSwimLanesChange={setShowSwimLanes}
            swimLaneTransition={swimLaneTransition}
            onSwimLaneItemClick={handleSwimLaneClick}
            onSwimLaneItemHover={handleSwimLaneHover}
            onSwimLaneReorder={handleSwimLaneReorder}
          />
        )}
      </div>

      {/* ── Demo datetime picker overlay(replace with PrimeReact Calendar etc. in production) ── */}
      {pickerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            style={{
              background: '#242424', border: '1px solid #444', borderRadius: '8px',
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
              minWidth: '280px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Jump to Date/Time
            </div>
            <input
              type="datetime-local"
              value={pickerValue}
              onChange={e => setPickerValue(e.target.value)}
              style={{
                background: '#333', border: '1px solid #555', color: '#e0e0e0',
                borderRadius: '4px', padding: '8px', fontSize: '13px', width: '100%',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPickerOpen(false)} style={{ flex: 1 }}>Cancel</button>
              <button
                onClick={handlePickerApply}
                style={{ flex: 1, background: '#d69826', borderColor: '#d69826', color: '#111', fontWeight: 600 }}
              >
                Jump
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestApp;
