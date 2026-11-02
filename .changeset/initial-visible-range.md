---
"@kteneyck/cesium-timeline-core": minor
"@kteneyck/cesium-timeline-react": minor
---

Add `initialVisibleRange` to open the React timeline on a chosen visible window instead of the full startTime/endTime span (clipped to the limits with `restrictToRange`; playhead auto-follow pauses while the playhead is outside it). `Timeline` now forwards a ref exposing a `TimelineHandle` (`zoomTo`, `getVisibleRange`, swim-lane CRUD). Core adds the `VisibleRange` type and `resolveVisibleRange` helper.
