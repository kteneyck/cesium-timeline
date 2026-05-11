# Cesium Timeline - Test Application

A standalone test application for the Timeline component that integrates with Cesium's clock system.

## Quick Start

```bash
cd cesium-timeline
npm install
npm run dev:demo
```

Opens automatically at http://localhost:5173/

## Features

### Cesium Integration ✅
- **Real Cesium Viewer** - Full 3D globe display
- **Clock Synchronization** - Timeline synced to Cesium clock
- **Bidirectional Updates** - Dragging timeline updates Cesium time, clock updates timeline
- **Time Range** - Today (midnight to midnight)
- **Multiplier Support** - Speed changes affect Cesium clock playback speed

### Timeline Display
- **Full-width SVG timeline** showing entire day (midnight to midnight)
- **Current time indicator** (red vertical line) synced to Cesium clock
- **Customizable height** (60-200px via slider)
- **Configurable tick intervals** (5-minute, 15-minute, 30-minute, hourly)
- **Time labels** on major ticks
- **Smooth animations** during playback

### Playback Controls
- **Play/Pause buttons** to start/stop Cesium animation
- **Rewind button** to jump back to start of day
- **Speed multiplier selector** (0.5x to 10x)
  - 0.5x: Slow motion
  - 1x: Real-time (default)
  - 2x, 5x, 10x: Accelerated playback

### Interactive Features
- **Draggable indicator** - Click and drag the red line to seek to any time (updates Cesium)
- **Click-to-seek** - Click anywhere on the timeline to jump to that time
- **Play/Pause integration** - Cesium controls mirror to timeline
- **Speed multiplier** - Affects how fast Cesium time advances

## Architecture

### App State
- `cesiumClock` - Reference to Cesium clock instance
- `currentTime` - JavaScript Date synced with Cesium time
- `speedMultiplier` - Speed multiplier (0.5-10)
- `isPlaying` - Derived from `cesiumClock.shouldAnimate`

### Cesium Setup
On component mount:
1. Creates Cesium Viewer in DOM container
2. Configures clock:
   - Start: Midnight today
   - Stop: 11:59:59 PM today
   - Range: CLAMPED (stops at boundaries)
   - Step: SYSTEM_CLOCK_MULTIPLIER (respects multiplier)
3. Listens to `clock.onTick` for updates
4. Passes clock to Timeline component

### Data Flow
```
User drags timeline indicator
         ↓
onCurrentTimeChange callback triggered
         ↓
Updates Cesium clock.currentTime with JulianDate
         ↓
Cesium clock fires onTick event
         ↓
currentTime state updated with new Date
         ↓
Timeline re-renders with new position
```

## How Cesium Integration Works

### 1. Initialize Cesium Viewer
```typescript
const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
  animation: false,       // Disable built-in timeline
  timeline: false,        // Disable Cesium's timeline
  // ... other options
});
```

### 2. Configure Clock
```typescript
viewer.clock.startTime = Cesium.JulianDate.fromDate(startOfDay);
viewer.clock.stopTime = Cesium.JulianDate.fromDate(endOfDay);
viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
```

### 3. Listen to Clock Updates
```typescript
viewer.clock.onTick.addEventListener((clock: Cesium.Clock) => {
  const dateFromClock = Cesium.JulianDate.toDate(clock.currentTime);
  setCurrentTime(dateFromClock);
});
```

### 4. Update Clock on Timeline Drag
```typescript
const handleCurrentTimeChange = (newTime: Date) => {
  viewerRef.current.clock.currentTime = 
    Cesium.JulianDate.fromDate(newTime);
};
```

## Time Conversion

The app converts between JavaScript Date and Cesium JulianDate:
- **Input**: User drags timeline → JavaScript Date
- **Convert**: `Cesium.JulianDate.fromDate(date)` → JulianDate
- **Apply**: Update `clock.currentTime` with JulianDate
- **Output**: Clock fires onTick → `Cesium.JulianDate.toDate(julianDate)` → JavaScript Date

## Usage Scenarios

### Scenario 1: Play Animation
1. Click "▶ Play" button
2. Timeline indicator advances smoothly
3. Cesium globe updates in sync
4. Clock displays current time in info panel

### Scenario 2: Jump to Specific Time
1. Click anywhere on the timeline
2. Red indicator jumps to that position
3. Cesium time updates instantly
4. Playback continues from new time (if playing)

### Scenario 3: Drag to Scrub
1. Click and hold red indicator
2. Drag left/right to any position
3. Cesium time updates in real-time
4. Release to continue playback

### Scenario 4: Speed Up Animation
1. Select "5x (Very Fast)" from dropdown
2. Click Play
3. Timeline advances 5x faster
4. Cesium clock follows at same speed

## Control Panel

The right-side control panel provides:

- **Playback Section**
  - Play button (disabled when playing)
  - Pause button (disabled when paused)
  - Rewind button (jump to start)

- **Speed Multiplier Section**
  - Dropdown to select speed (0.5x, 1x, 2x, 5x, 10x)

- **Timeline Height Section**
  - Slider to adjust height (60-200px)
  - Current height display

- **Tick Interval Section**
  - Dropdown to select interval (5m, 15m, 30m, 1h)

- **Info Panel Section**
  - Playing status (Yes/No)
  - Current time display (HH:MM:SS)
  - Speed multiplier display
  - Viewer status (Ready/Loading)

## Troubleshooting

### Cesium viewer not showing
- Check browser console (F12) for errors
- Verify Cesium assets are loading
- Check network tab for 404 errors on Cesium files
- Try opening in a different browser

### Timeline not updating when Cesium plays
- Verify `cesiumClock` state is not null
- Check that clock.onTick listener is attached
- Look for errors in browser console
- Confirm `viewer.clock.shouldAnimate` is true

### Dragging timeline doesn't update Cesium
- Verify mouse events are firing
- Check that `viewerRef.current` is set
- Ensure `onCurrentTimeChange` callback is being called
- Verify Cesium JulianDate conversion is working

### Performance issues
- Disable complex Cesium features (terrain, high-res imagery)
- Reduce timeline height to 60px
- Check browser DevTools Performance tab
- Try a different browser

### Cesium time doesn't reach end of day
- Check clock.stopTime is set correctly
- Verify clock.clockRange = CLAMPED
- Ensure endTime calculation is correct (11:59:59 PM)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Cesium Requirements

- Cesium 1.100.0 or higher
- WebGL support required for 3D rendering
- Cesium assets must be available (included in dev build)
- ~100 MB of assets on first load (cached after)

## Development Commands

### Start Dev Server
```bash
npm run dev:demo
```

### Build Library
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Watch Tests
```bash
npm run test:watch
```

## Technical Details

### Clock Configuration
- **ClockRange**: CLAMPED - Stops at startTime/stopTime boundaries
- **ClockStep**: SYSTEM_CLOCK_MULTIPLIER - Respects multiplier value
- **StartTime**: 00:00:00 UTC today
- **StopTime**: 23:59:59 UTC today
- **Multiplier Range**: 0.5x to 10x

### Timeline Properties
- **Width**: 100% of container
- **Height**: Adjustable (60-200px)
- **Ticks**: 5-minute, 15-minute, 30-minute, or hourly intervals
- **Indicator**: Red vertical line with time label
- **Color Theme**: Dark mode optimized

### Update Frequency
- **Clock**: Updates on every Cesium frame (60 FPS)
- **Timeline**: Updates when state changes (~30 FPS default)
- **Rendering**: Optimized SVG with GPU acceleration

## Advanced Usage

### Change Time Range
Modify `startOfDay` and `endOfDay` in App.tsx:
```typescript
const startOfDay = new Date(2024, 0, 15, 6, 0, 0);  // 6:00 AM specific date
const endOfDay = new Date(2024, 0, 15, 18, 0, 0);   // 6:00 PM
```

### Custom Theme
Pass custom theme colors to Timeline component:
```typescript
theme={{
  backgroundColor: '#1a1a1a',
  lineColor: '#666',
  majorLineColor: '#999',
  textColor: '#ccc',
  indicatorColor: '#ff4444',
  indicatorLabelColor: '#e0e0e0',
}}
```

### Add Entities to Cesium
After viewer initialization:
```typescript
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(-122.0844, 37.4220),
  point: {
    pixelSize: 8,
    color: Cesium.Color.RED,
  },
});
```

## Integration into Main App

To use this timeline in the main application:

1. Import the Timeline component:
```typescript
import { Timeline } from '@kteneyck/cesium-timeline';
```

2. Pass Cesium clock reference:
```typescript
<Timeline
  clock={viewer.clock}
  onCurrentTimeChange={handleTimeChange}
  // ... other props
/>
```

3. Handle time changes:
```typescript
const handleTimeChange = (newTime: Date) => {
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(newTime);
};
```

See `src/Timeline.tsx` for complete API documentation.
