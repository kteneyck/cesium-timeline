import * as Cesium from 'cesium';
import { TickInterval } from './TickInterval';
import { TimelineTheme } from './TimelineTheme';
import { SwimLane, SwimLaneEventInfo } from './SwimLane';
import { TimelineLabels } from './TimelineLabels';

/**
 * Framework-agnostic base props for the timeline component.
 * Framework wrappers (React, Angular) extend or adapt this interface.
 */
export interface TimelineBaseProps {
  /** The start boundary of the timeline range. Defaults to 12 hours before now. */
  startTime?: Cesium.JulianDate | Date;
  /** The end boundary of the timeline range. Defaults to 12 hours after now. */
  endTime?: Cesium.JulianDate | Date;
  /** Initial current-time position of the needle. Defaults to `startTime` or now. */
  currentTime?: Cesium.JulianDate | Date;
  /** Cesium Clock instance to synchronize with. When provided the timeline follows the clock's tick. */
  clock?: Cesium.Clock;
  /** Fired whenever the current time changes (scrub, playback, or programmatic jump). */
  onTimeChange?: (time: Cesium.JulianDate) => void;
  /** Fired when playback is toggled. Receives the new playing state. */
  onPlayPause?: (isPlaying: boolean) => void;
  /** Fired when the playback speed multiplier changes (fast-forward / rewind). */
  onMultiplierChange?: (multiplier: number) => void;
  /**
   * Explicit height in pixels. When omitted the timeline fills its container
   * (the outer div uses `height: 100%`). When provided, a fixed pixel height
   * is applied instead.
   */
  height?: number;
  /** Tick interval override. When omitted the timeline auto-selects an appropriate scale. */
  tickInterval?: TickInterval | number;
  /** Whether to render tick labels on the time axis. @default true */
  showLabels?: boolean;
  /** Whether to render the transport control bar above the canvas. @default true */
  showControls?: boolean;
  /** Whether to show the ⏮ jump-to-start button in the control bar. @default true */
  showJumpToStart?: boolean;
  /** Whether to show the ⏭ jump-to-end button in the control bar. @default true */
  showJumpToEnd?: boolean;
  /** When `true`, ticks snap to round time boundaries during scrub. */
  snapToTicks?: boolean;
  /** Whether the user can scrub / drag the timeline. @default true */
  enableDrag?: boolean;
  /**
   * Format string for the time display in the control bar.
   * Tokens: YYYY YY MMMM MMM MM M DD D HH H hh h mm ss SSS A a
   * Presets available via the exported `DateTimeFormats` object.
   * @default 'MMM DD YYYY HH:mm:ss'
   */
  dateTimeFormat?: string;
  /**
   * Called when the user clicks the datetime display in the control bar.
   * Use this to open your own date/time picker.
   */
  onDateTimeClick?: () => void;
  /**
   * Set this to a new Date or JulianDate to programmatically jump the timeline
   * to that moment (pans the canvas and updates current time).
   */
  jumpToTime?: Cesium.JulianDate | Date;
  /**
   * Maximum number of major ticks to render on the canvas at one time.
   * When the computed tick count would exceed this value the tick scale is
   * coarsened until it fits. Defaults to unlimited.
   */
  maxTicks?: number;
  /**
   * Speed steps cycled by the fast-forward button.
   * Each click advances to the next entry; the last entry wraps back to the
   * first. Defaults to [2, 4, 8, 16, 32, 1].
   */
  ffSpeeds?: number[];
  /**
   * Absolute-value speed steps cycled by the rewind button (negated internally).
   * Defaults to [1, 2, 4, 8, 16, 32].
   */
  rwSpeeds?: number[];
  /**
   * IANA timezone string used for all datetime display on the timeline.
   * Examples: `'UTC'`, `'America/New_York'`, `'Europe/London'`.
   * Use `'local'` (default) to use the browser's local timezone.
   * When set to a value other than `'local'`, a timezone abbreviation label
   * (e.g. "UTC", "EST", "PDT") is shown to the right of the date display.
   */
  timezone?: string;
  /** Partial theme overrides merged with the default theme. */
  theme?: Partial<TimelineTheme>;
  /**
   * Swim lane definitions. Each lane is a labeled row rendered inside the
   * timeline canvas showing time intervals (bars) and/or instants (markers).
   */
  swimLanes?: SwimLane[];
  /**
   * Whether to show swim lanes. Defaults to `true` when `swimLanes` is provided.
   * When `swimLanes` is provided, a chevron toggle button in the control bar
   * lets the user expand / collapse the lanes at runtime.
   */
  showSwimLanes?: boolean;
  /**
   * Fired when the built-in swim-lane toggle button is clicked.
   * Receives the new visibility value. Use this to keep external state in sync.
   */
  onShowSwimLanesChange?: (visible: boolean) => void;
  /**
   * Transition used when the timeline expands / collapses swim lanes.
   * `'animated'` applies a smooth CSS transition (default).
   * `'instant'` switches height immediately with no animation.
   */
  swimLaneTransition?: 'animated' | 'instant';
  /** Fired when the user clicks a swim lane item. */
  onSwimLaneItemClick?: (info: SwimLaneEventInfo) => void;
  /** Fired when the user hovers over (or leaves) a swim lane item. `null` = left. */
  onSwimLaneItemHover?: (info: SwimLaneEventInfo | null) => void;
  /** Fired when the user double-clicks a swim lane item. */
  onSwimLaneItemDoubleClick?: (info: SwimLaneEventInfo) => void;
  /** Fired when the user right-clicks a swim lane item. */
  onSwimLaneItemContextMenu?: (info: SwimLaneEventInfo) => void;
  /** Fired when swim lanes are reordered via drag. Returns the new ordered lane IDs. */
  onSwimLaneReorder?: (orderedLaneIds: string[]) => void;
  /**
   * Overrides for control-bar labels and tooltips.
   * Useful for localisation or custom verbiage — provide only the strings you
   * want to change; everything else falls back to the English defaults.
   */
  labels?: Partial<TimelineLabels>;
  /**
   * Size of the LIVE button in the control bar.
   * `'sm'` is compact, `'md'` is the default, `'lg'` is prominent.
   * @default 'md'
   */
  liveButtonSize?: 'sm' | 'md' | 'lg';
  /**
   * Which side of the control bar the LIVE button appears on.
   * `'left'` places it beside the datetime display (default).
   * `'right'` moves it to the right side of the control bar.
   * @default 'left'
   */
  liveButtonPosition?: 'left' | 'right';
  /**
   * When `true`, the timeline is locked to live mode.
   * Needle drag, datetime click, play/pause, rewind, fast-forward,
   * jump-to-start, and jump-to-end are all disabled. The LIVE button
   * becomes a non-interactive status indicator. Canvas zoom and pan
   * remain fully interactive.
   */
  live?: boolean;
}

/**
 * Framework-agnostic base props for the transport controls.
 */
export interface ControlsBaseProps {
  /** The current time displayed in the control bar (ms since epoch). */
  currentTimeMs: number;
  /** Whether playback is currently active. */
  isPlaying: boolean;
  /** Current playback speed multiplier (negative = rewind). */
  multiplier: number;
  /** @see TimelineBaseProps.dateTimeFormat */
  dateTimeFormat?: string;
  /** @see TimelineBaseProps.timezone */
  timezone?: string;
  /** @see TimelineBaseProps.onDateTimeClick */
  onDateTimeClick?: () => void;
  /** Toggle play / pause. */
  onPlayPause: (isPlaying: boolean) => void;
  /** Jump to the start of the timeline range. */
  onJumpToStart: () => void;
  /** Step to the next rewind speed. */
  onRewind: () => void;
  /** Step to the next fast-forward speed. */
  onFastForward: () => void;
  /** Jump to the end of the timeline range. */
  onJumpToEnd: () => void;
  /** Jump to the current wall-clock time and resume 1× playback. */
  onJumpToLive: () => void;
  /** Reset the playback speed to 1×. */
  onResetSpeed: () => void;
  /** Whether the needle is near the current wall-clock time (within 2 s). */
  isLive: boolean;
  /** Whether to enable the ⏮ jump-to-start button (true when startTime prop was provided). */
  hasStartTime: boolean;
  /** Whether to enable the ⏭ jump-to-end button (true when endTime prop was provided). */
  hasEndTime: boolean;
  /** Whether to show the ⏮ jump-to-start button at all. @default true */
  showJumpToStart?: boolean;
  /** Whether to show the ⏭ jump-to-end button at all. @default true */
  showJumpToEnd?: boolean;
  /** Resolved theme object applied to control bar elements. */
  theme: TimelineTheme;
  /** Whether swim lanes are currently visible. When defined, the chevron toggle is rendered. */
  swimLanesVisible?: boolean;
  /** Toggle callback for the swim-lane chevron button. */
  onToggleSwimLanes?: () => void;
  /**
   * Overrides for control-bar labels and tooltips.
   * @see TimelineBaseProps.labels
   */
  labels?: Partial<TimelineLabels>;
  /** @see TimelineBaseProps.liveButtonSize */
  liveButtonSize?: 'sm' | 'md' | 'lg';
  /** @see TimelineBaseProps.liveButtonPosition */
  liveButtonPosition?: 'left' | 'right';
}
