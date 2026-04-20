// ─── Zoom limits ──────────────────────────────────────────────────────────────
/** Minimum visible span: 1 second — prevents sub-ms span / blank canvas. */
export const MIN_SPAN_MS = 1_000;
/** Maximum visible span: ~1 000 years — stays within TIC_SCALES range. */
export const MAX_SPAN_MS = 31_536_000_000_000;

/**
 * Cesium-derived tick scale table (in seconds).
 * Used to pick appropriate major / sub / tiny tick intervals.
 */
export const TIC_SCALES = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5,
  1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 900, 1800,
  3600, 7200, 14400, 21600, 43200, 86400,
  172800, 345600, 604800, 1296000, 2592000,
  5184000, 7776000, 15552000, 31536000,
  63072000, 126144000, 157680000, 315360000,
  630720000, 1261440000, 1576800000, 3153600000,
  6307200000, 12614400000, 15768000000, 31536000000,
];

/** Fixed height in pixels for the tick + label area at the bottom of the canvas. */
export const TICK_AREA_HEIGHT = 36;

/** Gap in pixels between swim lane rows. */
export const LANE_GAP = 1;

/** Left padding in pixels for lane labels. */
export const LABEL_PAD_LEFT = 6;

/** Width in pixels for the thin scrollbar track. */
export const SCROLLBAR_WIDTH = 6;

/** Multiplier applied to wheel deltaY for swim lane vertical scrolling.
 *  Keeps scrolling smooth when the overflow range is small. */
export const SWIM_LANE_SCROLL_SPEED = 0.3;

/** Abbreviated month names used for tick labels. */
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
