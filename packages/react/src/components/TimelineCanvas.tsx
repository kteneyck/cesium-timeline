/**
 * TimelineCanvas – React wrapper around the core canvas rendering engine.
 *
 * Architecture (mirrors Cesium's Timeline.js):
 *  - All mutable state (visible range, current time) lives in refs — zero React re-renders.
 *  - draw() is called DIRECTLY (not via RAF) from useLayoutEffect, ResizeObserver and
 *    user interaction. useLayoutEffect guarantees layout is complete before the first draw.
 *  - RAF is used ONLY for the edge-scroll animation loop.
 *  - getBoundingClientRect() is used for canvas dimensions inside draw() — never clientWidth,
 *    which can be stale or zero during the initial render cycle.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type SwimLane,
  type SwimLaneItem,
  type SwimLaneEventInfo,
  type SwimLaneDragInfo,
  type SwimLaneDragEndInfo,
  type ReorderState,
  DEFAULT_LANE_HEIGHT,
  TICK_AREA_HEIGHT,
  LANE_GAP,
  SWIM_LANE_SCROLL_SPEED,
  MIN_SPAN_MS,
  MAX_SPAN_MS,
  drawTimeline,
  hitTestSwimLane as coreHitTestSwimLane,
  hitTestLaneLabel as coreHitTestLaneLabel,
  isInSwimLaneRegion as coreIsInSwimLaneRegion,
  zoomRange,
  zoomAroundMs,
  clampRangeToLimits,
  clampMsToLimits,
} from '@kteneyck/cesium-timeline-core';

// Re-export for consumers
export { TICK_AREA_HEIGHT };

// ─── Public handle ────────────────────────────────────────────────────────────
export interface TimelineCanvasHandle {
  /** Reposition the visible window. Pass `currentMs` to atomically update the needle too (avoids jitter). */
  zoomTo(startMs: number, endMs: number, currentMs?: number): void;
  getVisibleRange(): { startMs: number; endMs: number };
  /** Start a smooth RAF-based follow scroll at the given rate (clock multiplier). */
  startFollow(rate: number): void;
  /** Stop the follow scroll. */
  stopFollow(): void;
  /** Correct accumulated drift while follow scroll is active (called from onTick). */
  correctFollow(currentMs: number): void;
  /** Append a swim lane. */
  appendSwimLane(lane: SwimLane): void;
  /** Update a swim lane by id. */
  updateSwimLane(id: string, updates: Partial<SwimLane>): void;
  /** Remove a swim lane by id. */
  removeSwimLane(id: string): void;
  /** Reorder swim lanes to match the given id order. */
  reorderSwimLanes(orderedIds: string[]): void;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface TimelineCanvasProps {
  currentTime: Cesium.JulianDate;
  defaultStartMs: number;
  defaultEndMs: number;
  theme: TimelineTheme;
  maxTicks?: number;
  /** @see TimelineBaseProps.timezone */
  timezone?: string;
  /** @see TimelineBaseProps.dateTimeFormat */
  dateTimeFormat?: string;
  /** Abbreviated month names for tick labels. Falls back to English when omitted. */
  months?: string[];
  onTimeChange: (time: Cesium.JulianDate) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** When true, needle scrub is disabled (left-click becomes pan). Zoom and pan remain active. */
  disableNeedleDrag?: boolean;
  /** @see TimelineBaseProps.invertScrollZoom */
  invertScrollZoom?: boolean;
  /** @see TimelineBaseProps.restrictToRange */
  restrictToRange?: boolean;
  /** Hard lower bound for the visible window when `restrictToRange` is true. */
  limitStartMs?: number;
  /** Hard upper bound for the visible window when `restrictToRange` is true. */
  limitEndMs?: number;
  onRangeSelect?: (start: Cesium.JulianDate, end: Cesium.JulianDate) => void;
  // Swim lane props
  swimLanes?: SwimLane[];
  showSwimLanes?: boolean;
  onSwimLaneItemClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneItemHover?: (info: SwimLaneEventInfo | null) => void;
  onSwimLaneItemDoubleClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneItemContextMenu?: (info: SwimLaneEventInfo) => void;
  onSwimLaneReorder?: (orderedLaneIds: string[]) => void;
  onSwimLaneItemDragStart?: (info: SwimLaneEventInfo) => boolean | void;
  onSwimLaneItemDrag?: (info: SwimLaneDragInfo) => number | void;
  onSwimLaneItemDragEnd?: (info: SwimLaneDragEndInfo) => void;
}

/** Pixels a press on a draggable item must travel before it is a drag, not a click. */
const ITEM_DRAG_THRESHOLD_PX = 3;

/** A press on a draggable item, and — once it has moved far enough — the drag it became. */
interface ItemDrag {
  lane: SwimLane;
  item: SwimLaneItem;
  /** clientX at the press. */
  anchorClientX: number;
  /** The time under the pointer at the press. */
  anchorMs: number;
  /** The offset being drawn, after the host's constraint. */
  deltaMs: number;
  /** False while it might still be a click. */
  active: boolean;
  lastEvent: MouseEvent;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(
  (props, ref) => {
    const {
      currentTime, defaultStartMs, defaultEndMs,
      theme, maxTicks, timezone, dateTimeFormat, months, onTimeChange, onDragStart, onDragEnd,
      onRangeSelect,
      swimLanes: swimLanesProp, showSwimLanes: showSwimLanesProp,
      onSwimLaneItemClick, onSwimLaneItemHover, onSwimLaneItemDoubleClick,
      onSwimLaneItemContextMenu,
      onSwimLaneReorder,
      onSwimLaneItemDragStart,
      onSwimLaneItemDrag,
      onSwimLaneItemDragEnd,
      disableNeedleDrag,
      invertScrollZoom,
      restrictToRange,
      limitStartMs,
      limitEndMs,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // All mutable rendering state in refs — no React re-renders triggered from here.
    const themeRef          = useRef(theme);
    const maxTicksRef       = useRef(maxTicks);
    const timezoneRef       = useRef(timezone);
    const dateTimeFormatRef = useRef(dateTimeFormat);
    const monthsRef         = useRef(months);
    const startMsRef  = useRef(defaultStartMs);
    const endMsRef    = useRef(defaultEndMs);
    const curMsRef    = useRef(Cesium.JulianDate.toDate(currentTime).getTime());

    // Keep theme/maxTicks refs current
    useEffect(() => { themeRef.current = theme; }, [theme]);
    useEffect(() => { maxTicksRef.current = maxTicks; }, [maxTicks]);
    useEffect(() => { timezoneRef.current = timezone; draw(); }, [timezone]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { dateTimeFormatRef.current = dateTimeFormat; draw(); }, [dateTimeFormat]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { monthsRef.current = months; draw(); }, [months]); // eslint-disable-line react-hooks/exhaustive-deps

    const disableNeedleDragRef = useRef(disableNeedleDrag ?? false);
    useEffect(() => { disableNeedleDragRef.current = disableNeedleDrag ?? false; }, [disableNeedleDrag]);

    const invertScrollZoomRef = useRef(invertScrollZoom ?? false);
    useEffect(() => { invertScrollZoomRef.current = invertScrollZoom ?? false; }, [invertScrollZoom]);

    const restrictToRangeRef = useRef(restrictToRange ?? false);
    useEffect(() => { restrictToRangeRef.current = restrictToRange ?? false; draw(); }, [restrictToRange]); // eslint-disable-line react-hooks/exhaustive-deps
    const limitStartMsRef = useRef(limitStartMs);
    useEffect(() => { limitStartMsRef.current = limitStartMs; draw(); }, [limitStartMs]); // eslint-disable-line react-hooks/exhaustive-deps
    const limitEndMsRef = useRef(limitEndMs);
    useEffect(() => { limitEndMsRef.current = limitEndMs; draw(); }, [limitEndMs]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clamp the visible window (in place) to the configured scroll/zoom limits.
    const clampToLimits = useCallback(() => {
      if (!restrictToRangeRef.current) return;
      const result = clampRangeToLimits(
        startMsRef.current,
        endMsRef.current,
        limitStartMsRef.current,
        limitEndMsRef.current
      );
      startMsRef.current = result.startMs;
      endMsRef.current   = result.endMs;
      // Keep the needle inside the limits too, otherwise follow-scroll walks it
      // off the pinned window and it gets drawn off-canvas.
      curMsRef.current = clampMsToLimits(
        curMsRef.current,
        limitStartMsRef.current,
        limitEndMsRef.current
      );
    }, []);

    // ── Swim lane state (ref-based — no React re-renders) ──────────────────
    const swimLanesRef     = useRef<SwimLane[]>(swimLanesProp ?? []);
    const showSwimLanesRef = useRef(showSwimLanesProp ?? (swimLanesProp != null && swimLanesProp.length > 0));
    const scrollTopRef     = useRef(0);
    // Track which item is currently hovered for cursor + callback
    const hoveredItemRef   = useRef<{ lane: SwimLane; item: SwimLaneItem } | null>(null);
    // Drag-to-reorder state
    const reorderStateRef  = useRef<ReorderState | null>(null);
    // Callback refs (avoids stale closures in event handlers)
    const onSwimLaneItemClickRef      = useRef(onSwimLaneItemClick);
    const onSwimLaneItemHoverRef      = useRef(onSwimLaneItemHover);
    const onSwimLaneItemDoubleClickRef = useRef(onSwimLaneItemDoubleClick);
    const onSwimLaneItemContextMenuRef = useRef(onSwimLaneItemContextMenu);
    const onSwimLaneReorderRef        = useRef(onSwimLaneReorder);

    useEffect(() => { onSwimLaneItemClickRef.current = onSwimLaneItemClick; }, [onSwimLaneItemClick]);
    useEffect(() => { onSwimLaneItemHoverRef.current = onSwimLaneItemHover; }, [onSwimLaneItemHover]);
    useEffect(() => { onSwimLaneItemDoubleClickRef.current = onSwimLaneItemDoubleClick; }, [onSwimLaneItemDoubleClick]);
    useEffect(() => { onSwimLaneItemContextMenuRef.current = onSwimLaneItemContextMenu; }, [onSwimLaneItemContextMenu]);
    useEffect(() => { onSwimLaneReorderRef.current = onSwimLaneReorder; }, [onSwimLaneReorder]);
    const onSwimLaneItemDragStartRef = useRef(onSwimLaneItemDragStart);
    const onSwimLaneItemDragRef      = useRef(onSwimLaneItemDrag);
    const onSwimLaneItemDragEndRef   = useRef(onSwimLaneItemDragEnd);
    useEffect(() => { onSwimLaneItemDragStartRef.current = onSwimLaneItemDragStart; }, [onSwimLaneItemDragStart]);
    useEffect(() => { onSwimLaneItemDragRef.current = onSwimLaneItemDrag; }, [onSwimLaneItemDrag]);
    useEffect(() => { onSwimLaneItemDragEndRef.current = onSwimLaneItemDragEnd; }, [onSwimLaneItemDragEnd]);
    // Item drag-along-the-lane state
    const itemDragRef = useRef<ItemDrag | null>(null);
    /**
     * A dropped item, still drawn at its new place until the host's updated
     * `swimLanes` arrive. Without it the item would flash back to where it
     * started for the frame between the drop and the host's re-render.
     */
    const settlingDragRef = useRef<{ laneId: string; itemId: string; deltaMs: number } | null>(null);
    const settleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Whether `item` can be picked up: it says so, and someone is listening. */
    const canDragItem = useCallback((item: SwimLaneItem) =>
      item.draggable === true && (
        onSwimLaneItemDragStartRef.current != null ||
        onSwimLaneItemDragRef.current != null ||
        onSwimLaneItemDragEndRef.current != null
      ), []);

    // Sync swim lane prop changes into refs
    useEffect(() => {
      swimLanesRef.current = swimLanesProp ?? [];
      settlingDragRef.current = null;
      draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [swimLanesProp]);
    useEffect(() => {
      showSwimLanesRef.current = showSwimLanesProp ?? (swimLanesProp != null && swimLanesProp.length > 0);
      draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSwimLanesProp, swimLanesProp]);

    // Edge-scroll animation
    const edgeRAF = useRef<number | null>(null);

    // Follow-scroll (playback auto-scroll) — RAF-driven like edge-scroll for smooth motion.
    const followRAF      = useRef<number | null>(null);
    const followingRef   = useRef(false);
    const followRateRef  = useRef(0);

    // Mouse state
    const mouseMode    = useRef<'none' | 'scrub' | 'slide' | 'zoom' | 'rangeSelectPending' | 'rangeSelect' | 'itemDragPending' | 'itemDrag'>('none');
    const mouseX       = useRef(0);
    // clientX of the cursor during a scrub drag — used by the edge-scroll RAF
    // to keep the needle pinned to the cursor as the window shifts under it.
    const scrubClientX = useRef(0);
    // Timestamp of last mousedown on a swim lane item — used to distinguish
    // a quick click from a long press / drag release.
    const swimLaneDownTime = useRef(0);

    // Range-selection state
    const rangeAnchorMs  = useRef(0);   // time at mousedown (anchor point)
    const rangeAnchorX   = useRef(0);   // canvas-relative X at mousedown
    const rangeSelectionRef = useRef<{ startMs: number; endMs: number } | null>(null);
    const onRangeSelectRef  = useRef(onRangeSelect);
    useEffect(() => { onRangeSelectRef.current = onRangeSelect; }, [onRangeSelect]);

    // Ghost needle (hover preview)
    const hoverMsRef = useRef<number | null>(null);

    // Touch state
    const touchMode      = useRef<'none' | 'scrub' | 'slide' | 'pinch'>('none');
    const touchX         = useRef(0);
    const pinchDist      = useRef(0);
    // Canvas-relative X of the midpoint between the two pinch fingers (pixels).
    const pinchMidX      = useRef(0);
    // Needle position saved just before a single-finger scrub begins, so it can
    // be restored if a second finger lands and the gesture becomes a pinch-zoom.
    const prePinchCurMs  = useRef(0);

    const getTouchDist = (a: Touch, b: Touch) =>
      Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

    // ── Helper to build the render state from refs ─────────────────────────
    const getRenderState = useCallback(() => ({
      startMs: startMsRef.current,
      endMs: endMsRef.current,
      currentMs: curMsRef.current,
      theme: themeRef.current,
      maxTicks: maxTicksRef.current,
      timezone: timezoneRef.current,
      use12h: /h/.test(dateTimeFormatRef.current ?? ''),
      months: monthsRef.current,
      swimLanes: swimLanesRef.current,
      showSwimLanes: showSwimLanesRef.current,
      scrollTop: scrollTopRef.current,
      reorderState: reorderStateRef.current,
      rangeSelection: rangeSelectionRef.current,
      hoverMs: hoverMsRef.current,
      itemDrag: itemDragRef.current?.active
        ? { laneId: itemDragRef.current.lane.id, itemId: itemDragRef.current.item.id, deltaMs: itemDragRef.current.deltaMs }
        : settlingDragRef.current,
    }), []);

    // ── Imperative handle (called by Timeline parent) ──────────────────────
    useImperativeHandle(ref, () => ({
      zoomTo(startMs: number, endMs: number, currentMs?: number) {
        const span     = Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, endMs - startMs));
        const centerMs = (startMs + endMs) / 2;
        startMsRef.current = centerMs - span / 2;
        endMsRef.current   = centerMs + span / 2;
        clampToLimits();
        if (currentMs !== undefined) curMsRef.current = currentMs;
        draw();
      },
      getVisibleRange() {
        return { startMs: startMsRef.current, endMs: endMsRef.current };
      },
      startFollow(rate: number) {
        followRateRef.current = rate;
        if (followRAF.current !== null) return;   // already running — rate updated above
        followingRef.current = true;
        let lastTime = performance.now();

        const scroll = () => {
          const now = performance.now();
          const dt  = now - lastTime;
          lastTime  = now;

          // Shift window and needle at the clock's speed (ms of sim-time per ms of real-time).
          const shiftMs = dt * followRateRef.current;
          startMsRef.current += shiftMs;
          endMsRef.current   += shiftMs;
          curMsRef.current   += shiftMs;
          clampToLimits();
          draw();
          followRAF.current = requestAnimationFrame(scroll);
        };
        followRAF.current = requestAnimationFrame(scroll);
      },
      stopFollow() {
        followingRef.current = false;
        if (followRAF.current !== null) {
          cancelAnimationFrame(followRAF.current);
          followRAF.current = null;
        }
      },
      correctFollow(currentMs: number) {
        if (!followingRef.current) return;
        const drift = currentMs - curMsRef.current;
        curMsRef.current    = currentMs;
        startMsRef.current += drift;
        endMsRef.current   += drift;
        clampToLimits();
      },
      // ── Swim lane CRUD ──────────────────────────────────────────────
      appendSwimLane(lane: SwimLane) {
        swimLanesRef.current = [...swimLanesRef.current, lane];
        draw();
      },
      updateSwimLane(id: string, updates: Partial<SwimLane>) {
        swimLanesRef.current = swimLanesRef.current.map(l =>
          l.id === id ? { ...l, ...updates, id: l.id } : l
        );
        draw();
      },
      removeSwimLane(id: string) {
        swimLanesRef.current = swimLanesRef.current.filter(l => l.id !== id);
        draw();
      },
      reorderSwimLanes(orderedIds: string[]) {
        const byId = new Map(swimLanesRef.current.map(l => [l.id, l]));
        const reordered: SwimLane[] = [];
        for (const id of orderedIds) {
          const lane = byId.get(id);
          if (lane) reordered.push(lane);
        }
        swimLanesRef.current = reordered;
        draw();
      },
    }));

    // ── Core draw function ────────────────────────────────────────────────
    // Delegates to the core engine's drawTimeline() for all actual rendering.
    const draw = useCallback(() => {
      // Safety net: guarantees the visible window can never be rendered outside
      // the configured limits, regardless of what path put it there (e.g. the
      // needle auto-scroll recenter firing before `restrictToRange` took effect).
      clampToLimits();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Always read fresh layout dimensions from the DOM.
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return;

      // Sync backing-store resolution to CSS size × DPR.
      const dpr   = window.devicePixelRatio || 1;
      const physW = Math.round(w * dpr);
      const physH = Math.round(h * dpr);
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width  = physW;
        canvas.height = physH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Delegate to the core engine
      const clampedScrollTop = drawTimeline(ctx, w, h, getRenderState());

      // Update scroll ref if clamped
      if (clampedScrollTop !== scrollTopRef.current) {
        scrollTopRef.current = clampedScrollTop;
      }

      ctx.restore();
    }, [getRenderState, clampToLimits]);

    // ── Initial draw + resize observer ────────────────────────────────────
    useLayoutEffect(() => {
      draw();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ro = new ResizeObserver(() => draw());
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [draw]);

    // ── Sync current time from React prop ─────────────────────────────────
    useEffect(() => {
      // When follow-scroll is active the RAF loop drives the canvas — skip.
      if (followingRef.current) return;
      const newMs = Cesium.JulianDate.toDate(currentTime).getTime();
      // Skip redundant draw when zoomTo() already set curMsRef to this value.
      if (curMsRef.current === newMs) return;
      curMsRef.current = newMs;
      draw();
    }, [currentTime, draw]);

    // ── Item drag ─────────────────────────────────────────────────────────
    /** Move the dragged item to follow the pointer at `clientX`, as the host allows. */
    const updateItemDrag = useCallback((clientX: number, evt: MouseEvent) => {
      const drag   = itemDragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !drag.active || !canvas) return;
      drag.lastEvent = evt;
      const rect = canvas.getBoundingClientRect();
      const cx   = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ms   = startMsRef.current + (cx / rect.width) * (endMsRef.current - startMsRef.current);
      const raw  = ms - drag.anchorMs;
      const constrained = onSwimLaneItemDragRef.current?.({
        laneId: drag.lane.id, item: drag.item, originalEvent: evt, deltaMs: raw,
      });
      drag.deltaMs = typeof constrained === 'number' && Number.isFinite(constrained) ? constrained : raw;
      draw();
    }, [draw]);

    /** End the item drag, dropped or abandoned, and tell the host which. */
    const finishItemDrag = useCallback((cancelled: boolean) => {
      const drag = itemDragRef.current;
      itemDragRef.current = null;
      if (mouseMode.current === 'itemDrag' || mouseMode.current === 'itemDragPending') {
        mouseMode.current = 'none';
      }
      if (edgeRAF.current !== null) {
        cancelAnimationFrame(edgeRAF.current);
        edgeRAF.current = null;
      }
      if (!drag) return;
      if (drag.active) {
        // The press became a drag, so the click that follows the mouseup is
        // not a click on the item.
        swimLaneDownTime.current = 0;
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
        if (!cancelled && drag.deltaMs !== 0) {
          settlingDragRef.current = { laneId: drag.lane.id, itemId: drag.item.id, deltaMs: drag.deltaMs };
          // A host that declines the move never sends new lanes; give up waiting.
          if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
          settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            if (settlingDragRef.current) { settlingDragRef.current = null; draw(); }
          }, 250);
        }
        onSwimLaneItemDragEndRef.current?.({
          laneId: drag.lane.id, item: drag.item, originalEvent: drag.lastEvent,
          deltaMs: drag.deltaMs, cancelled,
        });
      }
      draw();
    }, [draw]);

    // ── Edge-scroll animation loop ────────────────────────────────────────
    const startEdgeScroll = useCallback((direction: -1 | 1) => {
      if (edgeRAF.current !== null) return;
      const scroll = () => {
        const canvas = canvasRef.current;
        const span   = endMsRef.current - startMsRef.current;
        const shift  = direction * span * 0.01;
        startMsRef.current += shift;
        endMsRef.current   += shift;
        clampToLimits();

        if (mouseMode.current === 'itemDrag') {
          // The window moved under a still pointer: the item keeps up with it.
          const drag = itemDragRef.current;
          if (drag) updateItemDrag(scrubClientX.current, drag.lastEvent);
        } else if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx   = Math.max(0, Math.min(rect.width, scrubClientX.current - rect.left));
          const ms   = startMsRef.current + (cx / rect.width) * (endMsRef.current - startMsRef.current);
          curMsRef.current = ms;
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
        }

        draw();
        edgeRAF.current = requestAnimationFrame(scroll);
      };
      edgeRAF.current = requestAnimationFrame(scroll);
    }, [draw, onTimeChange, clampToLimits, updateItemDrag]);

    const stopEdgeScroll = useCallback(() => {
      if (edgeRAF.current !== null) {
        cancelAnimationFrame(edgeRAF.current);
        edgeRAF.current = null;
      }
    }, []);

    // ── Swim lane hit-testing (delegates to core) ────────────────────────
    const hitTestSwimLane = useCallback((canvasX: number, canvasY: number, canvasW: number, canvasH: number) => {
      return coreHitTestSwimLane(canvasX, canvasY, canvasW, canvasH, getRenderState());
    }, [getRenderState]);

    const isInLaneLabelArea = useCallback((canvasX: number, canvasY: number, canvasH: number): SwimLane | null => {
      return coreHitTestLaneLabel(canvasX, canvasY, canvasH, getRenderState());
    }, [getRenderState]);

    const isInSwimLaneRegion = useCallback((canvasY: number, canvasH: number): boolean => {
      return coreIsInSwimLaneRegion(canvasY, canvasH, getRenderState());
    }, [getRenderState]);

    // ── Mouse handlers ────────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check for reorder drag on lane label
      if (e.button === 0 && onSwimLaneReorderRef.current) {
        const labelLane = isInLaneLabelArea(x, y, rect.height);
        if (labelLane) {
          const lanes = swimLanesRef.current;
          const dragIdx = lanes.findIndex(l => l.id === labelLane.id);
          reorderStateRef.current = {
            dragging: true,
            dragLaneId: labelLane.id,
            dragStartY: e.clientY,
            currentY: e.clientY,
            insertIndex: dragIdx,
          };
          e.currentTarget.style.cursor = 'grabbing';
          return;
        }
      }

      // Fire swim lane item click on mousedown (not on click/mouseup)
      if (e.button === 0 && isInSwimLaneRegion(y, rect.height)) {
        const needleX = ((curMsRef.current - startMsRef.current) / (endMsRef.current - startMsRef.current)) * rect.width;
        const nearNeedle = Math.abs(x - needleX) <= 10;
        if (!nearNeedle) {
          const hit = hitTestSwimLane(x, y, rect.width, rect.height);
          if (hit) {
            swimLaneDownTime.current = performance.now();
            if (canDragItem(hit.item)) {
              // Could be a click or a drag; the first few pixels of movement decide.
              itemDragRef.current = {
                lane: hit.lane,
                item: hit.item,
                anchorClientX: e.clientX,
                anchorMs: startMsRef.current + (x / rect.width) * (endMsRef.current - startMsRef.current),
                deltaMs: 0,
                active: false,
                lastEvent: e.nativeEvent,
              };
              mouseMode.current = 'itemDragPending';
              scrubClientX.current = e.clientX;
            }
            return;
          }
        }
      }

      if (e.button === 0) {
        if (disableNeedleDragRef.current) {
          // In live mode left-click becomes a pan; needle scrub is disabled.
          mouseMode.current = 'slide';
          mouseX.current    = e.clientX;
          e.currentTarget.style.cursor = 'grabbing';
          return;
        }
        const needleX = ((curMsRef.current - startMsRef.current) / (endMsRef.current - startMsRef.current)) * rect.width;
        const nearNeedle = Math.abs(x - needleX) <= 10;
        const inTickArea = y >= rect.height - TICK_AREA_HEIGHT;

        if (!nearNeedle && inTickArea) {
          // Tick area, away from needle — could be a click or range-select drag.
          // Don't commit the needle yet; wait to see if the user drags.
          mouseMode.current    = 'rangeSelectPending';
          rangeAnchorX.current = x;
          rangeAnchorMs.current = startMsRef.current + (x / rect.width) * (endMsRef.current - startMsRef.current);
          e.currentTarget.style.cursor = 'crosshair';
          onDragStart?.();
        } else {
          mouseMode.current  = 'scrub';
          scrubClientX.current = e.clientX;
          e.currentTarget.style.cursor = 'grabbing';
          onDragStart?.();
          const ms   = startMsRef.current + (x / rect.width) * (endMsRef.current - startMsRef.current);
          curMsRef.current = ms;
          draw();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
        }
      } else if (e.button === 1) {
        mouseMode.current = 'slide';
        mouseX.current    = e.clientX;
      } else if (e.button === 2) {
        if (onSwimLaneItemContextMenuRef.current && isInSwimLaneRegion(y, rect.height)) {
          return;
        }
        mouseMode.current = 'zoom';
        mouseX.current    = e.clientX;
      }
    }, [draw, onTimeChange, onDragStart, isInLaneLabelArea, isInSwimLaneRegion, hitTestSwimLane, canDragItem]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        // ── Reorder drag ────────────────────────────────────────────
        const rs = reorderStateRef.current;
        if (rs && rs.dragging) {
          rs.currentY = e.clientY;
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const canvasY = e.clientY - rect.top;
            const scrollTop = scrollTopRef.current;
            let y = -scrollTop;
            const lanes = swimLanesRef.current;
            let idx = lanes.length;
            for (let i = 0; i < lanes.length; i++) {
              const laneH = lanes[i].height ?? DEFAULT_LANE_HEIGHT;
              const mid = y + laneH / 2;
              if (canvasY < mid) { idx = i; break; }
              y += laneH + LANE_GAP;
            }
            rs.insertIndex = idx;
          }
          draw();
          return;
        }

        if (mouseMode.current === 'none') return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const w    = rect.width;

        // ── Item drag ───────────────────────────────────────────────
        if (mouseMode.current === 'itemDragPending') {
          const drag = itemDragRef.current;
          if (!drag) { mouseMode.current = 'none'; return; }
          if (Math.abs(e.clientX - drag.anchorClientX) < ITEM_DRAG_THRESHOLD_PX) return;
          const accepted = onSwimLaneItemDragStartRef.current?.({ laneId: drag.lane.id, item: drag.item, originalEvent: e });
          if (accepted === false) {
            itemDragRef.current = null;
            mouseMode.current = 'none';
            return;
          }
          drag.active = true;
          mouseMode.current = 'itemDrag';
          canvas.style.cursor = 'grabbing';
        }
        if (mouseMode.current === 'itemDrag') {
          scrubClientX.current = e.clientX;
          const x    = e.clientX - rect.left;
          const edge = w * 0.08;
          if (x < edge) startEdgeScroll(-1);
          else if (x > w - edge) startEdgeScroll(1);
          else stopEdgeScroll();
          updateItemDrag(e.clientX, e);
          return;
        }

        if (mouseMode.current === 'scrub') {
          scrubClientX.current = e.clientX;
          const x    = e.clientX - rect.left;
          const edge = w * 0.08;
          if (x < edge) {
            startEdgeScroll(-1);
          } else if (x > w - edge) {
            startEdgeScroll(1);
          } else {
            stopEdgeScroll();
          }
          const cx = Math.max(0, Math.min(w, x));
          const ms = startMsRef.current + (cx / w) * (endMsRef.current - startMsRef.current);
          curMsRef.current = ms;
          draw();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
        } else if (mouseMode.current === 'rangeSelectPending' || mouseMode.current === 'rangeSelect') {
          const x = e.clientX - rect.left;
          const dx = Math.abs(x - rangeAnchorX.current);
          if (mouseMode.current === 'rangeSelectPending' && dx >= 3) {
            mouseMode.current = 'rangeSelect';
          }
          if (mouseMode.current === 'rangeSelect') {
            const cx = Math.max(0, Math.min(w, x));
            const curMs = startMsRef.current + (cx / w) * (endMsRef.current - startMsRef.current);
            rangeSelectionRef.current = {
              startMs: rangeAnchorMs.current,
              endMs: curMs,
            };
            draw();
          }
        } else if (mouseMode.current === 'slide') {
          const dx = mouseX.current - e.clientX;
          mouseX.current = e.clientX;
          if (dx !== 0) {
            const shift = (dx / w) * (endMsRef.current - startMsRef.current);
            startMsRef.current += shift;
            endMsRef.current   += shift;
            clampToLimits();
            draw();
          }
        } else if (mouseMode.current === 'zoom') {
          const dx = mouseX.current - e.clientX;
          mouseX.current = e.clientX;
          if (dx !== 0) zoomFrom(Math.pow(1.01, dx));
        }
      };

      const onMouseUp = () => {
        // ── Finish reorder drag ────────────────────────────────────
        const rs = reorderStateRef.current;
        if (rs && rs.dragging) {
          const dragDistance = Math.abs(rs.currentY - rs.dragStartY);
          const lanes = swimLanesRef.current;
          const dragIdx = lanes.findIndex(l => l.id === rs.dragLaneId);
          if (dragDistance > 5 && dragIdx >= 0 && rs.insertIndex !== dragIdx && rs.insertIndex !== dragIdx + 1) {
            const newLanes = [...lanes];
            const [removed] = newLanes.splice(dragIdx, 1);
            const insertAt = rs.insertIndex > dragIdx ? rs.insertIndex - 1 : rs.insertIndex;
            newLanes.splice(insertAt, 0, removed);
            swimLanesRef.current = newLanes;
            onSwimLaneReorderRef.current?.(newLanes.map(l => l.id));
          }
          reorderStateRef.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          draw();
          return;
        }

        stopEdgeScroll();

        if (mouseMode.current === 'itemDrag' || mouseMode.current === 'itemDragPending') {
          // A pending press never moved: it was a click, which handleClick reports.
          finishItemDrag(false);
          return;
        }

        if (mouseMode.current === 'rangeSelectPending') {
          // Short click — move needle to anchor position
          curMsRef.current = rangeAnchorMs.current;
          rangeSelectionRef.current = null;
          mouseMode.current = 'none';
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          draw();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(rangeAnchorMs.current)));
          onDragEnd?.();
          return;
        }

        if (mouseMode.current === 'rangeSelect') {
          const sel = rangeSelectionRef.current;
          rangeSelectionRef.current = null;
          if (sel) {
            const selStart = Math.min(sel.startMs, sel.endMs);
            const selEnd   = Math.max(sel.startMs, sel.endMs);
            startMsRef.current = selStart;
            endMsRef.current   = selEnd;
            clampToLimits();
            // If the needle is outside the selected range, clamp it to the nearest
            // edge so the clock-tick auto-scroll doesn't immediately override the zoom.
            const clampedMs = Math.max(startMsRef.current, Math.min(endMsRef.current, curMsRef.current));
            if (clampedMs !== curMsRef.current) {
              curMsRef.current = clampedMs;
              onTimeChange(Cesium.JulianDate.fromDate(new Date(clampedMs)));
            }
            const startJd = Cesium.JulianDate.fromDate(new Date(selStart));
            const endJd   = Cesium.JulianDate.fromDate(new Date(selEnd));
            onRangeSelectRef.current?.(startJd, endJd);
          }
          mouseMode.current = 'none';
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          draw();
          onDragEnd?.();
          return;
        }

        mouseMode.current = 'none';
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
        onDragEnd?.();
      };

      // Escape, or the window losing focus mid-drag, abandons an item drag.
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && mouseMode.current === 'itemDrag') {
          e.preventDefault();
          finishItemDrag(true);
        }
      };
      const onBlur = () => {
        if (mouseMode.current === 'itemDrag' || mouseMode.current === 'itemDragPending') finishItemDrag(true);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
      document.addEventListener('keydown',   onKeyDown);
      window.addEventListener('blur',        onBlur);
      return () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
        document.removeEventListener('keydown',   onKeyDown);
        window.removeEventListener('blur',        onBlur);
      };
    }, [draw, onTimeChange, onDragEnd, startEdgeScroll, stopEdgeScroll, clampToLimits, updateItemDrag, finishItemDrag]);

    // Zoom around center (uses core zoomRange)
    const zoomFrom = useCallback((amount: number) => {
      const result = zoomRange(startMsRef.current, endMsRef.current, amount);
      startMsRef.current = result.startMs;
      endMsRef.current   = result.endMs;
      clampToLimits();
      draw();
    }, [draw, clampToLimits]);

    const handleWheel = useCallback((e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;

      // Vertical scroll in swim lane region — only when lanes overflow.
      const _showLanes = showSwimLanesRef.current;
      const _lanes     = swimLanesRef.current;
      if (_showLanes && _lanes.length > 0) {
        const laneRegionH = Math.max(0, rect.height - TICK_AREA_HEIGHT);
        if (y >= 0 && y < laneRegionH) {
          let totalH = 0;
          for (const l of _lanes) totalH += (l.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
          const maxScroll = Math.max(0, totalH - laneRegionH);
          if (maxScroll > 0) {
            scrollTopRef.current = Math.max(0, Math.min(maxScroll, scrollTopRef.current + e.deltaY * SWIM_LANE_SCROLL_SPEED));
            draw();
            return;
          }
        }
      }

      zoomFrom(Math.pow(1.05, e.deltaY > 0 === invertScrollZoomRef.current ? -1 : 1));
    }, [zoomFrom, draw]);

    // Attach wheel as a non-passive native listener so preventDefault works
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    // ── Touch handlers (non-passive so preventDefault suppresses native scroll/zoom) ──
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();

        if (e.touches.length === 1) {
          const x  = e.touches[0].clientX - rect.left;
          const cx = Math.max(0, Math.min(rect.width, x));
          const ms = startMsRef.current + (cx / rect.width) * (endMsRef.current - startMsRef.current);
          prePinchCurMs.current = curMsRef.current;
          if (disableNeedleDragRef.current) {
            // In live mode single-finger becomes a pan, not a scrub.
            touchMode.current = 'slide';
            touchX.current    = e.touches[0].clientX;
          } else {
            touchMode.current    = 'scrub';
            touchX.current       = e.touches[0].clientX;
            scrubClientX.current = e.touches[0].clientX;
            curMsRef.current     = ms;
            draw();
            onDragStart?.();
            onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
          }
        } else if (e.touches.length >= 2) {
          // If we were scrubbing, undo the needle move — pinch-zoom should not
          // change the current time.
          if (touchMode.current === 'scrub') {
            curMsRef.current = prePinchCurMs.current;
            draw();
            onTimeChange(Cesium.JulianDate.fromDate(new Date(prePinchCurMs.current)));
          }
          touchMode.current = 'pinch';
          pinchDist.current = getTouchDist(e.touches[0], e.touches[1]);
          pinchMidX.current = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();

        if (touchMode.current === 'scrub' && e.touches.length >= 1) {
          const x    = e.touches[0].clientX - rect.left;
          const edge = rect.width * 0.08;

          scrubClientX.current = e.touches[0].clientX;

          if (x < edge)                   startEdgeScroll(-1);
          else if (x > rect.width - edge)  startEdgeScroll(1);
          else {
            stopEdgeScroll();
            const cx = Math.max(0, Math.min(rect.width, x));
            const ms = startMsRef.current + (cx / rect.width) * (endMsRef.current - startMsRef.current);
            curMsRef.current = ms;
            draw();
            onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
          }

        } else if (touchMode.current === 'slide' && e.touches.length >= 1) {
          const dx = touchX.current - e.touches[0].clientX;
          touchX.current = e.touches[0].clientX;
          if (dx !== 0) {
            const shift = (dx / rect.width) * (endMsRef.current - startMsRef.current);
            startMsRef.current += shift;
            endMsRef.current   += shift;
            clampToLimits();
            draw();
          }

        } else if (touchMode.current === 'pinch' && e.touches.length >= 2) {
          const newDist = getTouchDist(e.touches[0], e.touches[1]);
          const newMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          if (newDist > 0 && pinchDist.current > 0) {
            const pivotMs = startMsRef.current + (pinchMidX.current / rect.width) * (endMsRef.current - startMsRef.current);
            const result  = zoomAroundMs(startMsRef.current, endMsRef.current, pinchDist.current / newDist, pivotMs);
            startMsRef.current = result.startMs;
            endMsRef.current   = result.endMs;
            clampToLimits();
            draw();
          }
          pinchDist.current = newDist;
          pinchMidX.current = newMidX;
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        stopEdgeScroll();
        if (touchMode.current === 'scrub') onDragEnd?.();

        if (e.touches.length === 0) {
          touchMode.current = 'none';
        } else if (e.touches.length === 1) {
          touchMode.current = 'slide';
          touchX.current    = e.touches[0].clientX;
        }
      };

      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
      canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
      return () => {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove',  onTouchMove);
        canvas.removeEventListener('touchend',   onTouchEnd);
      };
    }, [draw, onDragStart, onDragEnd, onTimeChange, zoomFrom, startEdgeScroll, stopEdgeScroll, clampToLimits]);

    // Show grab cursor only when hovering near the needle.
    const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect   = e.currentTarget.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const y      = e.clientY - rect.top;

      // Update ghost needle position (always track cursor while idle)
      if (mouseMode.current === 'none') {
        if (!disableNeedleDragRef.current) {
          const newHoverMs = startMsRef.current + (Math.max(0, Math.min(rect.width, x)) / rect.width) * (endMsRef.current - startMsRef.current);
          if (hoverMsRef.current !== newHoverMs) {
            hoverMsRef.current = newHoverMs;
            // draw() will be called below (cursor logic path) or explicitly here
          }
        } else if (hoverMsRef.current !== null) {
          hoverMsRef.current = null;
        }
      }

      if (mouseMode.current !== 'none') {
        hoverMsRef.current = null;
        return;
      }

      const needleX = ((curMsRef.current - startMsRef.current) / (endMsRef.current - startMsRef.current)) * rect.width;
      const nearNeedle = !disableNeedleDragRef.current && Math.abs(x - needleX) <= 10;

      if (isInSwimLaneRegion(y, rect.height)) {
        const hit = hitTestSwimLane(x, y, rect.width, rect.height);
        const prev = hoveredItemRef.current;
        if (hit) {
          e.currentTarget.style.cursor = nearNeedle || canDragItem(hit.item) ? 'grab' : 'pointer';
          if (!prev || prev.item.id !== hit.item.id || prev.lane.id !== hit.lane.id) {
            hoveredItemRef.current = hit;
            onSwimLaneItemHoverRef.current?.({ laneId: hit.lane.id, item: hit.item, originalEvent: e.nativeEvent });
          }
        } else {
          if (prev) {
            hoveredItemRef.current = null;
            onSwimLaneItemHoverRef.current?.(null);
          }
          if (nearNeedle) {
            e.currentTarget.style.cursor = 'grab';
          } else {
            const labelLane = isInLaneLabelArea(x, y, rect.height);
            if (labelLane && onSwimLaneReorderRef.current) {
              e.currentTarget.style.cursor = 'grab';
            } else if (disableNeedleDragRef.current) {
              // Live mode: empty lane area can still be grabbed to pan the timeline.
              e.currentTarget.style.cursor = 'grab';
            } else {
              e.currentTarget.style.cursor = 'default';
            }
          }
        }
        draw();
        return;
      }

      if (hoveredItemRef.current) {
        hoveredItemRef.current = null;
        onSwimLaneItemHoverRef.current?.(null);
      }

      if (nearNeedle) {
        e.currentTarget.style.cursor = 'grab';
      } else if (!disableNeedleDragRef.current && y >= rect.height - TICK_AREA_HEIGHT) {
        e.currentTarget.style.cursor = 'crosshair';
      } else if (disableNeedleDragRef.current) {
        // Live mode: needle can't be dragged, but the timeline can still be panned.
        e.currentTarget.style.cursor = 'grab';
      } else {
        e.currentTarget.style.cursor = 'default';
      }
      draw();
    }, [draw, hitTestSwimLane, isInSwimLaneRegion, isInLaneLabelArea, canDragItem]);

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const elapsed = performance.now() - swimLaneDownTime.current;
      if (elapsed > 300) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestSwimLane(x, y, rect.width, rect.height);
      if (hit) {
        onSwimLaneItemClickRef.current?.({ laneId: hit.lane.id, item: hit.item, originalEvent: e.nativeEvent });
      }
    }, [hitTestSwimLane]);

    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestSwimLane(x, y, rect.width, rect.height);
      if (hit) {
        onSwimLaneItemDoubleClickRef.current?.({ laneId: hit.lane.id, item: hit.item, originalEvent: e.nativeEvent });
      }
    }, [hitTestSwimLane]);

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestSwimLane(x, y, rect.width, rect.height);
      if (hit && onSwimLaneItemContextMenuRef.current) {
        e.preventDefault();
        onSwimLaneItemContextMenuRef.current({ laneId: hit.lane.id, item: hit.item, originalEvent: e.nativeEvent });
      } else {
        e.preventDefault();
      }
    }, [hitTestSwimLane]);

    // Cleanup RAFs on unmount
    useEffect(() => () => {
      // Unmounting mid-drag must not leave the host holding a preview.
      if (itemDragRef.current?.active) finishItemDrag(true);
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
      if (edgeRAF.current !== null) cancelAnimationFrame(edgeRAF.current);
      if (followRAF.current !== null) cancelAnimationFrame(followRAF.current);
    }, [finishItemDrag]);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', flex: 1, minHeight: 0, display: 'block', cursor: 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          if (hoveredItemRef.current) { hoveredItemRef.current = null; onSwimLaneItemHoverRef.current?.(null); }
          hoverMsRef.current = null;
          if (mouseMode.current === 'none' && canvasRef.current) canvasRef.current.style.cursor = 'default';
          draw();
        }}
        onContextMenu={handleContextMenu}
      />
    );
  }
);

TimelineCanvas.displayName = 'TimelineCanvas';
