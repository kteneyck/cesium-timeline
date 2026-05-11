import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type SwimLane,
  type SwimLaneEventInfo,
  defaultTheme,
  DateTimeFormats,
} from '@kteneyck/cesium-timeline-core';
import { TimelineComponent } from '@kteneyck/cesium-timeline-angular';

// Configure Cesium assets
(window as any).CESIUM_BASE_URL = (import.meta as any).env?.CESIUM_BASE_URL ?? '/cesium/';
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwN2JhODAwMS1iZTE2LTRmZmYtYTk2YS0yOWNmZjI1ZGZiYjEiLCJpZCI6MTcyLCJpYXQiOjE3MTM4MzY4Nzh9.YNelHnfVnWcjF6imsMI8uQAPWJUWnp96ywhDYRt83bo';

function makeSwimLanes(): SwimLane[] {
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
        { id: 'evt-2', instant: h(0),  style: { color: '#4caf50', markerShape: 'circle' as const },  data: { name: 'GO' } },
        { id: 'evt-3', instant: h(2.5),style: { color: '#e040fb', markerShape: 'line' as const },   data: { name: 'Maneuver' } },
      ],
    },
    {
      id: 'maintenance',
      label: 'Maint.',
      items: [
        { id: 'mt-1', interval: new Cesium.TimeInterval({ start: h(-8), stop: h(-6) }), style: { color: '#78909c' } },
        { id: 'mt-2', interval: new Cesium.TimeInterval({ start: h(7), stop: h(10) }),  style: { color: '#78909c' } },
      ],
      style: { backgroundColor: 'rgba(120,144,156,0.08)' },
    },
  ];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, TimelineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: flex; flex-direction: column; width: 100%; height: 100vh; background: #1a1a1a; }

    .content { flex: 1; display: flex; overflow: hidden; min-height: 0; }

    .cesium-container {
      flex: 1; background: #000; position: relative;
      min-height: 0; overflow: hidden;
    }
    ::ng-deep .cesium-container .cesium-viewer,
    ::ng-deep .cesium-container .cesium-viewer-cesiumWidgetContainer,
    ::ng-deep .cesium-container .cesium-widget,
    ::ng-deep .cesium-container .cesium-widget canvas {
      width: 100% !important;
      height: 100% !important;
    }
    .loading-message {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: #999; font-size: 18px;
      background: rgba(0,0,0,0.7); padding: 20px 40px;
      border-radius: 8px; text-align: center; z-index: 10;
    }

    .control-panel {
      width: 280px; background: #1a1a1a; border-left: 1px solid #444;
      padding: 20px; overflow-y: auto; display: flex;
      flex-direction: column; gap: 16px; min-height: 0;
    }
    .control-section { display: flex; flex-direction: column; gap: 8px; }
    .section-title {
      font-size: 12px; font-weight: 600; text-transform: uppercase;
      color: #999; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .divider { height: 1px; background: #444; margin: 8px 0; }

    .prop-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; font-size: 12px;
    }
    .prop-row label { color: #aaa; flex-shrink: 0; }
    .prop-row input:not([type="color"]), .prop-row select { flex: 1; min-width: 0; }

    button {
      padding: 8px 12px; background: #333; border: 1px solid #555;
      color: #e0e0e0; border-radius: 4px; cursor: pointer;
      font-size: 13px; transition: all 0.2s;
    }
    button:hover:not(:disabled) { background: #444; border-color: #666; }
    button:active:not(:disabled) { background: #555; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .toggle-btn {
      padding: 2px 10px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.05em; border-radius: 3px;
      min-width: 40px; height: 24px; cursor: pointer;
    }
    .toggle-btn.on  { background: #4da6ff; color: #111; border-color: #4da6ff; }
    .toggle-btn.off { background: #333;    color: #666; border-color: #555; }

    select, input[type="range"], input[type="number"] {
      padding: 8px; background: #333; border: 1px solid #555;
      color: #e0e0e0; border-radius: 4px; font-size: 13px;
    }
    select:focus, input[type="range"]:focus, input[type="number"]:focus {
      outline: none; border-color: #666; background: #3a3a3a;
    }
    input[type="range"] { padding: 0; width: 100%; cursor: pointer; }
    input[type="color"] {
      padding: 2px; height: 32px; width: 5rem; flex-shrink: 0;
      background: #333; border: 1px solid #555;
      border-radius: 4px; cursor: pointer;
    }

    .info-panel {
      background: #252525; border: 1px solid #444; border-radius: 4px;
      padding: 12px; font-size: 11px;
      font-family: 'Monaco', 'Menlo', monospace; line-height: 1.6;
    }
    .event-entry { color: #888; }
    .event-entry.latest { color: #4da6ff; }
    .no-events { color: #666; }

    .timeline-wrapper {
      width: 100%; background: #2a2a2a;
      border-top: 1px solid #444; flex-shrink: 0;
    }

    /* datetime picker overlay */
    .picker-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 9999;
    }
    .picker-dialog {
      background: #242424; border: 1px solid #444; border-radius: 8px;
      padding: 20px; display: flex; flex-direction: column; gap: 12px;
      min-width: 280px;
    }
    .picker-title {
      font-size: 13px; font-weight: 600; color: #999;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .picker-input {
      background: #333; border: 1px solid #555; color: #e0e0e0;
      border-radius: 4px; padding: 8px; font-size: 13px; width: 100%;
    }
    .picker-actions { display: flex; gap: 8px; }
    .picker-actions button { flex: 1; }
    .range-value { color: #4da6ff; min-width: 36px; text-align: right; font-size: 12px; }
  `],
  template: `
    <div class="content">
      <!-- Cesium Globe -->
      <div class="cesium-container" #cesiumContainer>
        @if (!cesiumClock) {
          <div class="loading-message">Initializing Cesium Viewer…</div>
        }
      </div>

      <!-- Control Panel -->
      <div class="control-panel">

        <!-- Timeline Props -->
        <div class="control-section">
          <div class="section-title">Timeline Props</div>

          <div class="prop-row">
            <label>Height</label>
            <input type="range" min="30" max="200" [value]="timelineHeight"
              (input)="timelineHeight = +$any($event.target).value" />
            <span class="range-value">{{ timelineHeight }}px</span>
          </div>

          <div class="prop-row">
            <label>Show Controls</label>
            <button class="toggle-btn" [class.on]="showControls" [class.off]="!showControls"
              (click)="showControls = !showControls">{{ showControls ? 'ON' : 'OFF' }}</button>
          </div>

          <div class="prop-row">
            <label>Enable Drag</label>
            <button class="toggle-btn" [class.on]="enableDrag" [class.off]="!enableDrag"
              (click)="enableDrag = !enableDrag">{{ enableDrag ? 'ON' : 'OFF' }}</button>
          </div>

          <div class="prop-row">
            <label>Show Swim Lanes</label>
            <button class="toggle-btn" [class.on]="showSwimLanes" [class.off]="!showSwimLanes"
              (click)="showSwimLanes = !showSwimLanes">{{ showSwimLanes ? 'ON' : 'OFF' }}</button>
          </div>

          <div class="prop-row">
            <label>Lane Transition</label>
            <select [(ngModel)]="swimLaneTransition">
              <option value="animated">Animated</option>
              <option value="instant">Instant</option>
            </select>
          </div>

          <div class="prop-row">
            <label>Date/Time Format</label>
            <select [(ngModel)]="dateTimeFormat">
              @for (entry of dateTimeFormatEntries; track entry[0]) {
                <option [value]="entry[1]">{{ entry[0].replace('_', ' ') }}</option>
              }
            </select>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Theme Colors -->
        <div class="control-section">
          <div class="section-title">Theme — Colors</div>
          @for (row of themeColorRows; track row[0]) {
            <div class="prop-row">
              <label>{{ row[1] }}</label>
              <input type="color" [value]="$any(theme)[row[0]]"
                (input)="setThemeColor(row[0], $any($event.target).value)" />
            </div>
          }
        </div>

        <div class="divider"></div>

        <!-- Theme Sizes -->
        <div class="control-section">
          <div class="section-title">Theme — Sizes</div>
          @for (row of themeSizeRows; track row[0]) {
            <div class="prop-row">
              <label>{{ row[1] }}</label>
              <input type="range" [min]="row[2]" [max]="row[3]" [value]="$any(theme)[row[0]]"
                (input)="setThemeSize(row[0], +$any($event.target).value)" />
              <span class="range-value">{{ $any(theme)[row[0]] }}</span>
            </div>
          }
        </div>

        <div class="divider"></div>

        <!-- Swim Lane Events -->
        <div class="control-section">
          <div class="section-title">Swim Lane Events</div>
          <div class="info-panel" style="max-height:160px; overflow-y:auto">
            @if (swimLaneLog.length === 0) {
              <span class="no-events">Click/hover swim lane items…</span>
            } @else {
              @for (msg of swimLaneLog; track $index) {
                <div class="event-entry" [class.latest]="$index === 0">{{ msg }}</div>
              }
            }
          </div>
        </div>

      </div>
    </div>

    <!-- Timeline -->
    <div class="timeline-wrapper">
      @if (cesiumClock) {
        <ct-timeline
          [currentTime]="currentTime"
          [clock]="cesiumClock"
          [height]="timelineHeight"
          [showControls]="showControls"
          [enableDrag]="enableDrag"
          [dateTimeFormat]="dateTimeFormat"
          [jumpToTime]="jumpToTime"
          [theme]="theme"
          [swimLanes]="swimLanes"
          [showSwimLanes]="showSwimLanes"
          [swimLaneTransition]="swimLaneTransition"
          (timeChange)="onTimeChange($event)"
          (playPause)="onPlayPause($event)"
          (multiplierChange)="onMultiplierChange($event)"
          (dateTimeClick)="onDateTimeClick()"
          (showSwimLanesChange)="showSwimLanes = $event"
          (swimLaneItemClick)="onSwimLaneClick($event)"
          (swimLaneItemHover)="onSwimLaneHover($event)"
          (swimLaneReorder)="onSwimLaneReorder($event)"
        />
      }
    </div>

    <!-- DateTime picker overlay -->
    @if (pickerOpen) {
      <div class="picker-overlay" (click)="pickerOpen = false">
        <div class="picker-dialog" (click)="$event.stopPropagation()">
          <div class="picker-title">Jump to Date/Time</div>
          <input class="picker-input" type="datetime-local" [(ngModel)]="pickerValue" autofocus />
          <div class="picker-actions">
            <button (click)="pickerOpen = false">Cancel</button>
            <button (click)="applyPicker()">Apply</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  cesiumClock: Cesium.Clock | null = null;
  currentTime: Date = new Date();
  jumpToTime: Date | undefined;

  // Timeline props
  timelineHeight = 150;
  showControls   = true;
  enableDrag     = true;
  showSwimLanes  = true;
  swimLaneTransition: 'animated' | 'instant' = 'animated';
  dateTimeFormat = DateTimeFormats.DEFAULT;
  theme: TimelineTheme = { ...defaultTheme, backgroundColor: '#2a2a2a' };

  // Swim lanes (fixed data built once)
  readonly swimLanes: SwimLane[] = makeSwimLanes();
  swimLaneLog: string[] = [];

  // DateTime picker
  pickerOpen  = false;
  pickerValue = '';

  // Theme metadata for template loops
  readonly themeColorRows: [keyof TimelineTheme, string][] = [
    ['backgroundColor',      'Background'],
    ['controlBarBackground', 'Control Bar Bg'],
    ['controlBarBorder',     'Control Bar Border'],
    ['tickColor',            'Tick'],
    ['majorTickColor',       'Major Tick'],
    ['labelColor',           'Label'],
    ['indicatorColor',       'Indicator'],
    ['buttonColor',          'Button'],
    ['buttonHoverColor',     'Button Hover'],
    ['buttonActiveColor',    'Button Active'],
    ['swimLaneItemBorderColor', 'Lane Item Border'],
  ];
  readonly themeSizeRows: [keyof TimelineTheme, string, number, number][] = [
    ['indicatorLineWidth',     'Indicator Width',    1, 8],
    ['majorTickHeight',        'Major Tick H',       4, 24],
    ['minorTickHeight',        'Minor Tick H',       2, 16],
    ['fontSize',               'Font Size',          8, 20],
    ['swimLaneItemBorderWidth','Lane Item Border W',  0, 6],
  ];
  readonly dateTimeFormatEntries = Object.entries(DateTimeFormats) as [string, string][];

  private viewer: Cesium.Viewer | null = null;
  private clockTickListener?: (clock: Cesium.Clock) => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Cesium must init after view is ready; use setTimeout to defer past initial render
    setTimeout(() => this.initCesium(), 0);
  }

  ngOnDestroy(): void {
    if (this.clockTickListener) {
      this.viewer?.clock.onTick.removeEventListener(this.clockTickListener);
    }
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }

  private initCesium(): void {
    const container = document.querySelector('.cesium-container') as HTMLElement;
    if (!container) return;

    try {
      this.viewer = new Cesium.Viewer(container, {
        animation: false, baseLayerPicker: false, fullscreenButton: false,
        geocoder: false, homeButton: false, infoBox: false,
        sceneModePicker: false, selectionIndicator: false,
        timeline: false, navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
      });

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      this.viewer.clock.startTime   = Cesium.JulianDate.fromDate(startOfDay);
      this.viewer.clock.stopTime    = Cesium.JulianDate.fromDate(endOfDay);
      this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
      this.viewer.clock.clockStep   = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      this.viewer.clock.multiplier  = 1;

      this.cesiumClock = this.viewer.clock;
      this.currentTime = now;

      this.clockTickListener = (clock: Cesium.Clock) => {
        this.currentTime = Cesium.JulianDate.toDate(clock.currentTime);
        this.cdr.markForCheck();
      };
      this.viewer.clock.onTick.addEventListener(this.clockTickListener);

      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to initialize Cesium viewer:', err);
    }
  }

  onTimeChange(t: Cesium.JulianDate): void {
    if (this.viewer) this.viewer.clock.currentTime = t;
  }

  onPlayPause(playing: boolean): void {
    if (this.viewer) this.viewer.clock.shouldAnimate = playing;
  }

  onMultiplierChange(mult: number): void {
    if (this.viewer) this.viewer.clock.multiplier = mult;
  }

  onDateTimeClick(): void {
    const d = this.currentTime;
    this.pickerValue = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    this.pickerOpen = true;
  }

  applyPicker(): void {
    const d = new Date(this.pickerValue);
    if (!isNaN(d.getTime())) this.jumpToTime = new Date(d);
    this.pickerOpen = false;
  }

  onSwimLaneClick(info: SwimLaneEventInfo): void {
    this.addLog(`Click: lane=${info.laneId} item=${info.item.id}`);
  }

  onSwimLaneHover(info: SwimLaneEventInfo | null): void {
    if (info) this.addLog(`Hover: lane=${info.laneId} item=${info.item.id}`);
  }

  onSwimLaneReorder(ids: string[]): void {
    this.addLog(`Reorder: ${ids.join(', ')}`);
  }

  setThemeColor(key: keyof TimelineTheme, value: string): void {
    this.theme = { ...this.theme, [key]: value };
  }

  setThemeSize(key: keyof TimelineTheme, value: number): void {
    this.theme = { ...this.theme, [key]: value };
  }

  private addLog(msg: string): void {
    this.swimLaneLog = [msg, ...this.swimLaneLog].slice(0, 8);
  }
}
