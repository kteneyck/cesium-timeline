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
