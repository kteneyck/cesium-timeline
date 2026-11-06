---
"@kteneyck/cesium-timeline-core": minor
"@kteneyck/cesium-timeline-react": minor
"@kteneyck/cesium-timeline-angular": minor
---

A bar crowded with markers can be grabbed again. `hitTestSwimLane` now lets a marker win over the bar beneath it only when the pointer is on the marker's own shape (not just its column) and the marker can be picked out — its nearest neighbour is at least its size plus `MARKER_PICK_GAP` (4 px) away at the current zoom. Otherwise the press goes to the bar; zoom in to separate the markers and pick one. Markers with no bar under the pointer hit as before, across the lane's full height.
