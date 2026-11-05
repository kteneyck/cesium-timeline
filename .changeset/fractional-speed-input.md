---
"@kteneyck/cesium-timeline-react": patch
"@kteneyck/cesium-timeline-angular": patch
---

Allow fractional playback speeds below 1× (e.g. 0.25, 0.5) in the speed overlay's number input. Values are no longer rounded to whole numbers; zero, negative, and empty values are rejected and the input reverts to the current speed.
