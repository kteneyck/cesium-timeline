# @kteneyck/cesium-timeline

A canvas-based timeline component for **React** and **Angular** with Cesium Clock integration. Provides interactive time scrubbing, smooth edge-scroll, Netflix/Hulu-style playback controls, a LIVE indicator, and a flexible token-based datetime format system.

## Packages

| Package | Description | npm |
|---|---|---|
| `@kteneyck/cesium-timeline-core` | Framework-agnostic types, utils, canvas engine | [![npm](https://img.shields.io/npm/v/@kteneyck/cesium-timeline-core)](https://www.npmjs.com/package/@kteneyck/cesium-timeline-core) |
| `@kteneyck/cesium-timeline-react` | React components (thin wrappers around core) | [![npm](https://img.shields.io/npm/v/@kteneyck/cesium-timeline-react)](https://www.npmjs.com/package/@kteneyck/cesium-timeline-react) |
| `@kteneyck/cesium-timeline-angular` | Angular standalone components (Angular 17+) | [![npm](https://img.shields.io/npm/v/@kteneyck/cesium-timeline-angular)](https://www.npmjs.com/package/@kteneyck/cesium-timeline-angular) |

---

## Installation

### React

```bash
npm install @kteneyck/cesium-timeline-react @kteneyck/cesium-timeline-core
```

Peer dependencies: `react` ≥ 19, `cesium` ≥ 1.100

### Angular

```bash
npm install @kteneyck/cesium-timeline-angular @kteneyck/cesium-timeline-core
```

Peer dependencies: `@angular/core` ≥ 17, `cesium` ≥ 1.100

---

## Basic Usage

### React

```tsx
import { Timeline } from '@kteneyck/cesium-timeline-react';

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

### Angular

```typescript
import { Component } from '@angular/core';
import { TimelineComponent } from '@kteneyck/cesium-timeline-angular';
import * as Cesium from 'cesium';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TimelineComponent],
  template: `
    <ct-timeline
      [clock]="viewer.clock"
      [height]="120"
      (timeChange)="onTimeChange($event)"
      (playPause)="onPlayPause($event)"
      (multiplierChange)="onMultiplierChange($event)"
    />
  `,
})
export class AppComponent {
  viewer!: Cesium.Viewer;

  onTimeChange(t: Cesium.JulianDate) {
    this.viewer.clock.currentTime = t;
  }

  onPlayPause(playing: boolean) {
    this.viewer.clock.shouldAnimate = playing;
  }

  onMultiplierChange(m: number) {
    this.viewer.clock.multiplier = m;
  }
}
```

Angular components use standalone imports — no NgModule required. Selectors: `ct-timeline`, `ct-timeline-canvas`, `ct-timeline-controls`.

---

## Features

- **Canvas rendering** — zero framework re-renders during playback or drag; all mutable state lives in refs/class properties.
- **Shared core engine** — identical visual output in React and Angular via `@kteneyck/cesium-timeline-core`.
- **Cesium Clock sync** — subscribes to `clock.onTick`; respects `shouldAnimate`, `multiplier`, and `currentTime`.
- **Draggable needle** — grab and drag the current-time indicator to scrub; cursor changes to `grab`/`grabbing`.
- **Click-to-seek** — click anywhere on the timeline to jump to that time.
- **Edge scroll** — drag the needle within 8% of either edge and the visible window scrolls smoothly underneath. The needle stays pinned to the cursor position as the window shifts.
- **Auto-scroll during playback** — visible window pans automatically when the needle reaches 10% from either edge.
- **Infinite scrolling window** — timeline is not clamped to `startTime`/`endTime`; the window can pan anywhere.
- **Adaptive tick labels** — label granularity adapts to zoom level: milliseconds → seconds → HH:MM:SS → HH:MM → Month Day → Month Year → Year. Tick dates are shown only when the visible window spans more than 24 hours.
- **Configurable timezone** — tick labels and the datetime display can show any IANA timezone (e.g. `"UTC"`, `"America/New_York"`) or the browser's local time. A short abbreviation (e.g. `UTC`, `EST`, `PDT`) is displayed to the right of the date line whenever a non-local timezone is active.
- **Netflix/Hulu-style controls** — transport buttons (⏮ ◀◀ ▶/⏸ ▶▶ ⏭) always stay centered; speed badge and LIVE button in the left column never cause layout shift.
- **Conditional start/end buttons** — ⏮ and ⏭ are only rendered when `startTime` and `endTime` props are explicitly provided.
- **Speed cycling** — FF cycles through `ffSpeeds` (default `2×→4×→8×→16×→32×→1×`); RW cycles through `rwSpeeds` (default `−1×→−2×→−4×→−8×→−16×→−32×`). Both arrays are fully configurable.
- **LIVE button** — filled `● LIVE` when within 10 s of wall clock; dim outline `LIVE` otherwise; clicking jumps to `Date.now()` and resets speed to 1×.
- **Speed badge** — shown in the left column when multiplier ≠ 1×; click to reset to 1×.
- **Two-line datetime display** — time displayed large/bold; date displayed smaller in the theme's active color.
- **Clickable datetime** — pass `onDateTimeClick` to open your own date picker; pass the result back via `jumpToTime` to pan the canvas and set the time.
- **Token-based datetime format** — built-in presets plus custom format strings with 17 supported tokens.
- **Max tick limit** — `maxTicks` prop prevents the canvas from becoming overloaded at wide zoom levels by coarsening the tick scale automatically.
- **Swim lanes** — display time intervals and instants as horizontal rows inside the canvas. Supports customizable styling, click/hover/double-click event hooks, drag-to-reorder, and vertical scrolling when lanes overflow.
- **Fully themeable** — 16 theme properties cover every color, size, and font setting, including swim lane item border defaults.
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
| `timezone` | `string` | browser local | IANA timezone name (e.g. `'UTC'`, `'America/New_York'`) or `'local'` for the browser's timezone. Controls both tick labels and the datetime display. When set, a short abbreviation (e.g. `UTC`, `EST`) appears to the right of the date. |
| `onDateTimeClick` | `() => void` | — | Called when the user clicks the datetime display. Use to open your own date picker. |
| `jumpToTime` | `JulianDate \| Date` | — | Set to programmatically jump the timeline to a moment (pans canvas + sets time). |
| `theme` | `Partial<TimelineTheme>` | `defaultTheme` | Theme overrides (merged with defaults) |
| `className` | `string` | — | CSS class applied to the root div |
| `onTimeChange` | `(t: JulianDate) => void` | — | Fires when needle moves (drag, click, or clock tick) |
| `onPlayPause` | `(playing: boolean) => void` | — | Fires on play/pause toggle |
| `onMultiplierChange` | `(m: number) => void` | — | Fires when speed changes |
| `swimLanes` | `SwimLane[]` | — | Array of swim lane definitions to render on the canvas |
| `showSwimLanes` | `boolean` | `true` | Show or hide the swim lanes |
| `onSwimLaneItemClick` | `(info: SwimLaneEventInfo) => void` | — | Fires when a swim lane item is clicked |
| `onSwimLaneItemHover` | `(info: SwimLaneEventInfo \| null) => void` | — | Fires when mouse enters/leaves a swim lane item |
| `onSwimLaneItemDoubleClick` | `(info: SwimLaneEventInfo) => void` | — | Fires when a swim lane item is double-clicked |
| `onSwimLaneReorder` | `(orderedIds: string[]) => void` | — | Fires when swim lanes are reordered via drag. Receives the new lane id order. |

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

| Property | Default   | Description |
|----------|-----------|-------------|
| `backgroundColor` | `#1a1a1a` | Canvas background colour |
| `tickColor` | `#666`    | Minor tick stroke colour |
| `majorTickColor` | `#999`    | Major tick stroke colour |
| `labelColor` | `#ccc`    | Tick label and datetime text colour |
| `indicatorColor` | `#d69826` | Needle (current-time line) colour |
| `indicatorLineWidth` | `5`       | Needle stroke width in px |
| `majorTickHeight` | `10`      | Major tick height in px |
| `minorTickHeight` | `5`       | Minor tick height in px |
| `fontSize` | `12`      | Tick label font size in px |
| `controlBarBackground` | `#242424` | Control bar background colour |
| `controlBarBorder` | `#333`    | Control bar bottom border colour |
| `buttonColor` | `#666`    | Normal button colour |
| `buttonHoverColor` | `#888`    | Button hover colour |
| `buttonActiveColor` | `#d69826` | Active buttons, LIVE, speed badge, and date line colour |
| `swimLaneItemBorderColor` | `#666666` | Default border colour for swim lane interval bars. Can be overridden per-lane or per-item. |
| `swimLaneItemBorderWidth` | `0`       | Default border width (px) for swim lane interval bars. Set to `0` to remove borders globally. Can be overridden per-lane or per-item. |

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

## Timezone

By default the timeline displays all times in the **browser's local timezone**. Pass the `timezone` prop to use UTC or any [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) instead.

```tsx
// UTC
<Timeline clock={viewer.clock} timezone="UTC" ... />

// A named IANA zone
<Timeline clock={viewer.clock} timezone="America/New_York" ... />

// Back to local (or simply omit the prop)
<Timeline clock={viewer.clock} timezone="local" ... />
```

Both the **canvas tick labels** and the **control bar datetime display** update to reflect the chosen timezone. When a non-local timezone is active a short abbreviation (e.g. `UTC`, `EST`, `PDT`) is shown to the right of the date line. The abbreviation is DST-aware — it automatically switches between `EST` and `EDT`, `PST` and `PDT`, etc.

### `Timezones` constants

```tsx
import { Timezones } from '@kteneyck/cesium-timeline-react';

<Timeline timezone={Timezones.UTC} ... />   // "UTC"
<Timeline timezone={Timezones.LOCAL} ... /> // "local" (default behavior)
```

### `getTimezoneAbbr` utility

Returns the short abbreviation for a given date and timezone, or `null` for local.

```tsx
import { getTimezoneAbbr } from '@kteneyck/cesium-timeline-react';

getTimezoneAbbr(new Date(), 'UTC');               // → "UTC"
getTimezoneAbbr(new Date(), 'America/Chicago');   // → "CDT" or "CST"
getTimezoneAbbr(new Date());                      // → null  (local)
```

### `formatDateTime` with timezone

The `formatDateTime` utility accepts an optional third argument:

```tsx
import { formatDateTime, DateTimeFormats } from '@kteneyck/cesium-timeline-react';

formatDateTime(new Date(), DateTimeFormats.ISO, 'UTC');
// → "2026-02-24 14:04:07"  (always in UTC regardless of local browser timezone)

formatDateTime(new Date(), DateTimeFormats.DEFAULT, 'America/Los_Angeles');
// → "Feb 24 2026 06:04:07"
```

---

## DateTime Format

The `dateTimeFormat` prop controls the two-line datetime display in the control bar. It accepts a token-based format string.

### Built-in Presets (`DateTimeFormats`)

```tsx
import { DateTimeFormats } from '@kteneyck/cesium-timeline-react';

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
import { formatDateTime, DateTimeFormats } from '@kteneyck/cesium-timeline-react';

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

### React

```tsx
import {
  Timeline,          // Main component
  TimelineCanvas,    // Canvas component (imperative handle)
  TimelineControls,  // Transport controls
  TimelineSVG,       // SVG-based alternative renderer
} from '@kteneyck/cesium-timeline-react';
```

### Angular

```typescript
import {
  TimelineComponent,         // <ct-timeline>
  TimelineCanvasComponent,   // <ct-timeline-canvas>
  TimelineControlsComponent, // <ct-timeline-controls>
} from '@kteneyck/cesium-timeline-angular';
```

### Core (re-exported by both React and Angular packages)

```tsx
import {
  DateTimeFormats,   // Format string presets
  Timezones,         // { LOCAL: 'local', UTC: 'UTC' } convenience constants
  formatDateTime,    // Token-based date formatter (date, format, timezone?)
  getTimezoneAbbr,   // Short timezone abbreviation for a date (date, timezone?)
  splitForDisplay,   // Split format string into time/date parts
  toJulianDate,      // Convert Date | JulianDate → JulianDate
  toDate,            // Convert Date | JulianDate → Date
  toMilliseconds,    // Convert ms → number
  fromMilliseconds,  // Convert ms → JulianDate
  getDurationMs,     // Duration between two dates in ms
  TickInterval,      // Enum: FIFTEEN_MIN | THIRTY_MIN | HOURLY | CUSTOM
  defaultTheme,      // Default theme values
  defaultSwimLaneStyle,
  DEFAULT_LANE_HEIGHT,
} from '@kteneyck/cesium-timeline-core';

// TypeScript types
import type {
  TimelineTheme,
  SwimLane,
  SwimLaneItem,
  SwimLaneItemStyle,
  SwimLaneStyle,
  SwimLaneEventInfo,
} from '@kteneyck/cesium-timeline-core';
```

---

## Examples

### Full Cesium Integration

```tsx
import { useRef, useEffect, useMemo, useState } from 'react';
import * as Cesium from 'cesium';
import { Timeline, DateTimeFormats } from '@kteneyck/cesium-timeline-react';

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
import { Timeline } from '@kteneyck/cesium-timeline-react';

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

## Swim Lanes

Swim lanes render time intervals (bars) and instants (markers) as horizontal rows directly on the timeline canvas, aligned with the ticks and needle. They are ideal for visualizing satellite passes, ground contacts, scheduled events, or any temporal data.

Lanes are rendered in the upper portion of the canvas. The tick area remains fixed at the bottom. As you increase the timeline `height`, more lanes become visible. When lanes overflow the available space, a vertical scrollbar appears and you can scroll with the mouse wheel.

### Basic Swim Lane Example

```tsx
import * as Cesium from 'cesium';
import { Timeline } from '@kteneyck/cesium-timeline-react';
import type { SwimLane } from '@kteneyck/cesium-timeline-react';

const now = Cesium.JulianDate.now();
const later = Cesium.JulianDate.addHours(now, 3, new Cesium.JulianDate());

const swimLanes: SwimLane[] = [
  {
    id: 'passes',
    label: 'Passes',
    items: [
      {
        id: 'pass-1',
        interval: new Cesium.TimeInterval({ start: now, stop: later }),
      },
    ],
  },
];

<Timeline
  clock={viewer.clock}
  height={150}
  swimLanes={swimLanes}
  onTimeChange={(t) => { viewer.clock.currentTime = t; }}
/>
```

### Intervals and Instants

Each `SwimLaneItem` can have an `interval` (rendered as a horizontal bar), an `instant` (rendered as a marker), or both.

```tsx
const lanes: SwimLane[] = [
  {
    id: 'events',
    label: 'Events',
    items: [
      // Interval — rendered as a bar spanning start to stop
      {
        id: 'meeting',
        interval: new Cesium.TimeInterval({
          start: Cesium.JulianDate.fromIso8601('2026-03-05T09:00:00Z'),
          stop:  Cesium.JulianDate.fromIso8601('2026-03-05T10:30:00Z'),
        }),
      },
      // Instant — rendered as a marker at a single point in time
      {
        id: 'alert',
        instant: Cesium.JulianDate.fromIso8601('2026-03-05T12:00:00Z'),
      },
    ],
  },
];
```

### Customizing Styles

Styles cascade: `defaultSwimLaneStyle` → `theme` → `lane.style` → `item.style`. Each level is a partial override.

> **Border shortcut:** The `swimLaneItemBorderColor` and `swimLaneItemBorderWidth` theme properties let you control item borders globally without touching individual lane or item styles. Set `swimLaneItemBorderWidth: 0` in your theme to remove all borders at once.

```tsx
const lanes: SwimLane[] = [
  {
    id: 'maintenance',
    label: 'Maint.',
    // Lane-level style: all items in this lane default to grey
    style: {
      color: '#78909c',
      backgroundColor: 'rgba(120,144,156,0.1)',
    },
    items: [
      {
        id: 'window-1',
        interval: new Cesium.TimeInterval({ start: h(-2), stop: h(0) }),
        // Item-level override: this specific item is red
        style: { color: '#f44336', opacity: 1.0 },
      },
      {
        id: 'window-2',
        interval: new Cesium.TimeInterval({ start: h(4), stop: h(6) }),
        // Inherits lane style (grey)
      },
    ],
  },
];
```

#### `SwimLaneItemStyle` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | `string` | `#4da6ff` | Fill colour for interval bars and instant markers |
| `borderColor` | `string` | `#2980b9` | Border colour for interval bars |
| `borderWidth` | `number` | `1` | Border width in px for interval bars |
| `opacity` | `number` | `0.8` | Opacity (0–1) |
| `markerShape` | `'diamond' \| 'circle' \| 'line'` | `'diamond'` | Shape used to render instant markers |
| `markerSize` | `number` | `10` | Size in px for instant markers |

#### `SwimLaneStyle` Properties (extends `SwimLaneItemStyle`)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `labelColor` | `string` | `#cccccc` | Colour of the lane label text |
| `backgroundColor` | `string` | `transparent` | Background colour of the lane row |

### Instant Marker Shapes

Three marker shapes are available for instants:

```tsx
// Diamond (default)
{ id: 'a', instant: someDate, style: { markerShape: 'diamond' } }

// Circle
{ id: 'b', instant: someDate, style: { markerShape: 'circle' } }

// Vertical line
{ id: 'c', instant: someDate, style: { markerShape: 'line' } }
```

### Event Hooks

Swim lane items support click, hover, and double-click events. Each callback receives a `SwimLaneEventInfo` object.

```tsx
import type { SwimLaneEventInfo } from '@kteneyck/cesium-timeline-react';

const handleClick = (info: SwimLaneEventInfo) => {
  console.log(`Clicked item ${info.item.id} in lane ${info.laneId}`);
  console.log('Custom data:', info.item.data);
};

const handleHover = (info: SwimLaneEventInfo | null) => {
  if (info) {
    showTooltip(`${info.item.id} in ${info.laneId}`);
  } else {
    hideTooltip();
  }
};

const handleDoubleClick = (info: SwimLaneEventInfo) => {
  openDetailPanel(info.item.data);
};

<Timeline
  clock={viewer.clock}
  height={150}
  swimLanes={lanes}
  onSwimLaneItemClick={handleClick}
  onSwimLaneItemHover={handleHover}
  onSwimLaneItemDoubleClick={handleDoubleClick}
/>
```

#### `SwimLaneEventInfo`

| Property | Type | Description |
|----------|------|-------------|
| `laneId` | `string` | The `id` of the lane containing the item |
| `item` | `SwimLaneItem` | The item that was interacted with |
| `originalEvent` | `MouseEvent` | The native DOM mouse event |

### Attaching Custom Data

Use the `data` field on `SwimLaneItem` to attach arbitrary metadata. It's passed through in event callbacks.

```tsx
const lanes: SwimLane[] = [
  {
    id: 'contacts',
    label: 'Contacts',
    items: [
      {
        id: 'c-1',
        interval: new Cesium.TimeInterval({ start: t1, stop: t2 }),
        data: { satellite: 'ISS', groundStation: 'Goldstone', snr: 42.5 },
      },
    ],
  },
];

const handleClick = (info: SwimLaneEventInfo) => {
  const { satellite, groundStation, snr } = info.item.data as ContactData;
  console.log(`${satellite} → ${groundStation} (SNR: ${snr})`);
};
```

### Drag-to-Reorder

Pass `onSwimLaneReorder` to enable drag-to-reorder. Grab a lane by its label (left side) and drag up or down. An insertion indicator shows where the lane will be placed.

```tsx
const [lanes, setLanes] = useState<SwimLane[]>(initialLanes);

const handleReorder = (orderedIds: string[]) => {
  // orderedIds is the new order of lane IDs
  setLanes(prev => orderedIds.map(id => prev.find(l => l.id === id)!));
};

<Timeline
  clock={viewer.clock}
  height={150}
  swimLanes={lanes}
  onSwimLaneReorder={handleReorder}
/>
```

### Show / Hide Swim Lanes

Toggle visibility without removing the data:

```tsx
const [showSwimLanes, setShowSwimLanes] = useState(true);

<Timeline
  clock={viewer.clock}
  height={150}
  swimLanes={lanes}
  showSwimLanes={showSwimLanes}
/>

<button onClick={() => setShowSwimLanes(v => !v)}>
  {showSwimLanes ? 'Hide' : 'Show'} Swim Lanes
</button>
```

When hidden, the full canvas height is used for the tick/label area as normal.

### Lane Height and Scrolling

Each lane defaults to 24px tall. Override per-lane with the `height` property:

```tsx
const lanes: SwimLane[] = [
  { id: 'big', label: 'Important', height: 40, items: [...] },
  { id: 'small', label: 'Minor', height: 16, items: [...] },
];
```

When the total lane height exceeds the available space (canvas height minus the 36px tick area), a scrollbar appears and the mouse wheel scrolls vertically in the swim lane region. Outside the lane region, the mouse wheel zooms the timeline as usual.

### Imperative API

The `TimelineCanvasHandle` (accessible via a ref on `Timeline`) exposes methods for programmatic swim lane management:

```tsx
const timelineRef = useRef<TimelineCanvasHandle>(null);

// Append a new lane
timelineRef.current?.appendSwimLane(newLane);

// Update an existing lane
timelineRef.current?.updateSwimLane('lane-id', updatedLane);

// Remove a lane
timelineRef.current?.removeSwimLane('lane-id');

// Reorder lanes
timelineRef.current?.reorderSwimLanes(['lane-b', 'lane-a', 'lane-c']);
```

---

## Building

```bash
cd cesium-timeline
npm install

# Build all packages (core → react → angular)
npm run build

# Build individually
npm run build:core
npm run build:react
npm run build:angular

# Development
npm run dev:demo     # React demo with hot reload
npm run typecheck    # TypeScript check (core + react)
npm run clean        # Remove all build artifacts
```

### Project Structure

```
cesium-timeline/
├── packages/
│   ├── core/       → @kteneyck/cesium-timeline-core     (types, utils, canvas engine)
│   ├── react/      → @kteneyck/cesium-timeline-react    (React components)
│   └── angular/    → @kteneyck/cesium-timeline-angular  (Angular standalone components)
├── demo-react/     → React demo app (npm run dev:demo)
├── src/            → Original source (preserved, not used by packages)
└── package.json    → npm workspace root
```

---

## License

MIT

