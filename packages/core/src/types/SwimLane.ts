import * as Cesium from 'cesium';

// ── Item-level style ──────────────────────────────────────────────────────────

export interface SwimLaneItemStyle {
  /** Fill color for interval bars / instant markers. */
  color: string;
  /** Border color for interval bars. */
  borderColor: string;
  /** Border width in pixels. */
  borderWidth: number;
  /** Opacity (0–1). */
  opacity: number;
  /** Shape used to render instants. */
  markerShape: 'diamond' | 'circle' | 'line';
  /** Size in pixels for instant markers. */
  markerSize: number;
}

// ── Lane-level style (extends item defaults) ──────────────────────────────────

export interface SwimLaneStyle extends SwimLaneItemStyle {
  /** Color of the lane label text. */
  labelColor: string;
  /** Background color of the lane row. */
  backgroundColor: string;
}

// ── Swim lane item ────────────────────────────────────────────────────────────

export interface SwimLaneItem {
  id: string;
  /** Provide a TimeInterval for a range (bar). */
  interval?: Cesium.TimeInterval;
  /** Provide a JulianDate for a point-in-time (marker). */
  instant?: Cesium.JulianDate;
  /** Per-item style overrides. */
  style?: Partial<SwimLaneItemStyle>;
  /** Arbitrary user data attached to this item. */
  data?: unknown;
}

// ── Swim lane ─────────────────────────────────────────────────────────────────

export interface SwimLane {
  id: string;
  label: string;
  items: SwimLaneItem[];
  /** Lane-level default style applied to all items unless overridden per-item. */
  style?: Partial<SwimLaneStyle>;
  /** Height of this lane row in pixels. @default 24 */
  height?: number;
}

// ── Event info ────────────────────────────────────────────────────────────────

export interface SwimLaneEventInfo {
  laneId: string;
  item: SwimLaneItem;
  originalEvent: MouseEvent;
}

// ── Default swim lane style ───────────────────────────────────────────────────

export const defaultSwimLaneStyle: SwimLaneStyle = {
  color: '#4da6ff',
  borderColor: '#2980b9',
  borderWidth: 1,
  opacity: 0.8,
  markerShape: 'diamond',
  markerSize: 10,
  labelColor: '#cccccc',
  backgroundColor: 'transparent',
};

export const DEFAULT_LANE_HEIGHT = 24;
