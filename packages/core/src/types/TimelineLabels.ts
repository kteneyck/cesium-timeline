/**
 * All user-facing labels and tooltip strings rendered by the timeline control bar.
 * Every field is optional — provide only the strings you want to override.
 * Unspecified fields fall back to the English defaults in {@link DEFAULT_LABELS}.
 *
 * Dynamic tooltip fields accept either a static string **or** a function that
 * receives the current speed multiplier and returns a string, letting you embed
 * the value in whatever format your language requires.
 *
 * @example
 * ```ts
 * // Minimal French override
 * const frLabels: Partial<TimelineLabels> = {
 *   playTooltip: 'Lecture',
 *   pauseTooltip: 'Pause',
 *   liveTooltip: 'Aller en direct',
 *   liveActiveTooltip: 'En direct',
 * };
 * <Timeline labels={frLabels} />
 * ```
 */
export interface TimelineLabels {
  // ── Datetime display ─────────────────────────────────────────────────────
  /** Tooltip shown on the datetime display when `onDateTimeClick` is wired up. */
  dateTimeClickTooltip: string;

  // ── LIVE button ───────────────────────────────────────────────────────────
  /** Visible text on the LIVE button when the needle is NOT at live time. */
  liveLabel: string;
  /** Visible text on the LIVE button when the needle IS at live time. */
  liveActiveLabel: string;
  /** Tooltip when the needle is NOT at live time. */
  liveTooltip: string;
  /** Tooltip when the needle IS at live time. */
  liveActiveTooltip: string;

  // ── Speed badge ───────────────────────────────────────────────────────────
  /** Tooltip on the speed-reset badge (shown when playback is not 1×). */
  resetSpeedTooltip: string;

  // ── Jump to start / end ───────────────────────────────────────────────────
  /** Tooltip on the ⏮ jump-to-start button when a start time is set. */
  jumpToStartTooltip: string;
  /** Tooltip on the ⏮ jump-to-start button when no start time is set. */
  noStartTimeTooltip: string;
  /** Tooltip on the ⏭ jump-to-end button when an end time is set. */
  jumpToEndTooltip: string;
  /** Tooltip on the ⏭ jump-to-end button when no end time is set. */
  noEndTimeTooltip: string;

  // ── Rewind ────────────────────────────────────────────────────────────────
  /** Tooltip on the ◀◀ rewind button when not currently rewinding. */
  rewindTooltip: string;
  /**
   * Tooltip on the ◀◀ rewind button while actively rewinding.
   * Receives the current absolute multiplier (e.g. `2`, `4`, `8`).
   */
  rewindActiveTooltip: string | ((multiplier: number) => string);

  // ── Play / Pause ──────────────────────────────────────────────────────────
  /** Tooltip on the play button when stopped and not rewinding. */
  playTooltip: string;
  /** Tooltip on the play button when rewinding (clicking will reset to 1× forward). */
  playFromRewindTooltip: string;
  /** Tooltip on the play button when currently playing (will pause on click). */
  pauseTooltip: string;

  // ── Fast forward ──────────────────────────────────────────────────────────
  /** Tooltip on the ▶▶ fast-forward button when at normal speed. */
  fastForwardTooltip: string;
  /**
   * Tooltip on the ▶▶ fast-forward button while fast-forwarding.
   * Receives the current absolute multiplier (e.g. `2`, `4`, `8`).
   */
  fastForwardActiveTooltip: string | ((multiplier: number) => string);

  // ── Swim-lane toggle ──────────────────────────────────────────────────────
  /** Tooltip on the chevron button when swim lanes are currently visible (click will collapse). */
  collapseSwimLanesTooltip: string;
  /** Tooltip on the chevron button when swim lanes are currently hidden (click will expand). */
  expandSwimLanesTooltip: string;

  // ── Canvas tick labels ────────────────────────────────────────────────────
  /**
   * Abbreviated month names used for timeline tick labels (Jan–Dec zoom levels).
   * Provide all 12 entries in calendar order (January first) to translate the
   * month labels shown on the canvas.
   *
   * @example
   * ```ts
   * // French
   * months: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
   *          'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
   * ```
   */
  months: [string, string, string, string, string, string,
           string, string, string, string, string, string];
}

/** Resolves a label field that may be a static string or a multiplier callback. */
export function resolveLabel(
  label: string | ((multiplier: number) => string),
  multiplier: number,
): string {
  return typeof label === 'function' ? label(multiplier) : label;
}

/** English default labels — used as the fallback for any field not overridden. */
export const DEFAULT_LABELS: Required<TimelineLabels> = {
  dateTimeClickTooltip: 'Click to jump to a date/time',

  liveLabel: 'LIVE',
  liveActiveLabel: 'LIVE',
  liveTooltip: 'Jump to live (now)',
  liveActiveTooltip: 'Currently live',

  resetSpeedTooltip: 'Reset to 1× speed',

  jumpToStartTooltip: 'Jump to start',
  noStartTimeTooltip: 'No start time set',
  jumpToEndTooltip: 'Jump to end',
  noEndTimeTooltip: 'No end time set',

  rewindTooltip: 'Rewind',
  rewindActiveTooltip: (n) => `Reverse ${n}× — click to speed up, press play to stop`,

  playTooltip: 'Play',
  playFromRewindTooltip: 'Play (reset to 1×)',
  pauseTooltip: 'Pause',

  fastForwardTooltip: 'Fast forward',
  fastForwardActiveTooltip: (n) => `${n}× speed — click to increase, click again at max to reset`,

  collapseSwimLanesTooltip: 'Collapse swim lanes',
  expandSwimLanesTooltip: 'Expand swim lanes',

  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
