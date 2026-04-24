# Angular Usage Example

This file shows how to use `@bariumstudios/cesium-timeline-angular` in an Angular application.

## Setup

```bash
npm install @bariumstudios/cesium-timeline-angular @bariumstudios/cesium-timeline-core cesium
```

## Standalone Component Example

```typescript
// app.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { TimelineComponent } from '@bariumstudios/cesium-timeline-angular';
import type { SwimLane, SwimLaneEventInfo, TimelineTheme } from '@bariumstudios/cesium-timeline-core';
import { defaultTheme } from '@bariumstudios/cesium-timeline-core';
import * as Cesium from 'cesium';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TimelineComponent],
  template: `
    <div style="display:flex;flex-direction:column;height:100vh">
      <!-- Cesium globe -->
      <div #cesiumContainer style="flex:1"></div>

      <!-- Timeline -->
      <div style="height:200px">
        <ct-timeline
          [clock]="clock"
          [height]="200"
          [theme]="theme"
          [swimLanes]="swimLanes"
          [showSwimLanes]="true"
          (timeChange)="onTimeChange($event)"
          (playPause)="onPlayPause($event)"
          (multiplierChange)="onMultiplierChange($event)"
          (swimLaneItemClick)="onSwimLaneClick($event)"
        />
      </div>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('cesiumContainer', { static: true }) container!: ElementRef;

  clock?: Cesium.Clock;
  theme: Partial<TimelineTheme> = { ...defaultTheme, backgroundColor: '#1e1e1e' };
  swimLanes: SwimLane[] = [];

  private viewer?: Cesium.Viewer;

  ngOnInit(): void {
    // Initialize Cesium viewer
    this.viewer = new Cesium.Viewer(this.container.nativeElement, {
      animation: false,
      timeline: false,
    });

    this.clock = this.viewer.clock;

    // Build swim lane data
    const now = new Date();
    const h = (hours: number) => {
      const d = new Date(now);
      d.setHours(d.getHours() + hours);
      return Cesium.JulianDate.fromDate(d);
    };

    this.swimLanes = [
      {
        id: 'events',
        label: 'Events',
        items: [
          {
            id: 'evt-1',
            interval: new Cesium.TimeInterval({ start: h(-2), stop: h(-1) }),
            style: { color: '#4da6ff' },
          },
          {
            id: 'evt-2',
            instant: h(0),
            style: { color: '#4caf50', markerShape: 'circle' as const },
          },
        ],
      },
      {
        id: 'tasks',
        label: 'Tasks',
        items: [
          {
            id: 'task-1',
            interval: new Cesium.TimeInterval({ start: h(1), stop: h(3) }),
            style: { color: '#ff9800' },
          },
        ],
      },
    ];
  }

  ngOnDestroy(): void {
    this.viewer?.destroy();
  }

  onTimeChange(t: Cesium.JulianDate): void {
    if (this.viewer) {
      this.viewer.clock.currentTime = t;
    }
  }

  onPlayPause(playing: boolean): void {
    if (this.viewer) {
      this.viewer.clock.shouldAnimate = playing;
    }
  }

  onMultiplierChange(m: number): void {
    if (this.viewer) {
      this.viewer.clock.multiplier = m;
    }
  }

  onSwimLaneClick(info: SwimLaneEventInfo): void {
    console.log('Swim lane item clicked:', info.laneId, info.item.id);
  }
}
```

## Angular Component Selectors

| Selector | Component | Description |
|---|---|---|
| `ct-timeline` | `TimelineComponent` | Full timeline (controls + canvas) |
| `ct-timeline-canvas` | `TimelineCanvasComponent` | Canvas-only (no controls) |
| `ct-timeline-controls` | `TimelineControlsComponent` | Transport controls only |

## Inputs & Outputs

### `ct-timeline`

**Inputs:**
- `startTime`, `endTime`, `currentTime` — `Cesium.JulianDate | Date`
- `clock` — `Cesium.Clock` (syncs playback automatically)
- `height` — `number` (pixels)
- `theme` — `Partial<TimelineTheme>`
- `swimLanes` — `SwimLane[]`
- `showSwimLanes`, `showControls`, `enableDrag` — `boolean`
- `dateTimeFormat` — `string`
- `jumpToTime` — `Cesium.JulianDate | Date`
- `ffSpeeds`, `rwSpeeds` — `number[]`
- `cssClass` — `string`

**Outputs:**
- `(timeChange)` — `EventEmitter<Cesium.JulianDate>`
- `(playPause)` — `EventEmitter<boolean>`
- `(multiplierChange)` — `EventEmitter<number>`
- `(dateTimeClick)` — `EventEmitter<void>`
- `(showSwimLanesChange)` — `EventEmitter<boolean>`
- `(swimLaneItemClick)` — `EventEmitter<SwimLaneEventInfo>`
- `(swimLaneItemHover)` — `EventEmitter<SwimLaneEventInfo | null>`
- `(swimLaneItemDoubleClick)` — `EventEmitter<SwimLaneEventInfo>`
- `(swimLaneItemContextMenu)` — `EventEmitter<SwimLaneEventInfo>`
- `(swimLaneReorder)` — `EventEmitter<string[]>`

### `ct-timeline-canvas` (for direct use)

Access the canvas component via `@ViewChild(TimelineCanvasComponent)` to use imperative methods:

```typescript
@ViewChild(TimelineCanvasComponent) canvas!: TimelineCanvasComponent;

// Programmatic zoom
this.canvas.zoomTo(startMs, endMs);

// Get visible range
const { startMs, endMs } = this.canvas.getVisibleRange();

// Swim lane CRUD
this.canvas.appendSwimLane(newLane);
this.canvas.updateSwimLane('lane-id', { label: 'Updated' });
this.canvas.removeSwimLane('lane-id');
this.canvas.reorderSwimLanes(['lane-2', 'lane-1', 'lane-3']);
```
