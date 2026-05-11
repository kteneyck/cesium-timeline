// Main component
export { Timeline, type TimelineProps } from './Timeline';
export { TimelineCanvas, type TimelineCanvasHandle, TICK_AREA_HEIGHT } from './components/TimelineCanvas';
export { TimelineControls, type ControlsProps } from './components/TimelineControls';
export { TimelineSVG } from './components/TimelineSVG';

// Re-export core so consumers only need @kteneyck/cesium-timeline-react
export * from '@kteneyck/cesium-timeline-core';
