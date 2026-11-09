---
"@kteneyck/cesium-timeline-core": minor
"@kteneyck/cesium-timeline-react": minor
"@kteneyck/cesium-timeline-angular": minor
---

Swim lanes that overflow can be scrolled vertically on touch screens. A single finger on the lanes now waits `TOUCH_AXIS_LOCK_PX` (8 px) before choosing an axis: mostly vertical scrolls the lanes, mostly horizontal scrubs the needle (or pans in live mode), and a tap still moves the needle. Touches outside the lanes, or on lanes that all fit, behave as before. Core adds `maxSwimLaneScroll(lanes, showSwimLanes, canvasH)`.
