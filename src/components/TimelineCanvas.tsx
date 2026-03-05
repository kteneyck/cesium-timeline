/**
 * TimelineCanvas – canvas-based timeline renderer.
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
import { TimelineTheme } from '../types';
import {
  SwimLane,
  SwimLaneItem,
  SwimLaneEventInfo,
  SwimLaneItemStyle,
  defaultSwimLaneStyle,
  DEFAULT_LANE_HEIGHT,
} from '../types/SwimLane';

// ─── Zoom limits ──────────────────────────────────────────────────────────────
const MIN_SPAN_MS = 1_000;                // 1 second — prevents sub-ms span / blank canvas
const MAX_SPAN_MS = 31_536_000_000_000;  // ~1 000 years — stays within TIC_SCALES range

const TIC_SCALES = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5,
  1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 900, 1800,
  3600, 7200, 14400, 21600, 43200, 86400,
  172800, 345600, 604800, 1296000, 2592000,
  5184000, 7776000, 15552000, 31536000,
  63072000, 126144000, 157680000, 315360000,
  630720000, 1261440000, 1576800000, 3153600000,
  6307200000, 12614400000, 15768000000, 31536000000,
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function twoD(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function makeLabel(ms: number, durationSec: number): string {
  const d  = new Date(ms);
  const y  = d.getFullYear();
  const mo = d.getMonth();
  const dy = d.getDate();
  const h  = d.getHours();
  const mi = d.getMinutes();
  const s  = d.getSeconds();
  const ms2 = d.getMilliseconds();
  if (durationSec > 315360000) return `${y}`;
  if (durationSec > 31536000)  return `${MONTHS[mo]} ${y}`;
  if (durationSec > 604800)    return `${MONTHS[mo]} ${dy}`;
  if (durationSec > 86400)     return `${MONTHS[mo]} ${dy} ${twoD(h)}:${twoD(mi)}`;
  if (durationSec > 3600)      return `${twoD(h)}:${twoD(mi)}`;
  if (durationSec > 60)        return `${twoD(h)}:${twoD(mi)}:${twoD(s)}`;
  const msStr = ms2 > 0 ? `.${String(ms2).padStart(3, '0')}` : '';
  return `${twoD(h)}:${twoD(mi)}:${twoD(s)}${msStr}`;
}

// Pick a round epoch near startMs so tick offsets are clean integers (mirrors Cesium).
function calcEpochMs(startMs: number, durationSec: number): number {
  const d  = new Date(startMs);
  const y  = d.getFullYear();
  const mo = d.getMonth();
  const dy = d.getDate();
  if (durationSec > 315360000) return new Date(Math.floor(y / 100) * 100, 0).getTime();
  if (durationSec > 31536000)  return new Date(Math.floor(y / 10)  * 10,  0).getTime();
  if (durationSec > 86400)     return new Date(y, 0).getTime();
  return new Date(y, mo, dy).getTime();
}

// Advance to next tick boundary (identical to Cesium's getNextTic).
function nextTic(t: number, scale: number): number {
  return Math.ceil(t / scale + 0.5) * scale;
}

// Resolve the effective style for a swim lane item (defaults → lane → item).
function resolveItemStyle(lane: SwimLane, item: SwimLaneItem): SwimLaneItemStyle {
  return {
    color:       item.style?.color       ?? lane.style?.color       ?? defaultSwimLaneStyle.color,
    borderColor: item.style?.borderColor ?? lane.style?.borderColor ?? defaultSwimLaneStyle.borderColor,
    borderWidth: item.style?.borderWidth ?? lane.style?.borderWidth ?? defaultSwimLaneStyle.borderWidth,
    opacity:     item.style?.opacity     ?? lane.style?.opacity     ?? defaultSwimLaneStyle.opacity,
    markerShape: item.style?.markerShape ?? lane.style?.markerShape ?? defaultSwimLaneStyle.markerShape,
    markerSize:  item.style?.markerSize  ?? lane.style?.markerSize  ?? defaultSwimLaneStyle.markerSize,
  };
}

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
  height: number;
  theme: TimelineTheme;
  maxTicks?: number;
  onTimeChange: (time: Cesium.JulianDate) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  // Swim lane props
  swimLanes?: SwimLane[];
  showSwimLanes?: boolean;
  onSwimLaneItemClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneItemHover?: (info: SwimLaneEventInfo | null) => void;
  onSwimLaneItemDoubleClick?: (info: SwimLaneEventInfo) => void;
  onSwimLaneReorder?: (orderedLaneIds: string[]) => void;
}

// ─── Tick area constants ──────────────────────────────────────────────────────
const TICK_AREA_HEIGHT = 36; // fixed height for ticks + labels at the bottom
const LANE_GAP = 1;          // 1px gap between swim lane rows
const LABEL_PAD_LEFT = 6;   // left padding for lane labels
const SCROLLBAR_WIDTH = 6;  // thin scrollbar track width

// ─── Component ────────────────────────────────────────────────────────────────
export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(
  (props, ref) => {
    const {
      currentTime, defaultStartMs, defaultEndMs,
      height, theme, maxTicks, onTimeChange, onDragStart, onDragEnd,
      swimLanes: swimLanesProp, showSwimLanes: showSwimLanesProp,
      onSwimLaneItemClick, onSwimLaneItemHover, onSwimLaneItemDoubleClick,
      onSwimLaneReorder,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // All mutable rendering state in refs — no React re-renders triggered from here.
    const themeRef    = useRef(theme);
    const maxTicksRef = useRef(maxTicks);
    const startMsRef  = useRef(defaultStartMs);
    const endMsRef    = useRef(defaultEndMs);
    const curMsRef    = useRef(Cesium.JulianDate.toDate(currentTime).getTime());

    // Keep theme/maxTicks refs current
    useEffect(() => { themeRef.current = theme; }, [theme]);
    useEffect(() => { maxTicksRef.current = maxTicks; }, [maxTicks]);

    // ── Swim lane state (ref-based — no React re-renders) ──────────────────
    const swimLanesRef     = useRef<SwimLane[]>(swimLanesProp ?? []);
    const showSwimLanesRef = useRef(showSwimLanesProp ?? (swimLanesProp != null && swimLanesProp.length > 0));
    const scrollTopRef     = useRef(0);
    // Track which item is currently hovered for cursor + callback
    const hoveredItemRef   = useRef<{ lane: SwimLane; item: SwimLaneItem } | null>(null);
    // Drag-to-reorder state
    const reorderState     = useRef<{
      dragging: boolean;
      dragLaneId: string;
      dragStartY: number;
      currentY: number;
      insertIndex: number;
    } | null>(null);
    // Callback refs (avoids stale closures in event handlers)
    const onSwimLaneItemClickRef      = useRef(onSwimLaneItemClick);
    const onSwimLaneItemHoverRef      = useRef(onSwimLaneItemHover);
    const onSwimLaneItemDoubleClickRef = useRef(onSwimLaneItemDoubleClick);
    const onSwimLaneReorderRef        = useRef(onSwimLaneReorder);

    useEffect(() => { onSwimLaneItemClickRef.current = onSwimLaneItemClick; }, [onSwimLaneItemClick]);
    useEffect(() => { onSwimLaneItemHoverRef.current = onSwimLaneItemHover; }, [onSwimLaneItemHover]);
    useEffect(() => { onSwimLaneItemDoubleClickRef.current = onSwimLaneItemDoubleClick; }, [onSwimLaneItemDoubleClick]);
    useEffect(() => { onSwimLaneReorderRef.current = onSwimLaneReorder; }, [onSwimLaneReorder]);

    // Sync swim lane prop changes into refs
    useEffect(() => {
      swimLanesRef.current = swimLanesProp ?? [];
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
    const mouseMode    = useRef<'none' | 'scrub' | 'slide' | 'zoom'>('none');
    const mouseX       = useRef(0);
    // clientX of the cursor during a scrub drag — used by the edge-scroll RAF
    // to keep the needle pinned to the cursor as the window shifts under it.
    const scrubClientX = useRef(0);

    // Touch state
    const touchMode    = useRef<'none' | 'scrub' | 'slide' | 'pinch'>('none');
    const touchX       = useRef(0);
    const pinchDist    = useRef(0);

    const getTouchDist = (a: Touch, b: Touch) =>
      Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

    // ── Imperative handle (called by Timeline parent) ──────────────────────
    useImperativeHandle(ref, () => ({
      zoomTo(startMs: number, endMs: number, currentMs?: number) {
        const span     = Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, endMs - startMs));
        const centerMs = (startMs + endMs) / 2;
        startMsRef.current = centerMs - span / 2;
        endMsRef.current   = centerMs + span / 2;
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
    // Called directly (NOT via RAF) so it always runs with the latest layout.
    // getBoundingClientRect() is used for dimensions — it is always up-to-date
    // and works correctly in both useLayoutEffect and event handlers.
    const draw = useCallback(() => {
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
        // Setting width/height clears the canvas — that is fine, we redraw below.
        canvas.width  = physW;
        canvas.height = physH;
      }

      const t           = themeRef.current;
      const startMs     = startMsRef.current;
      const endMs       = endMsRef.current;
      const currentMs   = curMsRef.current;
      const durationSec = (endMs - startMs) / 1000;
      if (durationSec <= 0) return;

      ctx.save();
      ctx.scale(dpr, dpr);  // draw in CSS pixels from here on

      // ── Background ────────────────────────────────────────────────
      ctx.fillStyle = t.backgroundColor;
      ctx.fillRect(0, 0, w, h);

      // ── Swim lane region geometry ─────────────────────────────────
      const lanes       = swimLanesRef.current;
      const showLanes   = showSwimLanesRef.current && lanes.length > 0;
      const tickAreaH   = TICK_AREA_HEIGHT;
      const laneRegionH = showLanes ? Math.max(0, h - tickAreaH) : 0;

      // Total content height of all swim lanes
      let totalLanesH = 0;
      if (showLanes) {
        for (const lane of lanes) totalLanesH += (lane.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
      }
      // Clamp scroll
      const maxScroll = Math.max(0, totalLanesH - laneRegionH);
      if (scrollTopRef.current > maxScroll) scrollTopRef.current = maxScroll;
      if (scrollTopRef.current < 0) scrollTopRef.current = 0;

      // ── Draw swim lanes (clipped to lane region) ──────────────────
      if (showLanes && laneRegionH > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, laneRegionH);
        ctx.clip();

        const scrollTop = scrollTopRef.current;
        let y = -scrollTop;
        const msToX = (ms: number) => ((ms - startMs) / (endMs - startMs)) * w;

        for (const lane of lanes) {
          const laneH = lane.height ?? DEFAULT_LANE_HEIGHT;
          const laneBottom = y + laneH;

          // Skip lanes above visible region
          if (laneBottom > 0 && y < laneRegionH) {
            // Lane background
            const laneStyle = lane.style;
            const bgColor = laneStyle?.backgroundColor ?? defaultSwimLaneStyle.backgroundColor;
            if (bgColor && bgColor !== 'transparent') {
              ctx.fillStyle = bgColor;
              ctx.fillRect(0, y, w, laneH);
            }

            // Lane separator line
            ctx.strokeStyle = t.tickColor + '44';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, laneBottom);
            ctx.lineTo(w, laneBottom);
            ctx.stroke();

            // Draw items
            for (const item of lane.items) {
              const itemStyle = resolveItemStyle(lane, item);

              if (item.interval) {
                // Interval bar
                const iStart = Cesium.JulianDate.toDate(item.interval.start).getTime();
                const iStop  = Cesium.JulianDate.toDate(item.interval.stop).getTime();
                const x1 = msToX(iStart);
                const x2 = msToX(iStop);
                const barX = Math.max(0, x1);
                const barW = Math.min(w, x2) - barX;
                if (barW > 0) {
                  ctx.globalAlpha = itemStyle.opacity;
                  ctx.fillStyle = itemStyle.color;
                  const barPad = 3;
                  const barY = y + barPad;
                  const barH = laneH - barPad * 2;
                  ctx.fillRect(barX, barY, barW, barH);
                  if (itemStyle.borderWidth > 0) {
                    ctx.strokeStyle = itemStyle.borderColor;
                    ctx.lineWidth = itemStyle.borderWidth;
                    ctx.strokeRect(barX, barY, barW, barH);
                  }
                  ctx.globalAlpha = 1;
                }
              }

              if (item.instant) {
                // Instant marker
                const iMs = Cesium.JulianDate.toDate(item.instant).getTime();
                const mx = msToX(iMs);
                if (mx >= -itemStyle.markerSize && mx <= w + itemStyle.markerSize) {
                  const cy = y + laneH / 2;
                  const sz = itemStyle.markerSize;
                  ctx.globalAlpha = itemStyle.opacity;
                  ctx.fillStyle = itemStyle.color;

                  if (itemStyle.markerShape === 'diamond') {
                    ctx.beginPath();
                    ctx.moveTo(mx, cy - sz / 2);
                    ctx.lineTo(mx + sz / 2, cy);
                    ctx.lineTo(mx, cy + sz / 2);
                    ctx.lineTo(mx - sz / 2, cy);
                    ctx.closePath();
                    ctx.fill();
                  } else if (itemStyle.markerShape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(mx, cy, sz / 2, 0, Math.PI * 2);
                    ctx.fill();
                  } else {
                    // 'line'
                    ctx.strokeStyle = itemStyle.color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(mx, y + 2);
                    ctx.lineTo(mx, y + laneH - 2);
                    ctx.stroke();
                  }
                  ctx.globalAlpha = 1;
                }
              }
            }

            // Lane label
            ctx.font = `${Math.min(11, laneH - 4)}px system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = laneStyle?.labelColor ?? defaultSwimLaneStyle.labelColor;
            ctx.fillText(lane.label, LABEL_PAD_LEFT, y + laneH / 2);
          }

          y += laneH + LANE_GAP;
          if (y >= laneRegionH) break;
        }

        // ── Drag-to-reorder visual feedback ─────────────────────────
        const rs = reorderState.current;
        if (rs && rs.dragging) {
          const dy = rs.currentY - rs.dragStartY;
          // Draw insertion indicator line
          let insertY = -scrollTop;
          for (let i = 0; i < lanes.length && i < rs.insertIndex; i++) {
            insertY += (lanes[i].height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
          }
          ctx.strokeStyle = t.indicatorColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, insertY);
          ctx.lineTo(w, insertY);
          ctx.stroke();

          // Draw ghost of the dragged lane
          const dragLane = lanes.find(l => l.id === rs.dragLaneId);
          if (dragLane) {
            const ghostH = dragLane.height ?? DEFAULT_LANE_HEIGHT;
            let origY = -scrollTop;
            for (const l of lanes) {
              if (l.id === rs.dragLaneId) break;
              origY += (l.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
            }
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = t.indicatorColor;
            ctx.fillRect(0, origY + dy, w, ghostH);
            ctx.globalAlpha = 1;
          }
        }

        // ── Vertical scrollbar ──────────────────────────────────────
        if (totalLanesH > laneRegionH) {
          const trackX = w - SCROLLBAR_WIDTH - 2;
          const thumbRatio = laneRegionH / totalLanesH;
          const thumbH = Math.max(20, laneRegionH * thumbRatio);
          const thumbY = (scrollTopRef.current / maxScroll) * (laneRegionH - thumbH);

          // Track
          ctx.fillStyle = t.tickColor + '22';
          ctx.fillRect(trackX, 0, SCROLLBAR_WIDTH, laneRegionH);
          // Thumb
          ctx.fillStyle = t.tickColor + '88';
          ctx.fillRect(trackX, thumbY, SCROLLBAR_WIDTH, thumbH);
        }

        ctx.restore();
      }

      // ── Pick tick scales (Cesium algorithm) ───────────────────────
      // Measure a sample label to find how many pixels a typical label needs.
      ctx.font = `${t.fontSize}px monospace`;
      const sampleLabel = makeLabel(startMs + durationSec * 500, durationSec);
      const sampleW     = ctx.measureText(sampleLabel).width + 24;

      // idealTic: the tic spacing (in seconds) that would produce exactly one
      // label-width of space between main ticks.
      const idealTic = Math.max((sampleW / w) * durationSec, durationSec / 1000);

      // Find the smallest Cesium scale > idealTic for main ticks.
      let mainTic = TIC_SCALES[TIC_SCALES.length - 1];
      let mainIdx = TIC_SCALES.length - 1;
      for (let i = 0; i < TIC_SCALES.length; i++) {
        if (TIC_SCALES[i] > idealTic) { mainTic = TIC_SCALES[i]; mainIdx = i; break; }
      }

      // If maxTicks is set, coarsen mainTic until the tick count fits.
      const limit = maxTicksRef.current;
      if (limit != null && limit > 0) {
        while (mainIdx < TIC_SCALES.length - 1 && durationSec / mainTic > limit) {
          mainIdx++;
          mainTic = TIC_SCALES[mainIdx];
        }
      }

      // sub-tic: largest scale < mainTic that evenly divides mainTic and is ≥ 3px wide.
      let subTic = 0;
      for (let i = mainIdx - 1; i >= 0; i--) {
        if (mainTic % TIC_SCALES[i] < 0.0001) {
          if (w * (TIC_SCALES[i] / durationSec) >= 3) subTic = TIC_SCALES[i];
          break;
        }
      }

      // tiny-tic: first scale that evenly divides subTic and is ≥ 3px wide.
      let tinyTic = 0;
      if (subTic > 0) {
        for (let i = 0; i < TIC_SCALES.length && TIC_SCALES[i] < subTic; i++) {
          if (subTic % TIC_SCALES[i] < 0.0001 && w * (TIC_SCALES[i] / durationSec) >= 3) {
            tinyTic = TIC_SCALES[i];
            break;
          }
        }
      }

      // Epoch: a round reference time so tick offsets are clean integers.
      const epochMs  = calcEpochMs(startMs, durationSec);
      const startOff = (startMs - epochMs) / 1000;  // seconds from epoch to left edge
      const endOff   = startOff + durationSec;

      // Convert seconds-from-epoch → canvas x pixel.
      const ticX = (sec: number) => w * ((sec - startOff) / durationSec);

      // ── Tiny ticks ────────────────────────────────────────────────
      if (tinyTic > 0) {
        ctx.strokeStyle = t.tickColor;
        ctx.lineWidth   = 1;
        for (
          let s = Math.floor(startOff / tinyTic) * tinyTic;
          s <= endOff;
          s = nextTic(s, tinyTic)
        ) {
          const x = ticX(s);
          ctx.beginPath();
          ctx.moveTo(x, h - t.minorTickHeight);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }

      // ── Sub ticks ─────────────────────────────────────────────────
      if (subTic > 0) {
        ctx.strokeStyle = t.tickColor;
        ctx.lineWidth   = 1;
        for (
          let s = Math.floor(startOff / subTic) * subTic;
          s <= endOff;
          s = nextTic(s, subTic)
        ) {
          const x = ticX(s);
          ctx.beginPath();
          ctx.moveTo(x, h - t.minorTickHeight);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }

      // ── Main ticks + labels ───────────────────────────────────────
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      let lastLabelRight = -Infinity;

      for (
        let s = Math.floor(startOff / mainTic) * mainTic;
        s <= endOff + mainTic;
        s = nextTic(s, mainTic)
      ) {
        const x     = ticX(s);
        const ticMs = epochMs + s * 1000;

        ctx.strokeStyle = t.majorTickColor;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, h - t.majorTickHeight);
        ctx.lineTo(x, h);
        ctx.stroke();

        const label     = makeLabel(ticMs, durationSec);
        const textW     = ctx.measureText(label).width;
        const labelLeft = x - textW / 2;
        if (labelLeft > lastLabelRight) {
          ctx.fillStyle = t.labelColor;
          ctx.fillText(label, x, h - t.majorTickHeight - 4);
          lastLabelRight = labelLeft + textW + 5;
        }
      }

      // ── Needle ────────────────────────────────────────────────────
      const needleX = ((currentMs - startMs) / (endMs - startMs)) * w;
      ctx.strokeStyle = t.indicatorColor;
      ctx.lineWidth   = t.indicatorLineWidth;
      ctx.beginPath();
      ctx.moveTo(needleX, 0);
      ctx.lineTo(needleX, h);
      ctx.stroke();

      ctx.restore();
    }, []); // only refs used — stable forever

    // ── Initial draw + resize observer ────────────────────────────────────
    // useLayoutEffect runs synchronously after DOM mutations, before the browser
    // paints. At this point getBoundingClientRect() is guaranteed to return the
    // correct layout dimensions — unlike useEffect + RAF which has a timing gap
    // where clientWidth / clientHeight can still be 0.
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

    // ── Edge-scroll animation loop ────────────────────────────────────────
    const startEdgeScroll = useCallback((direction: -1 | 1) => {
      if (edgeRAF.current !== null) return;
      const scroll = () => {
        const canvas = canvasRef.current;
        const span   = endMsRef.current - startMsRef.current;
        const shift  = direction * span * 0.01;  // 1% per frame (~60px/s feel)
        startMsRef.current += shift;
        endMsRef.current   += shift;

        // Keep the needle pinned to the cursor while the window scrolls under it.
        if (canvas) {
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
    }, [draw, onTimeChange]);

    const stopEdgeScroll = useCallback(() => {
      if (edgeRAF.current !== null) {
        cancelAnimationFrame(edgeRAF.current);
        edgeRAF.current = null;
      }
    }, []);

    // ── Swim lane hit-testing ────────────────────────────────────────────
    // Given a canvas-local (x, y), find which lane and item (if any) is under the cursor.
    const hitTestSwimLane = useCallback((canvasX: number, canvasY: number, canvasW: number, canvasH: number): { lane: SwimLane; item: SwimLaneItem } | null => {
      const lanes = swimLanesRef.current;
      if (!showSwimLanesRef.current || lanes.length === 0) return null;
      const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
      if (canvasY < 0 || canvasY >= laneRegionH) return null;

      const scrollTop = scrollTopRef.current;
      let y = -scrollTop;
      const startMs = startMsRef.current;
      const endMs   = endMsRef.current;

      for (const lane of lanes) {
        const laneH = lane.height ?? DEFAULT_LANE_HEIGHT;
        const laneTop = y;
        const laneBottom = y + laneH;
        y += laneH + LANE_GAP;

        if (canvasY < laneTop || canvasY >= laneBottom) continue;

        // Check items in this lane
        for (const item of lane.items) {
          if (item.interval) {
            const iStart = Cesium.JulianDate.toDate(item.interval.start).getTime();
            const iStop  = Cesium.JulianDate.toDate(item.interval.stop).getTime();
            const x1 = ((iStart - startMs) / (endMs - startMs)) * canvasW;
            const x2 = ((iStop  - startMs) / (endMs - startMs)) * canvasW;
            if (canvasX >= Math.max(0, x1) && canvasX <= Math.min(canvasW, x2)) {
              return { lane, item };
            }
          }
          if (item.instant) {
            const iMs = Cesium.JulianDate.toDate(item.instant).getTime();
            const mx = ((iMs - startMs) / (endMs - startMs)) * canvasW;
            const style = resolveItemStyle(lane, item);
            if (Math.abs(canvasX - mx) <= style.markerSize / 2 + 2) {
              return { lane, item };
            }
          }
        }
        // In the lane region but not on an item
        return null;
      }
      return null;
    }, []);

    // Check if a Y coordinate is in the swim lane label area (leftmost ~80px)
    const isInLaneLabelArea = useCallback((canvasX: number, canvasY: number, canvasH: number): SwimLane | null => {
      const lanes = swimLanesRef.current;
      if (!showSwimLanesRef.current || lanes.length === 0 || canvasX > 80) return null;
      const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
      if (canvasY < 0 || canvasY >= laneRegionH) return null;

      const scrollTop = scrollTopRef.current;
      let y = -scrollTop;
      for (const lane of lanes) {
        const laneH = lane.height ?? DEFAULT_LANE_HEIGHT;
        if (canvasY >= y && canvasY < y + laneH) return lane;
        y += laneH + LANE_GAP;
      }
      return null;
    }, []);

    // Check if Y is in the swim lane region (above tick area)
    const isInSwimLaneRegion = useCallback((canvasY: number, canvasH: number): boolean => {
      if (!showSwimLanesRef.current || swimLanesRef.current.length === 0) return false;
      const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
      return canvasY >= 0 && canvasY < laneRegionH;
    }, []);

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
          reorderState.current = {
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

      // Check for click on swim lane item (don't start scrub if clicking an item)
      if (e.button === 0 && isInSwimLaneRegion(y, rect.height)) {
        const hit = hitTestSwimLane(x, y, rect.width, rect.height);
        if (hit) {
          // Clicking on a swim lane item — don't start timeline scrub
          return;
        }
        // Clicked in swim lane region but not on an item — fall through to scrub
      }

      if (e.button === 0) {
        mouseMode.current  = 'scrub';
        scrubClientX.current = e.clientX;
        e.currentTarget.style.cursor = 'grabbing';
        onDragStart?.();
        const ms   = startMsRef.current + (x / rect.width) * (endMsRef.current - startMsRef.current);
        curMsRef.current = ms;
        draw();
        onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
      } else if (e.button === 1) {
        mouseMode.current = 'slide';
        mouseX.current    = e.clientX;
      } else if (e.button === 2) {
        mouseMode.current = 'zoom';
        mouseX.current    = e.clientX;
      }
    }, [draw, onTimeChange, onDragStart, isInLaneLabelArea, isInSwimLaneRegion]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        // ── Reorder drag ────────────────────────────────────────────
        const rs = reorderState.current;
        if (rs && rs.dragging) {
          rs.currentY = e.clientY;
          // Calculate insertion index based on cursor Y
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
          // Always compute ms from actual mouse position (clamped to canvas).
          // The RAF loop scrolls the window underneath — no snap, no jump.
          const cx = Math.max(0, Math.min(w, x));
          const ms = startMsRef.current + (cx / w) * (endMsRef.current - startMsRef.current);
          curMsRef.current = ms;
          draw();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
        } else if (mouseMode.current === 'slide') {
          const dx = mouseX.current - e.clientX;
          mouseX.current = e.clientX;
          if (dx !== 0) {
            const shift = (dx / w) * (endMsRef.current - startMsRef.current);
            startMsRef.current += shift;
            endMsRef.current   += shift;
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
        const rs = reorderState.current;
        if (rs && rs.dragging) {
          const dragDistance = Math.abs(rs.currentY - rs.dragStartY);
          const lanes = swimLanesRef.current;
          const dragIdx = lanes.findIndex(l => l.id === rs.dragLaneId);
          // Only reorder if the user actually dragged (>5px) and the position changed
          if (dragDistance > 5 && dragIdx >= 0 && rs.insertIndex !== dragIdx && rs.insertIndex !== dragIdx + 1) {
            const newLanes = [...lanes];
            const [removed] = newLanes.splice(dragIdx, 1);
            const insertAt = rs.insertIndex > dragIdx ? rs.insertIndex - 1 : rs.insertIndex;
            newLanes.splice(insertAt, 0, removed);
            swimLanesRef.current = newLanes;
            onSwimLaneReorderRef.current?.(newLanes.map(l => l.id));
          }
          reorderState.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          draw();
          return;
        }

        stopEdgeScroll();
        mouseMode.current = 'none';
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
        onDragEnd?.();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
      return () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
      };
    }, [draw, onTimeChange, onDragEnd, startEdgeScroll, stopEdgeScroll]);

    // Zoom around center (mirrors Cesium's zoomFrom)
    const zoomFrom = useCallback((amount: number) => {
      const span     = endMsRef.current - startMsRef.current;
      const centerMs = (startMsRef.current + endMsRef.current) / 2;
      const newSpan  = Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, span * amount));
      startMsRef.current = centerMs - newSpan / 2;
      endMsRef.current   = centerMs + newSpan / 2;
      draw();
    }, [draw]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;

      // Vertical scroll in swim lane region
      if (isInSwimLaneRegion(y, rect.height)) {
        const lanes = swimLanesRef.current;
        let totalH = 0;
        for (const l of lanes) totalH += (l.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
        const laneRegionH = Math.max(0, rect.height - TICK_AREA_HEIGHT);
        const maxScroll = Math.max(0, totalH - laneRegionH);
        scrollTopRef.current = Math.max(0, Math.min(maxScroll, scrollTopRef.current + e.deltaY));
        draw();
        return;
      }

      zoomFrom(Math.pow(1.05, e.deltaY > 0 ? -1 : 1));
    }, [zoomFrom, draw, isInSwimLaneRegion]);

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
          touchMode.current    = 'scrub';
          touchX.current       = e.touches[0].clientX;
          scrubClientX.current = e.touches[0].clientX;  // seed for edge-scroll RAF
          curMsRef.current     = ms;
          draw();
          onDragStart?.();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
        } else if (e.touches.length >= 2) {
          touchMode.current = 'pinch';
          pinchDist.current = getTouchDist(e.touches[0], e.touches[1]);
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();

        if (touchMode.current === 'scrub' && e.touches.length >= 1) {
          const x    = e.touches[0].clientX - rect.left;
          const edge = rect.width * 0.08;

          // Always keep scrubClientX current so the edge-scroll RAF can use it
          scrubClientX.current = e.touches[0].clientX;

          if (x < edge)                   startEdgeScroll(-1);
          else if (x > rect.width - edge)  startEdgeScroll(1);
          else {
            stopEdgeScroll();
            // Only update needle directly when NOT edge-scrolling (RAF handles it otherwise)
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
            draw();
          }

        } else if (touchMode.current === 'pinch' && e.touches.length >= 2) {
          const newDist = getTouchDist(e.touches[0], e.touches[1]);
          if (newDist > 0 && pinchDist.current > 0) {
            // prevDist / newDist < 1 when spreading (zoom in), > 1 when pinching (zoom out)
            zoomFrom(pinchDist.current / newDist);
          }
          pinchDist.current = newDist;
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        stopEdgeScroll();
        if (touchMode.current === 'scrub') onDragEnd?.();

        if (e.touches.length === 0) {
          touchMode.current = 'none';
        } else if (e.touches.length === 1) {
          // Lifted one finger during pinch — transition to slide
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
    }, [draw, onDragStart, onDragEnd, onTimeChange, zoomFrom, startEdgeScroll, stopEdgeScroll]);

    // Show grab cursor only when hovering near the needle.
    const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (mouseMode.current !== 'none') return; // cursor managed by drag state
      const rect   = e.currentTarget.getBoundingClientRect();
      const x      = e.clientX - rect.left;
      const y      = e.clientY - rect.top;

      // Needle hover check (applies everywhere — needle spans full height)
      const needleX = ((curMsRef.current - startMsRef.current) / (endMsRef.current - startMsRef.current)) * rect.width;
      const nearNeedle = Math.abs(x - needleX) <= 10;

      // Swim lane hover detection
      if (isInSwimLaneRegion(y, rect.height)) {
        const hit = hitTestSwimLane(x, y, rect.width, rect.height);
        const prev = hoveredItemRef.current;
        if (hit) {
          e.currentTarget.style.cursor = nearNeedle ? 'grab' : 'pointer';
          if (!prev || prev.item.id !== hit.item.id || prev.lane.id !== hit.lane.id) {
            hoveredItemRef.current = hit;
            onSwimLaneItemHoverRef.current?.({ laneId: hit.lane.id, item: hit.item, originalEvent: e.nativeEvent });
            draw();
          }
        } else {
          if (prev) {
            hoveredItemRef.current = null;
            onSwimLaneItemHoverRef.current?.(null);
            draw();
          }
          if (nearNeedle) {
            e.currentTarget.style.cursor = 'grab';
          } else {
            // Check if over label area for grab cursor (reorder hint)
            const labelLane = isInLaneLabelArea(x, y, rect.height);
            e.currentTarget.style.cursor = labelLane && onSwimLaneReorderRef.current ? 'grab' : 'default';
          }
        }
        return;
      }

      // Clear hover when leaving swim lane region
      if (hoveredItemRef.current) {
        hoveredItemRef.current = null;
        onSwimLaneItemHoverRef.current?.(null);
        draw();
      }

      e.currentTarget.style.cursor = nearNeedle ? 'grab' : 'default';
    }, [draw, hitTestSwimLane, isInSwimLaneRegion, isInLaneLabelArea]);

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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

    // Cleanup RAFs on unmount
    useEffect(() => () => {
      if (edgeRAF.current !== null) cancelAnimationFrame(edgeRAF.current);
      if (followRAF.current !== null) cancelAnimationFrame(followRAF.current);
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          if (hoveredItemRef.current) { hoveredItemRef.current = null; onSwimLaneItemHoverRef.current?.(null); draw(); }
          if (mouseMode.current === 'none' && canvasRef.current) canvasRef.current.style.cursor = 'default';
        }}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />
    );
  }
);

TimelineCanvas.displayName = 'TimelineCanvas';
