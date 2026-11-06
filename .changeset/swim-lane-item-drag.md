---
"@kteneyck/cesium-timeline-core": minor
"@kteneyck/cesium-timeline-react": minor
"@kteneyck/cesium-timeline-angular": minor
---

Swim-lane items can be dragged along their lane. Mark an item `draggable` and handle `onSwimLaneItemDragStart`, `onSwimLaneItemDrag` (return a number to clamp or snap the offset) and `onSwimLaneItemDragEnd` (`cancelled` on Escape or window blur). Items whose `dragWith` names the dragged item move with it. In Angular these are the `swimLaneItemDragStart` / `swimLaneItemDrag` / `swimLaneItemDragEnd` outputs, with the two answers React gets from return values passed as inputs instead: `allowSwimLaneItemDrag` (return `false` to refuse) and `constrainSwimLaneItemDrag` (return the offset to use).

`hitTestSwimLane` now returns the topmost item under the pointer (the last one drawn) instead of the first in the array, so a marker drawn on top of a bar is the one clicked.
