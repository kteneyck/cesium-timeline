import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  HostListener,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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

const NARROW_BREAKPOINT = 520;

@Component({
  selector: 'ct-timeline-controls',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #container
      [attr.data-layout]="isNarrow ? 'compact' : 'full'"
      [class.ct-narrow]="isNarrow"
      [style.display]="isNarrow ? 'flex' : 'grid'"
      [style.flex-direction]="isNarrow ? 'column' : undefined"
      [style.gap]="isNarrow ? '2px' : undefined"
      [style.grid-template-columns]="isNarrow ? undefined : '1fr auto 1fr'"
      [style.align-items]="isNarrow ? undefined : 'center'"
      [style.padding]="isNarrow ? '4px 12px' : '6px 16px'"
      [style.background-color]="theme.controlBarBackground"
      [style.border-bottom]="'1px solid ' + theme.controlBarBorder"
      [style.font-family]="'system-ui, -apple-system, sans-serif'"
    >
      @if (isNarrow) {
        <!-- Row 1: Datetime · LIVE/speed · swim-lane toggle -->
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;min-width:0">
            <ng-container [ngTemplateOutlet]="dateTimeTpl" />
          </div>
          <ng-container [ngTemplateOutlet]="liveSpeedTpl" />
          <ng-container [ngTemplateOutlet]="swimLaneToggleTpl" />
        </div>

        <!-- Row 2: Transport buttons, spread across the full width -->
        @if (!live) {
          <ng-container [ngTemplateOutlet]="transportTpl" />
        }
      } @else {
        <!-- Left: Datetime + LIVE (if position=left) -->
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <ng-container [ngTemplateOutlet]="dateTimeTpl" />
          @if (liveButtonPosition === 'left') {
            <ng-container [ngTemplateOutlet]="liveSpeedTpl" />
          }
        </div>

        <!-- Center: Transport buttons (empty placeholder in live mode keeps the right column in place) -->
        @if (!live) {
          <ng-container [ngTemplateOutlet]="transportTpl" />
        } @else {
          <div></div>
        }

        <!-- Right: LIVE (if position=right) + swim-lane toggle -->
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px">
          @if (liveButtonPosition === 'right') {
            <ng-container [ngTemplateOutlet]="liveSpeedTpl" />
          }
          <ng-container [ngTemplateOutlet]="swimLaneToggleTpl" />
        </div>
      }
    </div>

    <ng-template #dateTimeTpl>
      <div
        (click)="!live && dateTimeClick.emit()"
        [title]="(!live && dateTimeClick.observed) ? l.dateTimeClickTooltip : ''"
        [style.color]="theme.labelColor"
        [class.ct-datetime-inline]="isNarrow"
        style="font-family:monospace;line-height:1.15;border-radius:4px;padding:2px 4px;transition:background 0.15s"
        [style.cursor]="(!live && dateTimeClick.observed) ? 'pointer' : 'default'"
      >
        @if (timeFormat) {
          <div [style.font-size]="isNarrow ? '1.5em' : '2em'" style="font-weight:bold;letter-spacing:0.02em;white-space:nowrap">
            {{ formattedTime }}
          </div>
        }
        @if (dateFormat) {
          <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
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
    </ng-template>

    <ng-template #liveSpeedTpl>
      @if (showLive || (!isNormalSpeed && !live)) {
        <div style="display:flex;align-items:center;gap:4px">
          @if (showLive) {
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
          }
          @if (!isNormalSpeed && !live) {
            <button
              data-speed-badge
              (click)="toggleSpeedOverlay()"
              [style.color]="theme.buttonActiveColor"
              [style.border-color]="theme.buttonActiveColor + '44'"
              [style.min-width.px]="liveSize.width"
              [style.height.px]="liveSize.height"
              style="background:none;border:1px solid;cursor:pointer;font-size:11px;border-radius:4px;display:flex;align-items:center;justify-content:center;width:auto;padding:0 8px;font-family:system-ui,-apple-system,sans-serif;transition:background-color 0.15s"
              [title]="l.resetSpeedTooltip"
            >{{ isRewinding ? '◀ ' + absMultiplier + '×' : absMultiplier + '× ▶' }}</button>
            @if (speedOverlayOpen && speedOverlayPos) {
              <div
                data-speed-overlay
                [style.background-color]="theme.controlBarBackground"
                [style.border]="'1px solid ' + theme.controlBarBorder"
                [style.color]="theme.labelColor"
                [style.bottom.px]="speedOverlayPos.bottom"
                [style.left.px]="speedOverlayPos.left"
                [style.right.px]="speedOverlayPos.right"
                style="position:fixed;z-index:2147483647;display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:170px;font-family:system-ui,-apple-system,sans-serif"
              >
                <div style="font-size:11px;font-weight:bold;letter-spacing:0.03em">{{ l.speedOverlayTitle }}</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <input
                    type="range"
                    [attr.min]="minSpeed"
                    [attr.max]="maxSpeed"
                    step="1"
                    [value]="absMultiplier"
                    (input)="onSliderChange($event)"
                    [attr.aria-label]="l.speedInputLabel"
                    [style.accent-color]="theme.buttonActiveColor"
                    style="flex:1"
                  />
                  <input
                    type="number"
                    class="ct-speed-input"
                    [value]="speedInputValue"
                    (input)="onSpeedInputChange($event)"
                    (blur)="commitSpeedInput()"
                    (keydown.enter)="commitSpeedInput()"
                    [attr.aria-label]="l.speedInputLabel"
                    [style.border]="'1px solid ' + theme.controlBarBorder"
                    [style.color]="theme.labelColor"
                    style="width:48px;font-size:12px;padding:2px 4px;border-radius:4px;background:transparent;font-family:inherit"
                  />
                </div>
                <button
                  (click)="resetSpeed.emit(); closeSpeedOverlay()"
                  [style.color]="theme.buttonActiveColor"
                  [style.border-color]="theme.buttonActiveColor + '44'"
                  [style.height.px]="liveSize.height"
                  style="align-self:flex-start;background:none;border:1px solid;cursor:pointer;font-size:11px;border-radius:4px;padding:0 10px;font-family:inherit"
                  [title]="l.resetSpeedTitle"
                >{{ l.resetSpeedLabel }}</button>
              </div>
            }
          }
        </div>
      }
    </ng-template>

    <ng-template #transportTpl>
      <div
        class="ct-transport"
        style="display:flex;align-items:center;gap:2px"
        [style.justify-content]="isNarrow ? 'space-evenly' : undefined"
      >
        @if (showJumpToStart !== false) {
          <button
            (click)="hasStartTime && jumpToStart.emit()"
            [disabled]="!hasStartTime"
            [style.color]="theme.buttonColor"
            [style.opacity]="hasStartTime ? 1 : 0.3"
            [style.cursor]="hasStartTime ? 'pointer' : 'default'"
            class="ct-btn"
            [title]="hasStartTime ? l.jumpToStartTooltip : l.noStartTimeTooltip"
          >
            <svg class="ct-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="2" width="1.5" height="12"/>
              <polygon points="9,2.5 4.5,8 9,13.5"/>
              <polygon points="14.5,2.5 10,8 14.5,13.5"/>
            </svg>
          </button>
        }

        <button
          (click)="rewind.emit()"
          [style.color]="isRewinding ? theme.buttonActiveColor : theme.buttonColor"
          [style.border-color]="isRewinding ? theme.buttonActiveColor + '33' : 'transparent'"
          class="ct-btn"
          [title]="isRewinding ? resolveRewindActive(absMultiplier) : l.rewindTooltip"
        >
          <svg class="ct-icon" width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
            <polygon points="8.5,2 1.5,8 8.5,14"/>
            <polygon points="16.5,2 9.5,8 16.5,14"/>
          </svg>
        </button>

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
            <svg class="ct-icon" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
              <polygon points="2,1.5 13,8 2,14.5"/>
            </svg>
          }
        </button>

        <button
          (click)="fastForward.emit()"
          [style.color]="isFastForward ? theme.buttonActiveColor : theme.buttonColor"
          [style.border-color]="isFastForward ? theme.buttonActiveColor + '33' : 'transparent'"
          class="ct-btn"
          [title]="isFastForward ? resolveFastForwardActive(absMultiplier) : l.fastForwardTooltip"
        >
          <svg class="ct-icon" width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
            <polygon points="1.5,2 8.5,8 1.5,14"/>
            <polygon points="9.5,2 16.5,8 9.5,14"/>
          </svg>
        </button>

        @if (showJumpToEnd !== false) {
          <button
            (click)="hasEndTime && jumpToEnd.emit()"
            [disabled]="!hasEndTime"
            [style.color]="theme.buttonColor"
            [style.opacity]="hasEndTime ? 1 : 0.3"
            [style.cursor]="hasEndTime ? 'pointer' : 'default'"
            class="ct-btn"
            [title]="hasEndTime ? l.jumpToEndTooltip : l.noEndTimeTooltip"
          >
            <svg class="ct-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <polygon points="1.5,2.5 6,8 1.5,13.5"/>
              <polygon points="7,2.5 11.5,8 7,13.5"/>
              <rect x="13" y="2" width="1.5" height="12"/>
            </svg>
          </button>
        }
      </div>
    </ng-template>

    <ng-template #swimLaneToggleTpl>
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
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .ct-btn {
      background: none;
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 16px;
      padding: 0;
      margin: 0; /* guard against host-page global button styles */
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
    /* Transport icons — SVG rather than Unicode glyphs (⏮ ◀◀ ▶ ▶▶ ⏭), which render
       as color emoji on iOS and at inconsistent sizes across fonts. A thin stroke in
       the fill color softens the triangle corners. */
    .ct-icon {
      fill: currentColor;
      stroke: currentColor;
      stroke-width: 1;
      stroke-linejoin: round;
    }
    .ct-btn-play {
      font-size: 18px;
      width: 40px;
      min-width: 40px;
      height: 40px;
      border-radius: 50%;
    }
    /* Compact (two-row) layout: time and date share a line; transport buttons are
       wide-but-short tap targets so the stacked bar doesn't eat vertical space. */
    .ct-datetime-inline {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      column-gap: 8px;
      min-width: 0;
    }
    .ct-narrow .ct-transport .ct-btn {
      width: 44px;
      min-width: 44px;
      height: 32px;
    }
    .ct-narrow .ct-transport .ct-btn-play {
      width: 34px;
      min-width: 34px;
      height: 34px;
    }
    .ct-speed-input::-webkit-outer-spin-button,
    .ct-speed-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .ct-speed-input {
      -moz-appearance: textfield;
    }
  `],
})
export class TimelineControlsComponent implements AfterViewInit, OnChanges, OnDestroy {
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
  /** @see TimelineBaseProps.showLive */
  @Input() showLive = true;
  /** @see TimelineBaseProps.live */
  @Input() live = false;
  /** @see TimelineBaseProps.minSpeed */
  @Input() minSpeed = 1;
  /** @see TimelineBaseProps.maxSpeed */
  @Input() maxSpeed = 100;

  @Output() dateTimeClick = new EventEmitter<void>();
  @Output() playPause = new EventEmitter<boolean>();
  @Output() jumpToStart = new EventEmitter<void>();
  @Output() rewind = new EventEmitter<void>();
  @Output() fastForward = new EventEmitter<void>();
  @Output() jumpToEnd = new EventEmitter<void>();
  @Output() jumpToLive = new EventEmitter<void>();
  @Output() resetSpeed = new EventEmitter<void>();
  @Output() setSpeed = new EventEmitter<number>();
  @Output() toggleSwimLanes = new EventEmitter<void>();

  constructor(private cdr: ChangeDetectorRef, private elRef: ElementRef<HTMLElement>) {}

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

  isNarrow = false;
  private ro?: ResizeObserver;

  // ── Playback-speed overlay (slider + input, opened from the speed badge) ──
  speedOverlayOpen = false;
  speedInputValue = '1';
  /** Fixed-position coordinates (viewport-relative) so the overlay escapes any
   *  ancestor's `overflow: hidden` and stacks above other page content (e.g. a
   *  Cesium globe elsewhere on the page). Recomputed on open/resize/scroll. */
  speedOverlayPos: { bottom: number; left?: number; right?: number } | null = null;
  private overlayResizeListener?: () => void;
  private overlayScrollListener?: () => void;

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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['multiplier']) {
      this.speedInputValue = String(Math.abs(this.multiplier));
      if (this.multiplier === 1) this.closeSpeedOverlay();
    }
    if (changes['live'] && this.live) this.closeSpeedOverlay();
  }

  toggleSpeedOverlay(): void {
    if (this.speedOverlayOpen) {
      this.closeSpeedOverlay();
      return;
    }
    this.speedOverlayOpen = true;
    this.updateSpeedOverlayPosition();
    this.overlayResizeListener = () => this.updateSpeedOverlayPosition();
    this.overlayScrollListener = () => this.updateSpeedOverlayPosition();
    window.addEventListener('resize', this.overlayResizeListener);
    window.addEventListener('scroll', this.overlayScrollListener, true);
  }

  closeSpeedOverlay(): void {
    this.speedOverlayOpen = false;
    this.speedOverlayPos = null;
    if (this.overlayResizeListener) window.removeEventListener('resize', this.overlayResizeListener);
    if (this.overlayScrollListener) window.removeEventListener('scroll', this.overlayScrollListener, true);
    this.overlayResizeListener = undefined;
    this.overlayScrollListener = undefined;
  }

  private updateSpeedOverlayPosition(): void {
    const badge = this.elRef.nativeElement.querySelector('[data-speed-badge]');
    if (!badge) return;
    const rect = badge.getBoundingClientRect();
    // In the compact layout the LIVE/speed group always sits on the right edge.
    this.speedOverlayPos = (this.liveButtonPosition === 'right' || this.isNarrow)
      ? { bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right }
      : { bottom: window.innerHeight - rect.top + 6, left: rect.left };
    this.cdr.markForCheck();
  }

  onSliderChange(e: Event): void {
    this.setSpeed.emit(Number((e.target as HTMLInputElement).value));
  }

  onSpeedInputChange(e: Event): void {
    this.speedInputValue = (e.target as HTMLInputElement).value;
  }

  commitSpeedInput(): void {
    const parsed = Math.round(Number(this.speedInputValue));
    if (Number.isFinite(parsed)) {
      this.setSpeed.emit(parsed);
      this.speedInputValue = String(parsed);
    } else {
      this.speedInputValue = String(this.absMultiplier);
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(e: PointerEvent): void {
    if (!this.speedOverlayOpen) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-speed-overlay]') || target.closest('[data-speed-badge]')) return;
    this.speedOverlayOpen = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (!this.speedOverlayOpen) return;
    this.speedOverlayOpen = false;
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    const el = this.containerRef?.nativeElement;
    if (!el) return;
    this.ro = new ResizeObserver(([entry]) => {
      const narrow = entry.contentRect.width < NARROW_BREAKPOINT;
      if (narrow === this.isNarrow) return;
      this.isNarrow = narrow;
      this.cdr.markForCheck();
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    if (this.overlayResizeListener) window.removeEventListener('resize', this.overlayResizeListener);
    if (this.overlayScrollListener) window.removeEventListener('scroll', this.overlayScrollListener, true);
  }
}
