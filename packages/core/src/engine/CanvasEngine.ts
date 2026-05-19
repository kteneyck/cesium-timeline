/**
 * CanvasEngine — framework-agnostic canvas rendering logic for the timeline.
 *
 * All functions in this module are pure: they take a CanvasRenderingContext2D
 * (or dimensions) plus a state object and produce visual output or computed
 * results. No React, Angular, or other framework dependency.
 */

import * as Cesium from 'cesium';
import { TimelineTheme } from '../types/TimelineTheme';
import {
  SwimLane,
  SwimLaneItem,
  SwimLaneItemStyle,
  defaultSwimLaneStyle,
  DEFAULT_LANE_HEIGHT,
} from '../types/SwimLane';
import {
  TIC_SCALES,
  TICK_AREA_HEIGHT,
  LANE_GAP,
  LABEL_PAD_LEFT,
  SCROLLBAR_WIDTH,
  MONTHS,
  MIN_SPAN_MS,
  MAX_SPAN_MS,
} from '../constants';
import { getDateParts } from '../utils/timeConversion';

// ─── State passed into the draw function ──────────────────────────────────────

/** Mutable state the engine reads during a draw call. */
export interface TimelineRenderState {
  startMs: number;
  endMs: number;
  currentMs: number;
  theme: TimelineTheme;
  maxTicks?: number;
  swimLanes: SwimLane[];
  showSwimLanes: boolean;
  scrollTop: number;
  reorderState: ReorderState | null;
  /** @see TimelineBaseProps.timezone */
  timezone?: string;
  /** When true, tick labels use 12-hour (hh:mm AM/PM) format instead of 24-hour. */
  use12h?: boolean;
  /** Abbreviated month names for tick labels. Falls back to English when omitted. */
  months?: string[];
  /**
   * Active range selection (set while the user is dragging to select a range).
   * When non-null, a highlight is rendered over the selected time span in the tick area.
   */
  rangeSelection?: { startMs: number; endMs: number } | null;
  /**
   * Canvas-relative X position of the cursor (in CSS pixels) while the user is
   * hovering over the timeline.  When non-null a ghost needle is drawn at this
   * position with 25 % opacity so the user can preview where a click / drag
   * would land before committing.
   */
  hoverMs?: number | null;
}

/** Drag-to-reorder visual state. */
export interface ReorderState {
  dragging: boolean;
  dragLaneId: string;
  dragStartY: number;
  currentY: number;
  insertIndex: number;
}

/** Hit-test result for swim lane items. */
export interface SwimLaneHitResult {
  lane: SwimLane;
  item: SwimLaneItem;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export function twoD(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function makeLabel(ms: number, durationSec: number, timezone?: string, use12h?: boolean, months?: string[]): string {
  const d  = new Date(ms);
  const { yr: y, mo, day: dy, hr24: h, hr12: h12, min: mi, sec: s, ms: ms2, ampm } = getDateParts(d, timezone);
  const hour   = use12h ? h12 : h;
  const suffix = use12h ? ` ${ampm}` : '';
  const MON    = months ?? MONTHS;
  if (durationSec > 315360000) return `${y}`;
  if (durationSec > 31536000)  return `${MON[mo]} ${y}`;
  if (durationSec > 604800)    return `${MON[mo]} ${dy}`;
  if (durationSec > 86400)     return `${MON[mo]} ${dy} ${twoD(hour)}:${twoD(mi)}${suffix}`;
  if (durationSec > 3600)      return `${twoD(hour)}:${twoD(mi)}${suffix}`;
  if (durationSec > 60)        return `${twoD(hour)}:${twoD(mi)}:${twoD(s)}${suffix}`;
  const msStr = ms2 > 0 ? `.${String(ms2).padStart(3, '0')}` : '';
  return `${twoD(hour)}:${twoD(mi)}:${twoD(s)}${msStr}${suffix}`;
}

/** Pick a round epoch near startMs so tick offsets are clean integers (mirrors Cesium). */
export function calcEpochMs(startMs: number, durationSec: number, timezone?: string): number {
  const d = new Date(startMs);

  if (!timezone || timezone === 'local') {
    const y  = d.getFullYear();
    const mo = d.getMonth();
    const dy = d.getDate();
    if (durationSec > 315360000) return new Date(Math.floor(y / 100) * 100, 0).getTime();
    if (durationSec > 31536000)  return new Date(Math.floor(y / 10)  * 10,  0).getTime();
    if (durationSec > 86400)     return new Date(y, 0).getTime();
    return new Date(y, mo, dy).getTime();
  }

  const { yr: y, hr24: h, min: mi, sec: s } = getDateParts(d, timezone);
  if (durationSec > 315360000) return Date.UTC(Math.floor(y / 100) * 100, 0, 1);
  if (durationSec > 31536000)  return Date.UTC(Math.floor(y / 10)  * 10,  0, 1);
  if (durationSec > 86400)     return Date.UTC(y, 0, 1);
  // Start of the current day in the target timezone: subtract elapsed time-of-day.
  return startMs - (h * 3600 + mi * 60 + s) * 1000;
}

/** Advance to next tick boundary (identical to Cesium's getNextTic). */
export function nextTic(t: number, scale: number): number {
  return Math.ceil(t / scale + 0.5) * scale;
}

/** Resolve the effective style for a swim lane item (item → lane → theme → defaults). */
export function resolveItemStyle(lane: SwimLane, item: SwimLaneItem, theme?: TimelineTheme): SwimLaneItemStyle {
  return {
    color:       item.style?.color       ?? lane.style?.color       ?? defaultSwimLaneStyle.color,
    borderColor: item.style?.borderColor ?? lane.style?.borderColor ?? theme?.swimLaneItemBorderColor ?? defaultSwimLaneStyle.borderColor,
    borderWidth: item.style?.borderWidth ?? lane.style?.borderWidth ?? theme?.swimLaneItemBorderWidth ?? defaultSwimLaneStyle.borderWidth,
    opacity:     item.style?.opacity     ?? lane.style?.opacity     ?? defaultSwimLaneStyle.opacity,
    markerShape: item.style?.markerShape ?? lane.style?.markerShape ?? defaultSwimLaneStyle.markerShape,
    markerSize:  item.style?.markerSize  ?? lane.style?.markerSize  ?? defaultSwimLaneStyle.markerSize,
  };
}

// ─── Zoom / pan math ──────────────────────────────────────────────────────────

/** Clamp a time span to the allowed zoom range. */
export function clampSpan(span: number): number {
  return Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, span));
}

/** Compute a new visible range after zooming by `amount` around the center. */
export function zoomRange(
  startMs: number,
  endMs: number,
  amount: number
): { startMs: number; endMs: number } {
  const span     = endMs - startMs;
  const centerMs = (startMs + endMs) / 2;
  const newSpan  = clampSpan(span * amount);
  return {
    startMs: centerMs - newSpan / 2,
    endMs:   centerMs + newSpan / 2,
  };
}

/**
 * Compute a new visible range after zooming by `amount` around a specific
 * pivot time. The pivot stays at the same fractional position on-screen,
 * which is the expected behaviour for pinch-to-zoom (pivot = midpoint between
 * the two fingers) and mouse-wheel zoom anchored to the cursor.
 */
export function zoomAroundMs(
  startMs: number,
  endMs: number,
  amount: number,
  pivotMs: number
): { startMs: number; endMs: number } {
  const span     = endMs - startMs;
  const newSpan  = clampSpan(span * amount);
  const fraction = span > 0 ? (pivotMs - startMs) / span : 0.5;
  return {
    startMs: pivotMs - fraction * newSpan,
    endMs:   pivotMs + (1 - fraction) * newSpan,
  };
}

/** Compute the total content height of all swim lanes. */
export function totalSwimLaneHeight(lanes: SwimLane[]): number {
  let total = 0;
  for (const lane of lanes) total += (lane.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
  return total;
}

// ─── Hit-testing (framework-agnostic) ─────────────────────────────────────────

/**
 * Given canvas-local coordinates, find which swim lane item (if any) is under the point.
 */
export function hitTestSwimLane(
  canvasX: number,
  canvasY: number,
  canvasW: number,
  canvasH: number,
  state: Pick<TimelineRenderState, 'swimLanes' | 'showSwimLanes' | 'scrollTop' | 'startMs' | 'endMs' | 'theme'>
): SwimLaneHitResult | null {
  const { swimLanes: lanes, showSwimLanes, scrollTop, startMs, endMs, theme } = state;
  if (!showSwimLanes || lanes.length === 0) return null;
  const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
  if (canvasY < 0 || canvasY >= laneRegionH) return null;

  let y = -scrollTop;

  for (const lane of lanes) {
    const laneH = lane.height ?? DEFAULT_LANE_HEIGHT;
    const laneTop = y;
    const laneBottom = y + laneH;
    y += laneH + LANE_GAP;

    if (canvasY < laneTop || canvasY >= laneBottom) continue;

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
        const style = resolveItemStyle(lane, item, theme);
        if (Math.abs(canvasX - mx) <= style.markerSize / 2 + 2) {
          return { lane, item };
        }
      }
    }
    return null;
  }
  return null;
}

/** Check if a Y coordinate is in the swim lane label area (leftmost ~80px). */
export function hitTestLaneLabel(
  canvasX: number,
  canvasY: number,
  canvasH: number,
  state: Pick<TimelineRenderState, 'swimLanes' | 'showSwimLanes' | 'scrollTop'>
): SwimLane | null {
  const { swimLanes: lanes, showSwimLanes, scrollTop } = state;
  if (!showSwimLanes || lanes.length === 0 || canvasX > 80) return null;
  const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
  if (canvasY < 0 || canvasY >= laneRegionH) return null;

  let y = -scrollTop;
  for (const lane of lanes) {
    const laneH = lane.height ?? DEFAULT_LANE_HEIGHT;
    if (canvasY >= y && canvasY < y + laneH) return lane;
    y += laneH + LANE_GAP;
  }
  return null;
}

/** Check if Y is in the swim lane region (above tick area). */
export function isInSwimLaneRegion(
  canvasY: number,
  canvasH: number,
  state: Pick<TimelineRenderState, 'swimLanes' | 'showSwimLanes'>
): boolean {
  if (!state.showSwimLanes || state.swimLanes.length === 0) return false;
  const laneRegionH = Math.max(0, canvasH - TICK_AREA_HEIGHT);
  return canvasY >= 0 && canvasY < laneRegionH;
}

// ─── Core draw function ───────────────────────────────────────────────────────

/**
 * Render the entire timeline onto a 2D canvas context.
 *
 * This is a pure rendering function — it reads from `state` and writes pixels
 * to `ctx`. It does NOT modify `state` (except returning clamped scrollTop
 * if the caller wants to update it).
 *
 * @param ctx    The 2D rendering context (already DPR-scaled by the caller).
 * @param w      CSS-pixel width of the canvas.
 * @param h      CSS-pixel height of the canvas.
 * @param state  The current render state.
 * @returns The clamped scrollTop value (caller should update their state if different).
 */
export function drawTimeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: TimelineRenderState
): number {
  const {
    startMs, endMs, currentMs, theme: t, maxTicks,
    swimLanes: lanes, showSwimLanes, reorderState: rs, timezone, use12h, months,
    rangeSelection, hoverMs,
  } = state;
  let { scrollTop } = state;

  const durationSec = (endMs - startMs) / 1000;
  if (durationSec <= 0) return scrollTop;

  // ── Background ────────────────────────────────────────────────
  ctx.fillStyle = t.backgroundColor;
  ctx.fillRect(0, 0, w, h);

  // ── Swim lane region geometry ─────────────────────────────────
  const showLanes   = showSwimLanes && lanes.length > 0;
  const tickAreaH   = TICK_AREA_HEIGHT;
  const laneRegionH = showLanes ? Math.max(0, h - tickAreaH) : 0;

  // Total content height of all swim lanes
  let totalLanesH = 0;
  if (showLanes) {
    for (const lane of lanes) totalLanesH += (lane.height ?? DEFAULT_LANE_HEIGHT) + LANE_GAP;
  }
  // Clamp scroll
  const maxScroll = Math.max(0, totalLanesH - laneRegionH);
  if (scrollTop > maxScroll) scrollTop = maxScroll;
  if (scrollTop < 0) scrollTop = 0;

  // ── Draw swim lanes (clipped to lane region) ──────────────────
  if (showLanes && laneRegionH > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, laneRegionH);
    ctx.clip();

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
          const itemStyle = resolveItemStyle(lane, item, t);

          if (item.interval) {
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
      const thumbY = (scrollTop / maxScroll) * (laneRegionH - thumbH);

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
  ctx.font = `${t.fontSize}px monospace`;
  const sampleLabel = makeLabel(startMs + durationSec * 500, durationSec, timezone, use12h, months);
  const sampleW     = ctx.measureText(sampleLabel).width + 24;

  const idealTic = Math.max((sampleW / w) * durationSec, durationSec / 1000);

  // Find the smallest Cesium scale > idealTic for main ticks.
  let mainTic = TIC_SCALES[TIC_SCALES.length - 1];
  let mainIdx = TIC_SCALES.length - 1;
  for (let i = 0; i < TIC_SCALES.length; i++) {
    if (TIC_SCALES[i] > idealTic) { mainTic = TIC_SCALES[i]; mainIdx = i; break; }
  }

  // If maxTicks is set, coarsen mainTic until the tick count fits.
  if (maxTicks != null && maxTicks > 0) {
    while (mainIdx < TIC_SCALES.length - 1 && durationSec / mainTic > maxTicks) {
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
  const epochMs  = calcEpochMs(startMs, durationSec, timezone);
  const startOff = (startMs - epochMs) / 1000;
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

    const label     = makeLabel(ticMs, durationSec, timezone, use12h, months);
    const textW     = ctx.measureText(label).width;
    const labelLeft = x - textW / 2;
    if (labelLeft > lastLabelRight) {
      ctx.fillStyle = t.labelColor;
      ctx.fillText(label, x, h - t.majorTickHeight - 4);
      lastLabelRight = labelLeft + textW + 5;
    }
  }

  // ── Range-selection highlight ─────────────────────────────────
  if (rangeSelection) {
    const selX1 = ((rangeSelection.startMs - startMs) / (endMs - startMs)) * w;
    const selX2 = ((rangeSelection.endMs   - startMs) / (endMs - startMs)) * w;
    const rx = Math.min(selX1, selX2);
    const rw = Math.abs(selX2 - selX1);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = t.indicatorColor;
    ctx.fillRect(rx, 0, rw, h);
    ctx.globalAlpha = 1;
  }

  // ── Needle ────────────────────────────────────────────────────
  const needleX = ((currentMs - startMs) / (endMs - startMs)) * w;
  ctx.strokeStyle = t.indicatorColor;
  ctx.lineWidth   = t.indicatorLineWidth;
  ctx.beginPath();
  ctx.moveTo(needleX, 0);
  ctx.lineTo(needleX, h);
  ctx.stroke();

  // ── Ghost needle (hover preview) ──────────────────────────────
  if (hoverMs != null) {
    const ghostX = ((hoverMs - startMs) / (endMs - startMs)) * w;
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = t.indicatorColor;
    ctx.lineWidth   = t.indicatorLineWidth;
    ctx.beginPath();
    ctx.moveTo(ghostX, 0);
    ctx.lineTo(ghostX, h);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return scrollTop;
}
