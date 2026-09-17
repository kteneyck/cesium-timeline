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
  type TimelineLabels,
  type SwimLane,
  type SwimLaneEventInfo,
  defaultTheme,
  toJulianDate,
  TICK_AREA_HEIGHT,
  clampMsToLimits,
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
            [showJumpToStart]="showJumpToStart"
            [showJumpToEnd]="showJumpToEnd"
            [dateTimeFormat]="dateTimeFormat"
            [timezone]="timezone"
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
            [labels]="labels"
            [liveButtonSize]="liveButtonSize"
            [liveButtonPosition]="liveButtonPosition"
            [showLive]="showLive"
            [live]="live"
          />
        </div>
      }

      @if (enableDrag !== false || live) {
        <ct-timeline-canvas
          [currentTime]="currentTimeState"
          [defaultStartMs]="defaultStartMs"
          [defaultEndMs]="defaultEndMs"
          [theme]="finalTheme"
          [maxTicks]="maxTicks"
          [timezone]="timezone"
          [dateTimeFormat]="dateTimeFormat"
          [months]="labels?.months"
          [swimLanes]="swimLanes"
          [showSwimLanes]="swimLanesExpanded"
          [disableNeedleDrag]="live"
          [invertScrollZoom]="invertScrollZoom"
          [restrictToRange]="restrictToRange"
          [limitStartMs]="limitStartMs"
          [limitEndMs]="limitEndMs"
          (timeChange)="handleTimeChange($event)"
          (dragStart)="isDragging = true"
          (dragEnd)="isDragging = false"
          (swimLaneItemClick)="swimLaneItemClick.emit($event)"
          (swimLaneItemHover)="swimLaneItemHover.emit($event)"
          (swimLaneItemDoubleClick)="swimLaneItemDoubleClick.emit($event)"
          (swimLaneItemContextMenu)="swimLaneItemContextMenu.emit($event)"
          (swimLaneReorder)="swimLaneReorder.emit($event)"
          (rangeSelect)="rangeSelect.emit($event)"
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
  @Input() showJumpToStart?: boolean;
  @Input() showJumpToEnd?: boolean;
  @Input() enableDrag = true;
  @Input() dateTimeFormat?: string;
  @Input() jumpToTime?: Cesium.JulianDate | Date;
  @Input() maxTicks?: number;
  @Input() ffSpeeds: number[] = DEFAULT_FF_SPEEDS;
  @Input() rwSpeeds: number[] = DEFAULT_RW_SPEEDS;
  @Input() theme?: Partial<TimelineTheme>;
  @Input() cssClass?: string;
  @Input() timezone?: string;
  @Input() swimLanes?: SwimLane[];
  @Input() showSwimLanes?: boolean;
  @Input() swimLaneTransition: 'animated' | 'instant' = 'animated';
  /** Overrides for control-bar labels and tooltips (i18n / custom verbiage). */
  @Input() labels?: Partial<TimelineLabels>;
  /** @see TimelineBaseProps.liveButtonSize */
  @Input() liveButtonSize?: 'sm' | 'md' | 'lg';
  /** @see TimelineBaseProps.liveButtonPosition */
  @Input() liveButtonPosition?: 'left' | 'right';
  /** @see TimelineBaseProps.showLive */
  @Input() showLive = true;
  /** @see TimelineBaseProps.live */
  @Input() live = false;
  @Input() invertScrollZoom = false;
  /** @see TimelineBaseProps.restrictToRange */
  @Input() restrictToRange = false;

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
  @Output() rangeSelect = new EventEmitter<{ start: Cesium.JulianDate; end: Cesium.JulianDate }>();

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

  /** Hard lower bound for the needle when `restrictToRange` is set. */
  get limitStartMs(): number | undefined {
    return this.startTime != null ? this.defaultStartMs : undefined;
  }

  /** Hard upper bound for the needle when `restrictToRange` is set. */
  get limitEndMs(): number | undefined {
    return this.endTime != null ? this.defaultEndMs : undefined;
  }

  private clampTimeMs(ms: number): number {
    return this.restrictToRange ? clampMsToLimits(ms, this.limitStartMs, this.limitEndMs) : ms;
  }

  get isLive(): boolean {
    return Math.abs(Cesium.JulianDate.toDate(this.currentTimeState).getTime() - Date.now()) < 2_000;
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

  /** Derive the default visible range from the current startTime/endTime inputs. */
  private recomputeDefaultRange(): void {
    const now = Date.now();
    this.defaultStartMs = this.startTime
      ? Cesium.JulianDate.toDate(toJulianDate(this.startTime)).getTime()
      : now - 12 * 3600 * 1000;
    this.defaultEndMs = this.endTime
      ? Cesium.JulianDate.toDate(toJulianDate(this.endTime)).getTime()
      : now + 12 * 3600 * 1000;
  }

  ngOnInit(): void {
    this.recomputeDefaultRange();

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
    // Must run before anything below reads the limits: Angular calls
    // ngOnChanges before ngOnInit, so on the first pass defaultStartMs /
    // defaultEndMs are still 0 and would clamp jumpToTime to the epoch.
    if (changes['startTime'] || changes['endTime']) {
      this.recomputeDefaultRange();
    }
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
    if (changes['jumpToTime'] && this.jumpToTime && !this.live) {
      const t = toJulianDate(this.jumpToTime);
      this.handleTimeChange(t);
      if (this.canvasComp) {
        const { startMs, endMs } = this.canvasComp.getVisibleRange();
        const span = endMs - startMs;
        const newMs = this.clampTimeMs(Cesium.JulianDate.toDate(t).getTime());
        this.canvasComp.zoomTo(newMs - span / 2, newMs + span / 2);
      }
    }
    if (changes['live'] && !changes['live'].firstChange &&
        this.live && !changes['live'].previousValue) {
      // Live mode switched on — jump to and follow current time.
      this.handleJumpToLive();
    }
    if ((changes['startTime'] && !changes['startTime'].firstChange) ||
        (changes['endTime']   && !changes['endTime'].firstChange)) {
      if (this.canvasComp && this.startTime != null && this.endTime != null) {
        // Push the new bounds down before zooming: Angular only propagates the
        // [limitStartMs]/[limitEndMs] bindings after this hook returns, so
        // zoomTo() would otherwise clamp the new range against the old limits.
        this.canvasComp.limitStartMs = this.limitStartMs;
        this.canvasComp.limitEndMs   = this.limitEndMs;
        this.canvasComp.zoomTo(this.defaultStartMs, this.defaultEndMs);
      }
      this.cdr.markForCheck();
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
        const rawMs = Cesium.JulianDate.toDate(this.clock!.currentTime).getTime();
        const ctMs  = this.clampTimeMs(rawMs);
        if (ctMs !== rawMs) {
          // Hit a restrictToRange boundary — snap the needle to it. Only stop
          // playback when the clamp opposes the direction of travel; a clock
          // sitting outside the range and heading back into it keeps running.
          this.clock!.currentTime = Cesium.JulianDate.fromDate(new Date(ctMs));
          const hitEndLimit   = ctMs < rawMs;
          const movingForward = this.clock!.multiplier > 0;
          if (hitEndLimit ? movingForward : !movingForward) {
            this.clock!.shouldAnimate = false;
          }
        }
        const ct = Cesium.JulianDate.clone(this.clock!.currentTime);
        this.currentTimeState = ct;
        this.isPlayingState = this.clock!.shouldAnimate;
        this.multiplierState = this.clock!.multiplier;

        if (this.canvasComp) {
          const { startMs, endMs } = this.canvasComp.getVisibleRange();
          const span = endMs - startMs;
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
          const ctMs = this.clampTimeMs(Date.now());
          const ct   = Cesium.JulianDate.fromDate(new Date(ctMs));
          this.currentTimeState = ct;
          if (this.canvasComp) {
            const { startMs, endMs } = this.canvasComp.getVisibleRange();
            const span = endMs - startMs;
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
    const rawMs = Cesium.JulianDate.toDate(t).getTime();
    const clampedMs = this.clampTimeMs(rawMs);
    const finalT = clampedMs === rawMs ? t : Cesium.JulianDate.fromDate(new Date(clampedMs));
    this.currentTimeState = finalT;
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(finalT);
    this.timeChange.emit(finalT);
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
    const nowMs = this.clampTimeMs(Date.now());
    const t = Cesium.JulianDate.fromDate(new Date(nowMs));
    if (this.clock) this.clock.currentTime = Cesium.JulianDate.clone(t);
    this.currentTimeState = t;
    this.applyMultiplier(1);
    if (this.canvasComp) {
      const { startMs, endMs } = this.canvasComp.getVisibleRange();
      const span = endMs - startMs;
      this.canvasComp.zoomTo(nowMs - span / 2, nowMs + span / 2);
    }
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
