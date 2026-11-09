export {
  drawTimeline,
  makeLabel,
  calcEpochMs,
  nextTic,
  twoD,
  resolveItemStyle,
  clampSpan,
  clampRangeToLimits,
  clampMsToLimits,
  resolveVisibleRange,
  zoomRange,
  zoomAroundMs,
  totalSwimLaneHeight,
  maxSwimLaneScroll,
  hitTestSwimLane,
  MARKER_PICK_GAP,
  hitTestLaneLabel,
  isInSwimLaneRegion,
  itemDragOffsetMs,
} from './CanvasEngine';

export type {
  TimelineRenderState,
  ReorderState,
  ItemDragState,
  SwimLaneHitResult,
} from './CanvasEngine';
