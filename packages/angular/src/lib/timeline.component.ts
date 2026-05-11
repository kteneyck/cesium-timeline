import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type SwimLane,
  type SwimLaneEventInfo,
  defaultTheme,
  toJulianDate,
  TICK_AREA_HEIGHT,
} from '@kteneyck/cesium-timeline-core';
import { TimelineControlsComponent } from './timeline-controls.component';
import { TimelineCanvasComponent } from './timeline-canvas.component';

const DEFAULT_FF_SPEEDS = [2, 4, 8, 16, 32, 100, 1];
const DEFAULT_RW_SPEEDS = [1, 2, 4, 8, 16, 32, 100];

@Component({
  selector: 'ct-timeline',
  standalone: true,
  imports: [TimelineControlsComponent, TimelineCanvasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="cssClass"
      [style.width]="'100%'"
      [style.height]="heightStyle"
      [style.overflow]="'hidden'"
      [style.display]="'flex'"
      [style.flex-direction]="'column'"
      [style.font-family]="'system-ui, -apple-system, sans-serif'"
      [style.transition]="swimLaneTransition === 'animated' ? 'height 0.2s ease' : undefined"
    >
      @if (showControls) {
        <div #controlsEl>
          <ct-timeline-controls
            [currentTime]="currentTimeState"
            [isPlaying]="isPlayingState"
            [multiplier]="multiplierState"
            [isLive]="isLive"
            [hasStartTime]="startTime != null"
            [hasEndTime]="endTime != null"
            [dateTimeFormat]="dateTimeFormat"
            [theme]="finalTheme"
            [swimLanesVisible]="hasSwimLanes ? swimLanesExpanded : undefined"
            (playPause)="handlePlayPause($event)"
            (jumpToStart)="handleJumpToStart()"
            (rewind)="handleRewindSpeed()"
            (fastForward)="handleFastForward()"
            (jumpToEnd)="handleJumpToEnd()"
            (jumpToLive)="handleJumpToLive()"
            (resetSpeed)="applyMultiplier(1)"
            (dateTimeClick)="dateTimeClick.emit()"
            (toggleSwimLanes)="handleToggleSwimLanes()"
          />
        </div>
      }

      @if (enableDrag !== false) {
        <ct-timeline-canvas
          [currentTime]="currentTimeState"
          [defaultStartMs]="defaultStartMs"
          [defaultEndMs]="defaultEndMs"
          [theme]="finalTheme"
          [maxTicks]="maxTicks"
          [swimLanes]="swimLanes"
          [showSwimLanes]="swimLanesExpanded"
          (timeChange)="handleTimeChange($event)"
          (dragStart)="isDragging = true"
          (dragEnd)="isDragging = false"
          (swimLaneItemClick)="swimLaneItemClick.emit($event)"
          (swimLaneItemHover)="swimLaneItemHover.emit($event)"
          (swimLaneItemDoubleClick)="swimLaneItemDoubleClick.emit($event)"
          (swimLaneItemContextMenu)="swimLaneItemContextMenu.emit($event)"
          (swimLaneReorder)="swimLaneReorder.emit($event)"
        />
      }
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class TimelineComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  // ── Inputs ─────────────────────────────────────────────────────────────
  @Input() startTime?: Cesium.JulianDate | Date;
  @Input() endTime?: Cesium.JulianDate | Date;
  @Input() currentTime?: Cesium.JulianDate | Date;
  @Input() clock?: Cesium.Clock;
  @Input() height?: number;
  @Input() showControls = true;
  @Input() enableDrag = true;
  @Input() dateTimeFormat?: string;
  @Input() jumpToTime?: Cesium.JulianDate | Date;
  @Input() maxTicks?: number;
  @Input() ffSpeeds: number[] = DEFAULT_FF_SPEEDS;
  @Input() rwSpeeds: number[] = DEFAULT_RW_SPEEDS;
  @Input() theme?: Partial<TimelineTheme>;
  @Input() cssClass?: string;
  @Input() swimLanes?: SwimLane[];
  @Input() showSwimLanes?: boolean;
  @Input() swimLaneTransition: 'animated' | 'instant' = 'animated';

  // ── Outputs ────────────────────────────────────────────────────────────
  @Output() timeChange = new EventEmitter<Cesium.JulianDate>();
  @Output() playPause = new EventEmitter<boolean>();
  @Output() multiplierChange = new EventEmitter<number>();
  @Output() dateTimeClick = new EventEmitter<void>();
  @Output() showSwimLanesChange = new EventEmitter<boolean>();
  @Output() swimLaneItemClick = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneItemHover = new EventEmitter<SwimLaneEventInfo | null>();
  @Output() swimLaneItemDoubleClick = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneItemContextMenu = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneReorder = new EventEmitter<string[]>();

  // ── ViewChild refs ─────────────────────────────────────────────────────
  @ViewChild(TimelineCanvasComponent) canvasComp?: TimelineCanvasComponent;
  @ViewChild('controlsEl') controlsRef?: ElementRef<HTMLDivElement>;

  // ── Internal state ─────────────────────────────────────────────────────
  currentTimeState!: Cesium.JulianDate;
  isPlayingState = false;
  multiplierState = 1;
  swimLanesExpanded = true;
  controlsHeight = 0;
  isDragging = false;
  defaultStartMs = 0;
  defaultEndMs = 0;
  finalTheme: TimelineTheme = { ...defaultTheme };

  private ro?: ResizeObserver;
  private clockCleanup?: () => void;
  private fallbackInterval?: ReturnType<typeof setInterval>;

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  get hasSwimLanes(): boolean {
    return this.swimLanes != null && this.swimLanes.length > 0;
  }

  get isLive(): boolean {
    return Math.abs(Cesium.JulianDate.toDate(this.currentTimeState).getTime() - Date.now()) < 10_000;
  }

  get isCollapsed(): boolean {
    return this.hasSwimLanes && !this.swimLanesExpanded;
  }

  get heightStyle(): string {
    if (this.isCollapsed) return `${this.controlsHeight + TICK_AREA_HEIGHT}px`;
    if (this.height != null) return `${this.height}px`;
    return '100%';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    const now = Date.now();
    this.defaultStartMs = this.startTime
      ? Cesium.JulianDate.toDate(toJulianDate(this.startTime)).getTime()
      : now - 12 * 3600 * 1000;
    this.defaultEndMs = this.endTime
      ? Cesium.JulianDate.toDate(toJulianDate(this.endTime)).getTime()
      : now + 12 * 3600 * 1000;

    this.currentTimeState = toJulianDate(
      this.currentTime ?? (this.startTime ?? Cesium.JulianDate.fromDate(new Date()))
    );
    this.isPlayingState = this.clock?.shouldAnimate ?? false;
    this.multiplierState = this.clock?.multiplier ?? 1;
    this.swimLanesExpanded = this.showSwimLanes ?? true;
    this.finalTheme = { ...defaultTheme, ...this.theme };
  }

  ngAfterViewInit(): void {
    const el = this.controlsRef?.nativeElement;
    if (el) {
      this.ro = new ResizeObserver(([entry]) => {
        this.controlsHeight = entry.borderBoxSize[0].blockSize;
        this.cdr.markForCheck();
      });
      this.ro.observe(el);
    }

    // Clock sync
    this.setupClockSync();

    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['theme']) {
      this.finalTheme = { ...defaultTheme, ...this.theme };
    }
    if (changes['showSwimLanes'] && this.showSwimLanes != null) {
      this.swimLanesExpanded = this.showSwimLanes;
    }
    if (changes['clock'] && !changes['clock'].firstChange) {
      this.cleanupClockSync();
      this.setupClockSync();
    }
    if (changes['jumpToTime'] && this.jumpToTime) {
      const t = toJulianDate(this.jumpToTime);
      this.handleTimeChange(t);
      if (this.canvasComp) {
        const { startMs, endMs } = this.canvasComp.getVisibleRange();
        const span = endMs - startMs;
        const newMs = Cesium.JulianDate.toDate(t).getTime();
        this.canvasComp.zoomTo(newMs - span / 2, newMs + span / 2);
      }
    }
  }

  ngOnDestroy(): void {
    this.cleanupClockSync();
    this.ro?.disconnect();
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
  }

  // ── Clock sync ─────────────────────────────────────────────────────────

  private setupClockSync(): void {
    if (this.clock) {
      const onTick = () => {
        if (this.isDragging) return;
        const ct = Cesium.JulianDate.clone(this.clock!.currentTime);
        this.currentTimeState = ct;
        this.isPlayingState = this.clock!.shouldAnimate;
        this.multiplierState = this.clock!.multiplier;

        if (this.canvasComp) {
          const { startMs, endMs } = this.canvasComp.getVisibleRange();
          const span = endMs - startMs;
          const ctMs = Cesium.JulianDate.toDate(ct).getTime();
          const pos = ctMs - startMs;
          if (pos <= span * 0.1) {
            this.canvasComp.zoomTo(ctMs - span * 0.1, ctMs + span * 0.9, ctMs);
          } else if (pos >= span * 0.9) {
            this.canvasComp.zoomTo(ctMs - span * 0.9, ctMs + span * 0.1, ctMs);
          }
        }
        this.cdr.markForCheck();
      };
      this.clock.onTick.addEventListener(onTick);
      this.clockCleanup = () => this.clock!.onTick.removeEventListener(onTick);
    } else {
      this.ngZone.runOutsideAngular(() => {
        this.fallbackInterval = setInterval(() => {
          if (this.isDragging) return;
          const ct = Cesium.JulianDate.fromDate(new Date());
          this.currentTimeState = ct;
          if (this.canvasComp) {
            const { startMs, endMs } = this.canvasComp.getVisibleRange();
            const span = endMs - startMs;
            const ctMs = Cesium.JulianDate.toDate(ct).getTime();
            const pos = ctMs - startMs;
            if (pos <= span * 0.1) this.canvasComp.zoomTo(ctMs - span * 0.1, ctMs + span * 0.9, ctMs);
            else if (pos >= span * 0.9) this.canvasComp.zoomTo(ctMs - span * 0.9, ctMs + span * 0.1, ctMs);
          }
          this.ngZone.run(() => this.cdr.markForCheck());
        }, 1000);
      });
    }
  }

  private cleanupClockSync(): void {
    this.clockCleanup?.();
    this.clockCleanup = undefined;
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = undefined;
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  handleTimeChange(t: Cesium.JulianDate): void {
    this.currentTimeState = t;
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(t);
    this.timeChange.emit(t);
    this.cdr.markForCheck();
  }

  handlePlayPause(playing: boolean): void {
    if (playing && this.multiplierState < 0) {
      this.applyMultiplier(1, false);
    }
    if (this.clock) this.clock.shouldAnimate = playing;
    this.isPlayingState = playing;
    this.playPause.emit(playing);
    this.cdr.markForCheck();
  }

  handleFastForward(): void {
    const speeds = this.ffSpeeds.length > 0 ? this.ffSpeeds : DEFAULT_FF_SPEEDS;
    const cur = this.multiplierState > 1 ? this.multiplierState : 1;
    const idx = speeds.indexOf(cur);
    const next = speeds[idx < 0 || idx === speeds.length - 1 ? 0 : idx + 1];
    this.applyMultiplier(next);
  }

  handleRewindSpeed(): void {
    const speeds = this.rwSpeeds.length > 0 ? this.rwSpeeds : DEFAULT_RW_SPEEDS;
    const curAbs = this.multiplierState < 0 ? Math.abs(this.multiplierState) : 0;
    const idx = speeds.indexOf(curAbs);
    const next = -(speeds[idx < 0 || idx === speeds.length - 1 ? 0 : idx + 1]);
    this.applyMultiplier(next);
  }

  handleJumpToStart(): void {
    const t = toJulianDate(this.startTime ?? Cesium.JulianDate.fromDate(new Date(this.defaultStartMs)));
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(t);
    this.currentTimeState = t;
    this.canvasComp?.zoomTo(this.defaultStartMs, this.defaultEndMs);
    this.cdr.markForCheck();
  }

  handleJumpToEnd(): void {
    const t = toJulianDate(this.endTime ?? Cesium.JulianDate.fromDate(new Date(this.defaultEndMs)));
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(t);
    this.currentTimeState = t;
    this.canvasComp?.zoomTo(this.defaultStartMs, this.defaultEndMs);
    this.cdr.markForCheck();
  }

  handleJumpToLive(): void {
    const t = Cesium.JulianDate.fromDate(new Date());
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(t);
    this.currentTimeState = t;
    this.applyMultiplier(1);
    const nowMs = Date.now();
    this.canvasComp?.zoomTo(nowMs - 12 * 3600 * 1000, nowMs + 12 * 3600 * 1000);
    this.cdr.markForCheck();
  }

  handleToggleSwimLanes(): void {
    this.swimLanesExpanded = !this.swimLanesExpanded;
    this.showSwimLanesChange.emit(this.swimLanesExpanded);
    this.cdr.markForCheck();
  }

  applyMultiplier(m: number, play = true): void {
    if (this.clock) { this.clock.multiplier = m; if (play) this.clock.shouldAnimate = true; }
    this.multiplierState = m;
    if (play) this.isPlayingState = true;
    this.multiplierChange.emit(m);
    this.cdr.markForCheck();
  }
}
