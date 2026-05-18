export {
  drawTimeline,
  makeLabel,
  calcEpochMs,
  nextTic,
  twoD,
  resolveItemStyle,
  clampSpan,
  zoomRange,
  zoomAroundMs,
  totalSwimLaneHeight,
  hitTestSwimLane,
  hitTestLaneLabel,
  isInSwimLaneRegion,
} from './CanvasEngine';

export type {
  TimelineRenderState,
  ReorderState,
  SwimLaneHitResult,
} from './CanvasEngine';
