# Cesium Timeline - Test App

A standalone test application for the Timeline component that uses the current system time.

## Features

This test app demonstrates:

✅ **Timeline with System Time**
- Uses current date as start of timeline
- Uses tomorrow's date as end
- Updates every second when playing

✅ **Real-Time Playback**
- Play/pause button to start/stop
- Speed multiplier control (0.5x, 1x, 2x, 5x, 10x)
- Automatic stop when reaching end

✅ **Interactive Features**
- Drag to scrub through the day
- Click to seek to specific time
- Rewind/play/jump buttons
- Live progress indicator

✅ **Customizable Options**
- Adjustable timeline height (60-200px)
- Configurable tick intervals (5-min, 15-min, 30-min, hourly)
- Toggle controls, labels, and snap-to-ticks
- Dark theme optimized for visibility

✅ **Information Panel**
- Current time display
- Progress percentage and milliseconds
- Playing/multiplier status
- Test controls for navigation

## Quick Start

### Run the Test App

```bash
cd cesium-timeline
npm run dev:demo
```

This will:
1. Start Vite dev server on http://localhost:5173
2. Open the app in your default browser
3. Display the timeline with current system time

### Using the Timeline

1. **View Current Time**: The timeline shows today's date (midnight to midnight)
2. **Play**: Click the play button to start real-time playback
3. **Scrub**: Drag the red line to move through time
4. **Seek**: Click anywhere on the timeline to jump to that time
5. **Speed Up**: Use the speed multiplier dropdown to play faster (2x, 5x, 10x)

### Test Controls

**Bottom Panel Controls:**
- **Reset to Start**: Jump to midnight
- **Jump to End**: Jump to end of day
- **Now**: Jump to current system time
- **Play/Stop**: Toggle playback

**Option Controls:**
- **Height Slider**: Adjust timeline height
- **Tick Interval**: Change tick mark spacing
- **Toggles**: Enable/disable controls, labels, snap-to-ticks

## How It Works

The test app:
1. Gets current system time on load
2. Sets timeline start to today at midnight
3. Sets timeline end to tomorrow at midnight
4. Updates current time every second when playing
5. Advances time by 1 second × multiplier value
6. Stops when reaching end of day

### Example Timeline

```
Today (e.g., Feb 14, 2026)
00:00 ─────────────── 12:00 ─────────────── 23:59
└─────────────────────────┬───────────────────────┘
                   Now (e.g., 14:30)
                      ↓
                    ▶ RED LINE (draggable)
```

## Files

```
demo-react/
├── index.html      # HTML entry point
├── main.tsx        # React entry point
├── App.tsx         # Test application component
└── README.md       # This file
```

## Component Props Tested

The test app exercises these Timeline props:

- ✅ `startTime` - Today at midnight
- ✅ `endTime` - Tomorrow at midnight
- ✅ `currentTime` - Updates every second
- ✅ `onTimeChange` - Called on drag/seek/button click
- ✅ `onPlayPause` - Called when play/pause toggled
- ✅ `onMultiplierChange` - Called when speed changed
- ✅ `height` - Adjustable via slider
- ✅ `tickInterval` - Selectable via dropdown
- ✅ `showControls` - Toggle-able
- ✅ `showLabels` - Toggle-able
- ✅ `snapToTicks` - Toggle-able
- ✅ `multiplierOptions` - Pre-configured [0.5, 1, 2, 5, 10]
- ✅ `theme` - Custom dark theme

## Testing Scenarios

### Scenario 1: Basic Timeline
1. Run `npm run dev:demo`
2. Observe timeline shows current day
3. Drag the red line left/right
4. Red line should follow your mouse
5. Time display should update

### Scenario 2: Playback
1. Click the play button (▶)
2. Watch red line advance automatically
3. Observe time incrementing
4. Click pause (⏸) to stop
5. Progress should be visible in info panel

### Scenario 3: Speed Control
1. Start playback (click play)
2. Change multiplier to 5x
3. Red line should move 5x faster
4. Change to 0.5x
5. Red line should move slower

### Scenario 4: Seeking
1. Click on timeline at specific position
2. Red line should jump to that position
3. Current time should update
4. Info panel should show new time

### Scenario 5: Customization
1. Adjust height slider
2. Timeline should resize smoothly
3. Change tick interval
4. Major ticks should update spacing
5. Toggle controls/labels
6. UI should show/hide accordingly

## Performance

The test app is optimized for:
- **Smooth 60fps rendering** - SVG-based, hardware accelerated
- **Responsive updates** - Every second during playback
- **Low memory usage** - No Cesium dependencies required
- **Fast startup** - Minimal dependencies

## Troubleshooting

### Timeline not appearing
- Check browser console for errors
- Verify Vite dev server started
- Try refreshing the page

### Time not updating
- Click the play button to start playback
- Check console for JavaScript errors
- Verify `npm install` completed successfully

### Red line won't move
- Try dragging from the circle indicator
- Check that `enableDrag={true}` (it is by default)
- Try clicking on the timeline to seek

### Performance issues
- Reduce height for faster rendering
- Increase tick interval to fewer ticks
- Toggle off labels if experiencing slowness

## Development

To modify the test app:

1. Edit `demo-react/App.tsx` to change appearance/behavior
2. Edit `demo-react/index.html` to change HTML structure
3. Run `npm run dev:demo` to see changes
4. Build timeline library separately: `npm run build`

## Next Steps

After testing with this app, integrate the Timeline component into your main application:

```tsx
import { Timeline } from '@kteneyck/cesium-timeline';

<Timeline
  startTime={myStartTime}
  endTime={myEndTime}
  currentTime={myCurrentTime}
  onTimeChange={handleTimeChange}
  // ... other props
/>
```

See the main README.md for integration examples.
