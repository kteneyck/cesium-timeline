# @bariumstudios/cesium-timeline

A canvas-based React timeline component with Cesium Clock integration. Provides interactive time scrubbing, smooth edge-scroll, Netflix/Hulu-style playback controls, a LIVE indicator, and a flexible token-based datetime format system.

---

## Installation

```bash
npm install @bariumstudios/cesium-timeline
```

Or link locally from a monorepo:

```json
"@bariumstudios/cesium-timeline": "file:../cesium-timeline"
```

### Peer Dependencies

- `react` ≥ 18
- `react-dom` ≥ 18
- `cesium` ≥ 1.100

---

## Basic Usage

```tsx
import { Timeline } from '@bariumstudios/cesium-timeline';

const MyComponent = () => {
  const viewer = /* your Cesium Viewer */;

  return (
    <Timeline
      clock={viewer.clock}
      height={120}
      onTimeChange={(t) => { viewer.clock.currentTime = t; }}
      onPlayPause={(playing) => { viewer.clock.shouldAnimate = playing; }}
      onMultiplierChange={(m) => { viewer.clock.multiplier = m; }}
    />
  );
};
```

When `clock` is provided the component subscribes to `clock.onTick` and stays in sync automatically. All `onTimeChange`, `onPlayPause`, and `onMultiplierChange` callbacks are optional — the controls still work without them if you only pass `clock`.

### Without a Cesium Clock

```tsx
<Timeline
  startTime={new Date('2026-01-01T00:00:00')}
  endTime={new Date('2026-12-31T23:59:59')}
  height={80}
  showControls={false}
  onTimeChange={(t) => console.log(Cesium.JulianDate.toIso8601(t))}
/>
```

When no `clock` is provided the component falls back to `setInterval` and tracks real wall-clock time.

---

## Features

- **Canvas rendering** — zero React re-renders during playback or drag; all mutable state lives in refs.
- **Cesium Clock sync** — subscribes to `clock.onTick`; respects `shouldAnimate`, `multiplier`, and `currentTime`.
- **Draggable needle** — grab and drag the current-time indicator to scrub; cursor changes to `grab`/`grabbing`.
- **Click-to-seek** — click anywhere on the timeline to jump to that time.
- **Edge scroll** — drag the needle within 8% of either edge and the visible window scrolls smoothly underneath. The needle stays pinned to the cursor position as the window shifts.
- **Auto-scroll during playback** — visible window pans automatically when the needle reaches 10% from either edge.
- **Infinite scrolling window** — timeline is not clamped to `startTime`/`endTime`; the window can pan anywhere.
- **Adaptive tick labels** — label granularity adapts to zoom level: milliseconds → seconds → HH:MM:SS → HH:MM → Month Day → Month Year → Year. Tick dates are shown only when the visible window spans more than 24 hours.
- **Local time labels** — ticks and dates reflect the user's local timezone, not UTC.
- **Netflix/Hulu-style controls** — transport buttons (⏮ ◀◀ ▶/⏸ ▶▶ ⏭) always stay centered; speed badge and LIVE button in the left column never cause layout shift.
- **Conditional start/end buttons** — ⏮ and ⏭ are only rendered when `startTime` and `endTime` props are explicitly provided.
- **Speed cycling** — FF cycles through `ffSpeeds` (default `2×→4×→8×→16×→32×→1×`); RW cycles through `rwSpeeds` (default `−1×→−2×→−4×→−8×→−16×→−32×`). Both arrays are fully configurable.
- **LIVE button** — filled `● LIVE` when within 10 s of wall clock; dim outline `LIVE` otherwise; clicking jumps to `Date.now()` and resets speed to 1×.
- **Speed badge** — shown in the left column when multiplier ≠ 1×; click to reset to 1×.
- **Two-line datetime display** — time displayed large/bold; date displayed smaller in the theme's active color.
- **Clickable datetime** — pass `onDateTimeClick` to open your own date picker; pass the result back via `jumpToTime` to pan the canvas and set the time.
- **Token-based datetime format** — built-in presets plus custom format strings with 17 supported tokens.
- **Max tick limit** — `maxTicks` prop prevents the canvas from becoming overloaded at wide zoom levels by coarsening the tick scale automatically.
- **Fully themeable** — 14 theme properties cover every color, size, and font setting.
- **Responsive** — fills container width; `ResizeObserver` redraws on resize.

---

## Props

### `TimelineProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `clock` | `Cesium.Clock` | — | Cesium clock to sync with. Falls back to `setInterval` if omitted. |
| `startTime` | `JulianDate \| Date` | now − 12 h | Left bound of initial visible window. Also shows the ⏮ button when provided. |
| `endTime` | `JulianDate \| Date` | now + 12 h | Right bound of initial visible window. Also shows the ⏭ button when provided. |
| `currentTime` | `JulianDate \| Date` | `startTime` | Initial needle position |
| `height` | `number` | `120` | Canvas height in pixels |
| `showControls` | `boolean` | `true` | Show/hide the control bar |
| `enableDrag` | `boolean` | `true` | Show/hide the canvas (drag/seek area) |
| `showLabels` | `boolean` | — | Show/hide tick labels on the canvas |
| `snapToTicks` | `boolean` | — | Snap needle to nearest tick on drag |
| `tickInterval` | `TickInterval \| number` | auto | Override automatic tick interval |
| `maxTicks` | `number` | unlimited | Maximum number of major ticks on the canvas at once. When exceeded the tick scale is automatically coarsened. |
| `ffSpeeds` | `number[]` | `[2,4,8,16,32,1]` | Speed steps cycled by the ▶▶ button. Last entry wraps back to first. |
| `rwSpeeds` | `number[]` | `[1,2,4,8,16,32]` | Absolute-value speed steps cycled by the ◀◀ button (negated internally). |
| `dateTimeFormat` | `string` | `'MMM DD YYYY HH:mm:ss'` | Token-based format string for the controls datetime display |
| `onDateTimeClick` | `() => void` | — | Called when the user clicks the datetime display. Use to open your own date picker. |
| `jumpToTime` | `JulianDate \| Date` | — | Set to programmatically jump the timeline to a moment (pans canvas + sets time). |
| `theme` | `Partial<TimelineTheme>` | `defaultTheme` | Theme overrides (merged with defaults) |
| `className` | `string` | — | CSS class applied to the root div |
| `onTimeChange` | `(t: JulianDate) => void` | — | Fires when needle moves (drag, click, or clock tick) |
| `onPlayPause` | `(playing: boolean) => void` | — | Fires on play/pause toggle |
| `onMultiplierChange` | `(m: number) => void` | — | Fires when speed changes |

---

## Theme

Pass a partial `TimelineTheme` object to the `theme` prop. Any omitted properties fall back to `defaultTheme`.

```tsx
<Timeline
  clock={viewer.clock}
  theme={{
    backgroundColor: '#111',
    indicatorColor: '#ffd54f',
    buttonActiveColor: '#ffd54f',
  }}
/>
```

### `TimelineTheme` Properties

| Property | Default | Description |
|----------|---------|-------------|
| `backgroundColor` | `#1a1a1a` | Canvas background colour |
| `tickColor` | `#666` | Minor tick stroke colour |
| `majorTickColor` | `#999` | Major tick stroke colour |
| `labelColor` | `#ccc` | Tick label and datetime text colour |
| `indicatorColor` | `#d69826` | Needle (current-time line) colour |
| `indicatorLineWidth` | `3` | Needle stroke width in px |
| `majorTickHeight` | `10` | Major tick height in px |
| `minorTickHeight` | `5` | Minor tick height in px |
| `fontSize` | `12` | Tick label font size in px |
| `controlBarBackground` | `#242424` | Control bar background colour |
| `controlBarBorder` | `#333` | Control bar bottom border colour |
| `buttonColor` | `#666` | Normal button colour |
| `buttonHoverColor` | `#888` | Button hover colour |
| `buttonActiveColor` | `#d69826` | Active buttons, LIVE, speed badge, and date line colour |

> **Note:** Theme colours must be resolved hex/rgb values. CSS variables like `var(--primary-color)` do **not** work in canvas `ctx.fillStyle`. Use `getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()` to resolve them first.

### Resolving CSS Variables

```tsx
const theme = useMemo(() => {
  const style = getComputedStyle(document.documentElement);
  return {
    indicatorColor: style.getPropertyValue('--primary-color').trim() || '#ffd54f',
    backgroundColor: style.getPropertyValue('--surface-ground').trim() || '#1a1a1a',
  };
}, []);

<Timeline clock={viewer.clock} theme={theme} />
```

---

## DateTime Format

The `dateTimeFormat` prop controls the two-line datetime display in the control bar. It accepts a token-based format string.

### Built-in Presets (`DateTimeFormats`)

```tsx
import { DateTimeFormats } from '@bariumstudios/cesium-timeline';

<Timeline dateTimeFormat={DateTimeFormats.TWELVE_HR} ... />
```

| Key | Format string | Example output |
|-----|--------------|----------------|
| `DEFAULT` | `MMM DD YYYY HH:mm:ss` | Feb 24 2026 14:04:07 |
| `TWELVE_HR` | `MMM DD YYYY hh:mm:ss A` | Feb 24 2026 02:04:07 PM |
| `ISO` | `YYYY-MM-DD HH:mm:ss` | 2026-02-24 14:04:07 |
| `US` | `MM/DD/YYYY HH:mm` | 02/24/2026 14:04 |
| `EU` | `DD/MM/YYYY HH:mm` | 24/02/2026 14:04 |
| `TIME_ONLY` | `HH:mm:ss` | 14:04:07 |
| `TIME_12` | `hh:mm:ss A` | 02:04:07 PM |

### Supported Tokens

| Token | Example | Description |
|-------|---------|-------------|
| `YYYY` | 2026 | 4-digit year |
| `YY` | 26 | 2-digit year |
| `MMMM` | February | Full month name |
| `MMM` | Feb | Abbreviated month name |
| `MM` | 02 | Zero-padded month number |
| `M` | 2 | Month number |
| `DD` | 05 | Zero-padded day |
| `D` | 5 | Day |
| `HH` | 14 | 24-hour, zero-padded |
| `H` | 14 | 24-hour |
| `hh` | 02 | 12-hour, zero-padded |
| `h` | 2 | 12-hour |
| `mm` | 04 | Minutes, zero-padded |
| `ss` | 07 | Seconds, zero-padded |
| `SSS` | 042 | Milliseconds, zero-padded |
| `A` | PM | AM/PM uppercase |
| `a` | pm | AM/PM lowercase |

The control bar automatically splits the format string into a **time line** (large/bold) and a **date line** (smaller, in `buttonActiveColor`) using the `splitForDisplay` utility.

### `formatDateTime` Utility

```tsx
import { formatDateTime, DateTimeFormats } from '@bariumstudios/cesium-timeline';

const label = formatDateTime(julianDate, DateTimeFormats.ISO);
// → "2026-02-24 14:04:07"

const label2 = formatDateTime(new Date(), 'DD/MM/YYYY HH:mm');
// → "24/02/2026 14:04"
```

---

## Playback Controls

The control bar uses a 3-column CSS grid so the transport buttons are always centered regardless of the content in the left (datetime/LIVE/badge) or right (empty spacer) columns.

### Transport Buttons

| Button | Action |
|--------|--------|
| ⏮ | Jump to `startTime` — **only rendered when `startTime` prop is provided** |
| ◀◀ | Cycle reverse speeds through `rwSpeeds` (wraps) |
| ▶ / ⏸ | Play / Pause. If coming out of reverse, resets to 1× forward. |
| ▶▶ | Cycle forward speeds through `ffSpeeds` (wraps) |
| ⏭ | Jump to `endTime` — **only rendered when `endTime` prop is provided** |

### LIVE Button

- Shows `● LIVE` (filled background) when the current time is within 10 seconds of `Date.now()`.
- Shows `LIVE` (dim outline) otherwise.
- Clicking jumps to `Date.now()`, centers the visible window ±12 h, and resets speed to 1×.

### Speed Badge

- Appears to the right of LIVE when multiplier ≠ 1×.
- Shows `◀ N×` for reverse, `N× ▶` for fast-forward.
- Clicking resets to 1× speed.

### Configuring Playback Speeds

```tsx
// Gentle: 2× and 4× only
<Timeline ffSpeeds={[2, 4, 1]} rwSpeeds={[1, 2, 4]} ... />

// Scientific: fine-grained control
<Timeline ffSpeeds={[10, 100, 1000, 10000, 1]} rwSpeeds={[1, 10, 100, 1000]} ... />
```

---

## Date Picker Integration

Pass `onDateTimeClick` to make the datetime display clickable. When clicked, open your own picker. Pass the result back as `jumpToTime` to pan the canvas to the selected time.

```tsx
const [jumpToTime, setJumpToTime] = useState<Date | undefined>();
const [pickerOpen, setPickerOpen] = useState(false);

<Timeline
  clock={viewer.clock}
  onDateTimeClick={() => setPickerOpen(true)}
  jumpToTime={jumpToTime}
  ...
/>

{/* Your picker — any library works */}
{pickerOpen && (
  <MyDatePicker
    onSelect={(date) => {
      setJumpToTime(date);
      setPickerOpen(false);
    }}
  />
)}
```

> `jumpToTime` is edge-triggered: the timeline reacts whenever the value changes. Wrap updates in a new `Date` instance (or use state) to ensure React detects the change.

---

## Exports

```tsx
import {
  Timeline,          // Main component
  DateTimeFormats,   // Format string presets
  formatDateTime,    // Token-based date formatter
  splitForDisplay,   // Split format string into time/date parts
  toJulianDate,      // Convert Date | JulianDate → JulianDate
  toDate,            // Convert Date | JulianDate → Date
  toMilliseconds,    // Convert Date | JulianDate → number (ms)
  fromMilliseconds,  // Convert ms → JulianDate
  getDurationMs,     // Duration between two dates in ms
  TickInterval,      // Enum: FIFTEEN_MIN | THIRTY_MIN | HOURLY | CUSTOM
} from '@bariumstudios/cesium-timeline';
```

---

## Examples

### Full Cesium Integration

```tsx
import { useRef, useEffect, useMemo, useState } from 'react';
import * as Cesium from 'cesium';
import { Timeline, DateTimeFormats } from '@bariumstudios/cesium-timeline';

const CesiumWithTimeline = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState<Cesium.Clock | undefined>();

  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new Cesium.Viewer(containerRef.current);
    viewer.clock.shouldAnimate = false;
    setClock(viewer.clock);
    return () => viewer.destroy();
  }, []);

  const theme = useMemo(() => ({
    indicatorColor: '#ffd54f',
    buttonActiveColor: '#ffd54f',
    backgroundColor: '#1a1a1a',
  }), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={containerRef} style={{ flex: 1 }} />
      {clock && (
        <Timeline
          clock={clock}
          height={120}
          showControls={true}
          showLabels={true}
          snapToTicks={false}
          dateTimeFormat={DateTimeFormats.DEFAULT}
          theme={theme}
          onTimeChange={(t) => { clock.currentTime = t; }}
          onPlayPause={(playing) => { clock.shouldAnimate = playing; }}
          onMultiplierChange={(m) => { clock.multiplier = m; }}
        />
      )}
    </div>
  );
};
```

### With Start / End Bounds

Providing `startTime` and `endTime` shows the ⏮ and ⏭ jump buttons.

```tsx
const start = Cesium.JulianDate.fromIso8601('2026-01-01T00:00:00Z');
const end   = Cesium.JulianDate.fromIso8601('2026-12-31T23:59:59Z');

<Timeline
  clock={viewer.clock}
  startTime={start}
  endTime={end}
  height={120}
  onTimeChange={(t) => { viewer.clock.currentTime = t; }}
  onPlayPause={(playing) => { viewer.clock.shouldAnimate = playing; }}
  onMultiplierChange={(m) => { viewer.clock.multiplier = m; }}
/>
```

### Configuring Max Ticks

Useful when the timeline is shown at a small height or in a compact layout.

```tsx
<Timeline
  clock={viewer.clock}
  height={40}
  maxTicks={10}
/>
```

### Configuring Playback Speeds

```tsx
// Slow-motion / real-time / time-lapse only
<Timeline
  clock={viewer.clock}
  ffSpeeds={[0.5, 1, 2, 10, 100]}
  rwSpeeds={[0.5, 1, 2, 10, 100]}
/>
```

### Timeline-Only (No Controls)

```tsx
<Timeline
  clock={viewer.clock}
  height={35}
  showControls={false}
  theme={{ indicatorColor: '#ff6b6b' }}
/>
```

### Custom Date Range

```tsx
const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date();
end.setHours(23, 59, 59, 999);

<Timeline
  startTime={start}
  endTime={end}
  height={80}
  dateTimeFormat="HH:mm:ss"
/>
```

### Without Clock (Standalone)

```tsx
import { useState } from 'react';
import * as Cesium from 'cesium';
import { Timeline } from '@bariumstudios/cesium-timeline';

const StandaloneTimeline = () => {
  const [time, setTime] = useState(new Date());

  return (
    <>
      <p>Selected: {time.toLocaleTimeString()}</p>
      <Timeline
        onTimeChange={(t) => setTime(Cesium.JulianDate.toDate(t))}
        height={80}
        showControls={false}
      />
    </>
  );
};
```

---

## Building

```bash
cd cesium-timeline
npm install
npm run build   # outputs to dist/
```

---

## License

MIT

