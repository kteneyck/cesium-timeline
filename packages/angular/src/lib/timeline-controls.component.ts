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

        @if (liveButtonPosition === 'left' && (showLive || (!isNormalSpeed && !live))) {
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
                      [attr.min]="minSpeed"
                      [attr.max]="maxSpeed"
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
            class="ct-btn"
            [title]="isRewinding ? resolveRewindActive(absMultiplier) : l.rewindTooltip"
          >◀◀</button>
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
          >▶▶</button>
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
          @if (liveButtonPosition === 'right' && (showLive || (!isNormalSpeed && !live))) {
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
                        [attr.min]="minSpeed"
                        [attr.max]="maxSpeed"
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
    .ct-btn-wide {
      width: auto;
      padding: 0 6px;
    }
    .ct-btn-play {
      font-size: 18px;
      width: 40px;
      min-width: 40px;
      height: 40px;
      border-radius: 50%;
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
    this.speedOverlayPos = this.liveButtonPosition === 'right'
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
    if (Number.isFinite(parsed)) this.setSpeed.emit(parsed);
    else this.speedInputValue = String(this.absMultiplier);
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
      this.isNarrow = entry.contentRect.width < 520;
    });
    this.ro.observe(el);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    if (this.overlayResizeListener) window.removeEventListener('resize', this.overlayResizeListener);
    if (this.overlayScrollListener) window.removeEventListener('scroll', this.overlayScrollListener, true);
  }
}
