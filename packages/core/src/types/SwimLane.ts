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
  /**
   * When true, the item can be dragged left or right along its lane. A press
   * that moves less than a few pixels is still a click. Needs at least one of
   * the `onSwimLaneItemDrag*` callbacks to have any effect.
   */
  draggable?: boolean;
  /**
   * The id of another item in the same lane. While that item is dragged, this
   * one is drawn moved by the same amount — e.g. the keyframe markers sitting
   * on a bar. Dragging this item itself moves it alone.
   */
  dragWith?: string;
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

/** Reported while a draggable item is dragged and when the drag ends. */
export interface SwimLaneDragInfo extends SwimLaneEventInfo {
  /**
   * How far the item has been moved, in milliseconds (positive = later). This
   * is the offset the timeline is drawing, i.e. after any constraint the
   * `onSwimLaneItemDrag` handler returned.
   */
  deltaMs: number;
}

/** Reported once when an item drag finishes. */
export interface SwimLaneDragEndInfo extends SwimLaneDragInfo {
  /**
   * True when the drag was abandoned (Escape, or the window losing focus)
   * rather than dropped. The host should put the item back where it was.
   */
  cancelled: boolean;
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
