export {
  drawTimeline,
  makeLabel,
  calcEpochMs,
  nextTic,
  twoD,
  resolveItemStyle,
  clampSpan,
  zoomRange,
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
