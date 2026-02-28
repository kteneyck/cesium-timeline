import * as Cesium from 'cesium';
import { TickInterval } from './TickInterval';
import { TimelineTheme } from './TimelineTheme';

export interface TimelineProps {
  startTime?: Cesium.JulianDate | Date;
  endTime?: Cesium.JulianDate | Date;
  currentTime?: Cesium.JulianDate | Date;
  clock?: Cesium.Clock;
  onTimeChange?: (time: Cesium.JulianDate) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  onMultiplierChange?: (multiplier: number) => void;
  height?: number;
  tickInterval?: TickInterval | number;
  showLabels?: boolean;
  showControls?: boolean;
  snapToTicks?: boolean;
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
   * Use this to open your own date/time picker (e.g. a PrimeReact Calendar).
   * Once the user selects a time, pass it back via the `jumpToTime` prop.
   */
  onDateTimeClick?: () => void;
  /**
   * Set this to a new Date or JulianDate to programmatically jump the timeline
   * to that moment (pans the canvas and updates current time).
   * Typically set from the result of your own date/time picker.
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
  theme?: Partial<TimelineTheme>;
  className?: string;
}

export interface ControlsProps {
  currentTime: Cesium.JulianDate;
  isPlaying: boolean;
  multiplier: number;
  /** @see TimelineProps.dateTimeFormat */
  dateTimeFormat?: string;
  /** @see TimelineProps.onDateTimeClick */
  onDateTimeClick?: () => void;
  onPlayPause: (isPlaying: boolean) => void;
  onJumpToStart: () => void;
  onRewind: () => void;
  onFastForward: () => void;
  onJumpToEnd: () => void;
  onJumpToLive: () => void;
  onResetSpeed: () => void;
  isLive: boolean;
  /** Whether to show the ⏮ jump-to-start button (true when startTime prop was provided). */
  hasStartTime: boolean;
  /** Whether to show the ⏭ jump-to-end button (true when endTime prop was provided). */
  hasEndTime: boolean;
  theme: TimelineTheme;
}
