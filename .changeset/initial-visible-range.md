---
"@kteneyck/cesium-timeline-core": minor
"@kteneyck/cesium-timeline-react": minor
"@kteneyck/cesium-timeline-angular": minor
---

Add `initialVisibleRange` to open the timeline (React and Angular) on a chosen visible window instead of the full startTime/endTime span (clipped to the limits with `restrictToRange`; playhead auto-follow pauses while the playhead is outside it). `Timeline` now forwards a ref exposing a `TimelineHandle` (`zoomTo`, `getVisibleRange`, swim-lane CRUD). Angular's `TimelineComponent` gains public `zoomTo` / `getVisibleRange` methods for `@ViewChild` use. Core adds the `VisibleRange` type and `resolveVisibleRange` helper.
