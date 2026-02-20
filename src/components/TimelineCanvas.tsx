/**
 * TimelineCanvas – canvas-based timeline renderer.
 * Modelled after Cesium's own Timeline widget (Timeline.js).
 *
 * Key design decisions (matching Cesium):
 *  - Visible range is stored in refs, NOT React state → no reconciliation jumps.
 *  - draw() paints everything (ticks, labels, needle) in one synchronous pass.
 *  - Mouse left = scrub; middle = slide; right = zoom; wheel = zoom.
 *  - Edge-drag: needle clamps to edge, timeline scrolls via RAF loop.
 *  - Parent calls zoomTo() imperatively (for jump-to-start/end, auto-scroll).
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as Cesium from 'cesium';
import { TimelineTheme } from '../types';

// Same scale table as Cesium's timelineTicScales
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

/** Format a timestamp for display given the visible duration (seconds). */
function makeLabel(ms: number, durationSec: number): string {
  const d = new Date(ms);
  const y  = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  const h  = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const s  = d.getUTCSeconds();
  const ms2 = d.getUTCMilliseconds();
  if (durationSec > 315360000)   return `${y}`;
  if (durationSec > 31536000)    return `${MONTHS[mo]} ${y}`;
  if (durationSec > 604800)      return `${MONTHS[mo]} ${dy}`;
  if (durationSec > 3600)        return `${MONTHS[mo]} ${dy} ${twoD(h)}:${twoD(mi)}`;
  if (durationSec > 60)          return `${twoD(h)}:${twoD(mi)}:${twoD(s)}`;
  const msStr = ms2 > 0 ? `.${String(ms2).padStart(3, '0')}` : '';
  return `${twoD(h)}:${twoD(mi)}:${twoD(s)}${msStr}`;
}

/**
 * Pick a "round" epoch near startMs so that tick offsets are clean numbers.
 * Mirrors Cesium's epochJulian calculation.
 */
function calcEpochMs(startMs: number, durationSec: number): number {
  const d  = new Date(startMs);
  const y  = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  if (durationSec > 315360000) return Date.UTC(Math.floor(y / 100) * 100, 0);
  if (durationSec > 31536000)  return Date.UTC(Math.floor(y / 10) * 10, 0);
  if (durationSec > 86400)     return Date.UTC(y, 0);
  return Date.UTC(y, mo, dy);
}

function nextTic(t: number, scale: number) {
  return Math.ceil(t / scale + 0.5) * scale;
}

// ─── Public handle ────────────────────────────────────────────────────────────
export interface TimelineCanvasHandle {
  zoomTo(startMs: number, endMs: number): void;
  getVisibleRange(): { startMs: number; endMs: number };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface TimelineCanvasProps {
  currentTime: Cesium.JulianDate;
  defaultStartMs: number;
  defaultEndMs: number;
  height: number;
  theme: TimelineTheme;
  onTimeChange: (time: Cesium.JulianDate) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(
  (props, ref) => {
    const { currentTime, defaultStartMs, defaultEndMs, height, theme, onTimeChange, onDragStart, onDragEnd } = props;

    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const themeRef   = useRef(theme);
    useEffect(() => { themeRef.current = theme; }, [theme]);

    // Visible range – plain numbers in ms, stored as refs so draw() is always fresh
    // without being in React's dependency tracking.
    const startMsRef = useRef(defaultStartMs);
    const endMsRef   = useRef(defaultEndMs);
    const curMsRef   = useRef(Cesium.JulianDate.toDate(currentTime).getTime());

    // RAF handles
    const drawRAF  = useRef<number | null>(null);
    const edgeRAF  = useRef<number | null>(null);

    // Mouse interaction state
    const mouseMode = useRef<'none' | 'scrub' | 'slide' | 'zoom'>('none');
    const mouseX    = useRef(0);

    // ── Imperative handle ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomTo(startMs: number, endMs: number) {
        startMsRef.current = startMs;
        endMsRef.current   = endMs;
        scheduleDraw();
      },
      getVisibleRange() {
        return { startMs: startMsRef.current, endMs: endMsRef.current };
      },
    }));

    // ── Draw ──────────────────────────────────────────────────────────────
    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.clientWidth;
      const h   = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      // Keep physical pixel size in sync
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const t = themeRef.current;
      const startMs    = startMsRef.current;
      const endMs      = endMsRef.current;
      const currentMs  = curMsRef.current;
      const durationSec = (endMs - startMs) / 1000;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = t.backgroundColor;
      ctx.fillRect(0, 0, w, h);

      // ── Tick scale selection (Cesium algorithm) ──────────────────────
      ctx.font = `${t.fontSize}px monospace`;
      const sampleW  = ctx.measureText(makeLabel(startMs, durationSec)).width + 24;
      let idealTic   = (sampleW / w) * durationSec;
      if (idealTic <= 0) idealTic = durationSec;

      let mainTic = TIC_SCALES[TIC_SCALES.length - 1];
      let mainIdx = TIC_SCALES.length - 1;
      for (let i = 0; i < TIC_SCALES.length; i++) {
        if (TIC_SCALES[i] > idealTic) { mainTic = TIC_SCALES[i]; mainIdx = i; break; }
      }

      // sub-tic: largest scale < mainTic that evenly divides it and is wide enough
      let subTic = 0;
      for (let i = mainIdx - 1; i >= 0; i--) {
        if (Math.abs(mainTic % TIC_SCALES[i]) < 0.0001) {
          if (w * (TIC_SCALES[i] / durationSec) >= 3) subTic = TIC_SCALES[i];
          break;
        }
      }

      // tiny-tic: largest scale < subTic that evenly divides it
      let tinyTic = 0;
      if (subTic > 0) {
        for (let i = 0; i < TIC_SCALES.length && TIC_SCALES[i] < subTic; i++) {
          if (Math.abs(subTic % TIC_SCALES[i]) < 0.0001 && w * (TIC_SCALES[i] / durationSec) >= 3) {
            tinyTic = TIC_SCALES[i];
            break;
          }
        }
      }

      // Epoch: a round time near startMs (same logic as Cesium)
      const epochMs    = calcEpochMs(startMs, durationSec);
      const startOff   = (startMs - epochMs) / 1000;   // seconds from epoch to visible start
      const endOff     = startOff + durationSec;

      const ticX = (t: number) =>
        Math.round(w * ((t - startOff) / durationSec));

      // ── Draw tiny ticks ──────────────────────────────────────────────
      if (tinyTic > 0) {
        ctx.strokeStyle = t.tickColor;
        ctx.lineWidth   = 1;
        for (let s = Math.floor(startOff / tinyTic) * tinyTic; s <= endOff; s = nextTic(s, tinyTic)) {
          const x = ticX(s);
          ctx.beginPath(); ctx.moveTo(x, h - t.minorTickHeight); ctx.lineTo(x, h); ctx.stroke();
        }
      }

      // ── Draw sub ticks ───────────────────────────────────────────────
      if (subTic > 0) {
        ctx.strokeStyle = t.tickColor;
        ctx.lineWidth   = 1;
        for (let s = Math.floor(startOff / subTic) * subTic; s <= endOff; s = nextTic(s, subTic)) {
          const x = ticX(s);
          ctx.beginPath(); ctx.moveTo(x, h - t.minorTickHeight); ctx.lineTo(x, h); ctx.stroke();
        }
      }

      // ── Draw main ticks + labels ─────────────────────────────────────
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      let lastLabelRight = -999999;

      for (let s = Math.floor(startOff / mainTic) * mainTic; s <= endOff + mainTic; s = nextTic(s, mainTic)) {
        const x      = ticX(s);
        const ticMs  = epochMs + s * 1000;

        // Tick line
        ctx.strokeStyle = t.majorTickColor;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(x, h - t.majorTickHeight); ctx.lineTo(x, h); ctx.stroke();

        // Label
        const label   = makeLabel(ticMs, durationSec);
        const textW   = ctx.measureText(label).width;
        const labelLeft = x - textW / 2;
        if (labelLeft > lastLabelRight) {
          ctx.fillStyle = t.labelColor;
          ctx.fillText(label, x, h - t.majorTickHeight - 4);
          lastLabelRight = labelLeft + textW + 5;
        }
      }

      // ── Draw needle ──────────────────────────────────────────────────
      const needleX = ((currentMs - startMs) / (endMs - startMs)) * w;
      ctx.strokeStyle = t.indicatorColor;
      ctx.lineWidth   = t.indicatorLineWidth;
      ctx.beginPath(); ctx.moveTo(needleX, 0); ctx.lineTo(needleX, h); ctx.stroke();

      ctx.fillStyle = t.indicatorColor;
      ctx.beginPath(); ctx.arc(needleX, 8, 5, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }, []);  // refs only — no deps needed

    const scheduleDraw = useCallback(() => {
      if (drawRAF.current !== null) return;
      drawRAF.current = requestAnimationFrame(() => { drawRAF.current = null; draw(); });
    }, [draw]);

    // ── Update current time ───────────────────────────────────────────
    useEffect(() => {
      curMsRef.current = Cesium.JulianDate.toDate(currentTime).getTime();
      scheduleDraw();
    }, [currentTime, scheduleDraw]);

    // ── Initial draw + resize ─────────────────────────────────────────
    useEffect(() => {
      scheduleDraw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => scheduleDraw());
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [scheduleDraw]);

    // ── Edge-drag scroll loop ─────────────────────────────────────────
    const startEdgeScroll = useCallback((direction: -1 | 1) => {
      if (edgeRAF.current !== null) return;
      const scroll = () => {
        const span  = endMsRef.current - startMsRef.current;
        const shift = direction * span * 0.005; // 0.5% per frame ≈ ~30% / sec at 60fps
        startMsRef.current += shift;
        endMsRef.current   += shift;
        draw();
        edgeRAF.current = requestAnimationFrame(scroll);
      };
      edgeRAF.current = requestAnimationFrame(scroll);
    }, [draw]);

    const stopEdgeScroll = useCallback(() => {
      if (edgeRAF.current !== null) { cancelAnimationFrame(edgeRAF.current); edgeRAF.current = null; }
    }, []);

    // ── Mouse handlers ────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.button === 0) {
        mouseMode.current = 'scrub';
        onDragStart?.();
        // Immediately set time to click position
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const x    = e.clientX - rect.left;
        const w    = rect.width;
        const ms   = startMsRef.current + (x / w) * (endMsRef.current - startMsRef.current);
        onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
      } else if (e.button === 1 || e.button === 2) {
        mouseMode.current = e.button === 2 ? 'zoom' : 'slide';
        mouseX.current    = e.clientX;
      }
    }, [onTimeChange, onDragStart]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || mouseMode.current === 'none') return;

        const rect = canvas.getBoundingClientRect();
        const w    = rect.width;

        if (mouseMode.current === 'scrub') {
          const x = e.clientX - rect.left;
          if (x < 0) {
            // Past left edge — clamp needle, start scrolling left
            startEdgeScroll(-1);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(startMsRef.current)));
          } else if (x > w) {
            // Past right edge — clamp needle, start scrolling right
            startEdgeScroll(1);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(endMsRef.current)));
          } else {
            stopEdgeScroll();
            const ms = startMsRef.current + (x / w) * (endMsRef.current - startMsRef.current);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
          }
        } else if (mouseMode.current === 'slide') {
          const dx   = mouseX.current - e.clientX;
          mouseX.current = e.clientX;
          if (dx !== 0) {
            const span  = endMsRef.current - startMsRef.current;
            const shift = (dx / w) * span;
            startMsRef.current += shift;
            endMsRef.current   += shift;
            scheduleDraw();
          }
        } else if (mouseMode.current === 'zoom') {
          const dx = mouseX.current - e.clientX;
          mouseX.current = e.clientX;
          if (dx !== 0) zoomFrom(Math.pow(1.01, dx));
        }
      };

      const onMouseUp = () => {
        stopEdgeScroll();
        mouseMode.current = 'none';
        onDragEnd?.();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
      return () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
      };
    }, [onTimeChange, onDragEnd, scheduleDraw, startEdgeScroll, stopEdgeScroll]);

    // Zoom around current scrub position (mirrors Cesium's zoomFrom)
    const zoomFrom = useCallback((amount: number) => {
      const startMs    = startMsRef.current;
      const endMs      = endMsRef.current;
      const span       = endMs - startMs;
      const centerMs   = startMs + span * 0.5;
      const centerSec  = (centerMs - startMs) / 1000;
      const flipSec    = span / 1000 - centerSec;
      startMsRef.current = startMs + (centerSec - centerSec * amount) * 1000;
      endMsRef.current   = endMs   + (flipSec * amount - flipSec)     * 1000;
      scheduleDraw();
    }, [scheduleDraw]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const dy = e.deltaY || -e.detail;
      zoomFrom(Math.pow(1.05, dy > 0 ? -1 : 1));
    }, [zoomFrom]);

    // Cleanup on unmount
    useEffect(() => () => {
      if (drawRAF.current !== null) cancelAnimationFrame(drawRAF.current);
      if (edgeRAF.current !== null) cancelAnimationFrame(edgeRAF.current);
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />
    );
  }
);

TimelineCanvas.displayName = 'TimelineCanvas';
