---
"@kteneyck/cesium-timeline-core": patch
"@kteneyck/cesium-timeline-react": patch
"@kteneyck/cesium-timeline-angular": patch
---

Forced live mode (`live`) now blocks every click-driven time change

All interaction-driven needle moves in both canvases go through a single
`commitTime()` choke point that drops the update while `live` is set, so no
mouse, touch or edge-scroll path can move the needle or emit `onTimeChange` /
`timeChange` in live mode. A scrub or range-select that is already in flight is
cancelled when live mode switches on mid-gesture, and a range-select drag in
live mode widens the zoom range instead of clamping the needle into it.

A press in the tick area now needs `RANGE_SELECT_MIN_DRAG_PX` (6 px) of
movement before it counts as a range-selection drag, so small pointer jitter
during a click no longer zooms the timeline.
