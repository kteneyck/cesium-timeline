import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type TimelineLabels,
  DEFAULT_LABELS,
  resolveLabel,
  formatDateTime,
  getTimezoneAbbr,
  splitForDisplay,
} from '@kteneyck/cesium-timeline-core';

@Component({
  selector: 'ct-timeline-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #container
      [style.display]="isNarrow ? 'flex' : 'grid'"
      [style.grid-template-columns]="isNarrow ? undefined : '1fr auto 1fr'"
      [style.align-items]="'center'"
      [style.padding]="'6px 16px'"
      [style.background-color]="theme.controlBarBackground"
      [style.border-bottom]="'1px solid ' + theme.controlBarBorder"
      [style.font-family]="'system-ui, -apple-system, sans-serif'"
    >
      <!-- Left: Datetime + LIVE (if position=left) -->
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div
          (click)="!live && dateTimeClick.emit()"
          [title]="(!live && dateTimeClick.observed) ? l.dateTimeClickTooltip : ''"
          [style.color]="theme.labelColor"
          style="font-family:monospace;line-height:1.15;border-radius:4px;padding:2px 4px;transition:background 0.15s"
          [style.cursor]="(!live && dateTimeClick.observed) ? 'pointer' : 'default'"
        >
          @if (timeFormat) {
            <div style="font-size:2em;font-weight:bold;letter-spacing:0.02em">
              {{ formattedTime }}
            </div>
          }
          @if (dateFormat) {
            <div style="display:flex;align-items:center;gap:6px">
              <span [style.color]="theme.buttonActiveColor" style="font-size:1.15em;letter-spacing:0.03em">
                {{ formattedDate }}
              </span>
              @if (timezoneAbbr) {
                <span
                  [style.color]="theme.labelColor"
                  style="font-size:1.04em;font-weight:bold;letter-spacing:0.04em;opacity:0.7"
                >{{ timezoneAbbr }}</span>
              }
            </div>
          }
        </div>

        @if (liveButtonPosition === 'left') {
          <div style="display:flex;align-items:center;gap:4px">
            <button
              (click)="!live && jumpToLive.emit()"
              [style.color]="(live || isLive) ? theme.controlBarBackground : theme.buttonActiveColor"
              [style.background-color]="(live || isLive) ? theme.buttonActiveColor : 'transparent'"
              [style.border-color]="theme.buttonActiveColor"
              [style.opacity]="1"
              [style.width.px]="liveSize.width"
              [style.min-width.px]="liveSize.width"
              [style.height.px]="liveSize.height"
              [style.font-size]="liveSize.fontSize"
              [style.border-radius]="liveSize.borderRadius"
              [style.cursor]="live ? 'default' : 'pointer'"
              style="background:none;border:1px solid;font-weight:bold;letter-spacing:0.05em;display:flex;align-items:center;justify-content:center;padding:0;gap:4px;font-family:system-ui,-apple-system,sans-serif;transition:opacity 0.15s"
              [title]="(live || isLive) ? l.liveActiveTooltip : l.liveTooltip"
            >
              @if (live || isLive) {
                <span
                  [style.width.px]="liveSize.dot"
                  [style.height.px]="liveSize.dot"
                  [style.background-color]="theme.liveDotColor"
                  style="border-radius:50%;display:inline-block;flex-shrink:0"
                ></span>
              }
              {{ (live || isLive) ? l.liveActiveLabel : l.liveLabel }}
            </button>
            @if (!isNormalSpeed && !live) {
              <button
                (click)="resetSpeed.emit()"
                [style.color]="theme.buttonActiveColor"
                [style.border-color]="theme.buttonActiveColor + '44'"
                [style.width.px]="liveSize.width"
                [style.min-width.px]="liveSize.width"
                [style.height.px]="liveSize.height"
                style="background:none;border:1px solid;cursor:pointer;font-size:11px;border-radius:4px;display:flex;align-items:center;justify-content:center;padding:0;font-family:system-ui,-apple-system,sans-serif;transition:background-color 0.15s"
                [title]="l.resetSpeedTooltip"
              >{{ isRewinding ? '◀ ' + absMultiplier + '×' : absMultiplier + '× ▶' }}</button>
            }
          </div>
        }
      </div>

      <!-- Center: Transport buttons -->
      <div
        style="display:flex;align-items:center;gap:2px"
        [style.flex]="isNarrow ? '1' : undefined"
        [style.justify-content]="isNarrow ? 'center' : undefined"
      >
        @if (!live && showJumpToStart !== false) {
          <button
            (click)="hasStartTime && jumpToStart.emit()"
            [disabled]="!hasStartTime"
            [style.color]="theme.buttonColor"
            [style.opacity]="hasStartTime ? 1 : 0.3"
            [style.cursor]="hasStartTime ? 'pointer' : 'default'"
            class="ct-btn"
            [title]="hasStartTime ? l.jumpToStartTooltip : l.noStartTimeTooltip"
          >⏮</button>
        }

        @if (!live) {
          <button
            (click)="rewind.emit()"
            [style.color]="isRewinding ? theme.buttonActiveColor : theme.buttonColor"
            [style.border-color]="isRewinding ? theme.buttonActiveColor + '33' : 'transparent'"
            class="ct-btn ct-btn-wide"
            [title]="isRewinding ? resolveRewindActive(absMultiplier) : l.rewindTooltip"
          >
            @if (isRewinding) {
              <span style="font-size:11px;font-weight:bold">{{ absMultiplier }}×</span>◀◀
            } @else {
              ◀◀
            }
          </button>
        }

        @if (!live) {
          <button
            (click)="playPause.emit(!isPlaying)"
            [style.color]="theme.buttonActiveColor"
            [style.border-color]="theme.buttonActiveColor + '55'"
            [style.padding-left]="isPlaying ? '0' : '2px'"
            class="ct-btn ct-btn-play"
            [title]="isPlaying ? l.pauseTooltip : (isRewinding ? l.playFromRewindTooltip : l.playTooltip)"
          >
            @if (isPlaying) {
              <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
                <rect x="1" y="0" width="4" height="16" rx="1"/>
                <rect x="9" y="0" width="4" height="16" rx="1"/>
              </svg>
            } @else {
              ▶
            }
          </button>
        }

        @if (!live) {
          <button
            (click)="fastForward.emit()"
            [style.color]="isFastForward ? theme.buttonActiveColor : theme.buttonColor"
            [style.border-color]="isFastForward ? theme.buttonActiveColor + '33' : 'transparent'"
            class="ct-btn ct-btn-wide"
            [title]="isFastForward ? resolveFastForwardActive(absMultiplier) : l.fastForwardTooltip"
          >
            @if (isFastForward) {
              ▶▶<span style="font-size:11px;font-weight:bold">{{ absMultiplier }}×</span>
            } @else {
              ▶▶
            }
          </button>
        }

        @if (!live && showJumpToEnd !== false) {
          <button
            (click)="hasEndTime && jumpToEnd.emit()"
            [disabled]="!hasEndTime"
            [style.color]="theme.buttonColor"
            [style.opacity]="hasEndTime ? 1 : 0.3"
            [style.cursor]="hasEndTime ? 'pointer' : 'default'"
            class="ct-btn"
            [title]="hasEndTime ? l.jumpToEndTooltip : l.noEndTimeTooltip"
          >⏭</button>
        }
      </div>

      <!-- Right: LIVE (if position=right) + swim-lane toggle -->
      @if (!isNarrow) {
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px">
          @if (liveButtonPosition === 'right') {
            <div style="display:flex;align-items:center;gap:4px">
              <button
                (click)="!live && jumpToLive.emit()"
                [style.color]="(live || isLive) ? theme.controlBarBackground : theme.buttonActiveColor"
                [style.background-color]="(live || isLive) ? theme.buttonActiveColor : 'transparent'"
                [style.border-color]="theme.buttonActiveColor"
                [style.opacity]="1"
                [style.width.px]="liveSize.width"
                [style.min-width.px]="liveSize.width"
                [style.height.px]="liveSize.height"
                [style.font-size]="liveSize.fontSize"
                [style.border-radius]="liveSize.borderRadius"
                [style.cursor]="live ? 'default' : 'pointer'"
                style="background:none;border:1px solid;font-weight:bold;letter-spacing:0.05em;display:flex;align-items:center;justify-content:center;padding:0;gap:4px;font-family:system-ui,-apple-system,sans-serif;transition:opacity 0.15s"
                [title]="(live || isLive) ? l.liveActiveTooltip : l.liveTooltip"
              >
                @if (live || isLive) {
                  <span
                    [style.width.px]="liveSize.dot"
                    [style.height.px]="liveSize.dot"
                    [style.background-color]="theme.liveDotColor"
                    style="border-radius:50%;display:inline-block;flex-shrink:0"
                  ></span>
                }
                {{ (live || isLive) ? l.liveActiveLabel : l.liveLabel }}
              </button>
              @if (!isNormalSpeed && !live) {
                <button
                  (click)="resetSpeed.emit()"
                  [style.color]="theme.buttonActiveColor"
                  [style.border-color]="theme.buttonActiveColor + '44'"
                  [style.width.px]="liveSize.width"
                  [style.min-width.px]="liveSize.width"
                  [style.height.px]="liveSize.height"
                  style="background:none;border:1px solid;cursor:pointer;font-size:11px;border-radius:4px;display:flex;align-items:center;justify-content:center;padding:0;font-family:system-ui,-apple-system,sans-serif;transition:background-color 0.15s"
                  [title]="l.resetSpeedTooltip"
                >{{ isRewinding ? '◀ ' + absMultiplier + '×' : absMultiplier + '× ▶' }}</button>
              }
            </div>
          }
          @if (hasSwimLaneToggle) {
            <button
              (click)="toggleSwimLanes.emit()"
              [style.color]="theme.buttonActiveColor"
              [style.border-color]="theme.buttonActiveColor + '33'"
              class="ct-btn"
              [title]="swimLanesVisible ? l.collapseSwimLanesTooltip : l.expandSwimLanesTooltip"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                @if (swimLanesVisible) {
                  <polyline points="3,5 7,9 11,5"/>
                } @else {
                  <polyline points="3,9 7,5 11,9"/>
                }
              </svg>
            </button>
          }
        </div>
      }

      @if (isNarrow && hasSwimLaneToggle) {
        <button
          (click)="toggleSwimLanes.emit()"
          [style.color]="theme.buttonActiveColor"
          [style.border-color]="theme.buttonActiveColor + '33'"
          class="ct-btn"
          style="margin-left:4px"
          [title]="swimLanesVisible ? l.collapseSwimLanesTooltip : l.expandSwimLanesTooltip"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            @if (swimLanesVisible) {
              <polyline points="3,5 7,9 11,5"/>
            } @else {
              <polyline points="3,9 7,5 11,9"/>
            }
          </svg>
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ct-btn {
      background: none;
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 16px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      width: 32px;
      height: 32px;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s;
      font-family: system-ui, -apple-system, sans-serif;
      flex-shrink: 0;
      line-height: 1;
    }
    .ct-btn:hover { background-color: rgba(255,255,255,0.1); }
    .ct-btn-wide { width: 64px; min-width: 64px; gap: 3px; }
    .ct-btn-play {
      font-size: 18px;
      width: 40px;
      min-width: 40px;
      height: 40px;
      border-radius: 50%;
    }
  `],
})
export class TimelineControlsComponent implements AfterViewInit, OnDestroy {
  @Input() currentTime!: Cesium.JulianDate;
  @Input() isPlaying = false;
  @Input() multiplier = 1;
  @Input() dateTimeFormat?: string;
  @Input() timezone?: string;
  @Input() isLive = false;
  @Input() hasStartTime = false;
  @Input() hasEndTime = false;
  @Input() showJumpToStart?: boolean;
  @Input() showJumpToEnd?: boolean;
  @Input() theme!: TimelineTheme;
  @Input() swimLanesVisible?: boolean;
  @Input() labels?: Partial<TimelineLabels>;
  @Input() liveButtonSize: 'sm' | 'md' | 'lg' = 'md';
  @Input() liveButtonPosition: 'left' | 'right' = 'left';
  /** @see TimelineBaseProps.live */
  @Input() live = false;

  @Output() dateTimeClick = new EventEmitter<void>();
  @Output() playPause = new EventEmitter<boolean>();
  @Output() jumpToStart = new EventEmitter<void>();
  @Output() rewind = new EventEmitter<void>();
  @Output() fastForward = new EventEmitter<void>();
  @Output() jumpToEnd = new EventEmitter<void>();
  @Output() jumpToLive = new EventEmitter<void>();
  @Output() resetSpeed = new EventEmitter<void>();
  @Output() toggleSwimLanes = new EventEmitter<void>();

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

  isNarrow = false;
  private ro?: ResizeObserver;

  get isRewinding(): boolean { return this.multiplier < 0; }
  get isFastForward(): boolean { return this.multiplier > 1; }
  get isNormalSpeed(): boolean { return this.multiplier === 1; }
  get absMultiplier(): number { return Math.abs(this.multiplier); }
  get hasSwimLaneToggle(): boolean { return this.swimLanesVisible != null; }

  private static readonly LIVE_SIZE_MAP = {
    sm: { width: 44, height: 18, fontSize: '10px', dot: 5, borderRadius: '3px' },
    md: { width: 56, height: 22, fontSize: '11px', dot: 6, borderRadius: '3px' },
    lg: { width: 72, height: 30, fontSize: '13px', dot: 8, borderRadius: '4px' },
  } as const;

  get liveSize() { return TimelineControlsComponent.LIVE_SIZE_MAP[this.liveButtonSize]; }

  get timeFormat(): string { return splitForDisplay(this.dateTimeFormat).timeFormat; }
  get dateFormat(): string { return splitForDisplay(this.dateTimeFormat).dateFormat; }
  get formattedTime(): string { return formatDateTime(this.currentTime, this.timeFormat, this.timezone); }
  get formattedDate(): string { return formatDateTime(this.currentTime, this.dateFormat, this.timezone); }
  get timezoneAbbr(): string | null { return getTimezoneAbbr(this.currentTime, this.timezone); }

  /** Merged labels — defaults overridden by whatever the consumer provides. */
  get l(): Required<TimelineLabels> { return { ...DEFAULT_LABELS, ...this.labels }; }

  resolveRewindActive(multiplier: number): string { return resolveLabel(this.l.rewindActiveTooltip, multiplier); }
  resolveFastForwardActive(multiplier: number): string { return resolveLabel(this.l.fastForwardActiveTooltip, multiplier); }

  ngAfterViewInit(): void {
    const el = this.containerRef?.nativeElement;
    if (!el) return;
    this.ro = new ResizeObserver(([entry]) => {
      this.isNarrow = entry.contentRect.width < 520;
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }
}
