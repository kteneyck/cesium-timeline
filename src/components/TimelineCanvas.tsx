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

// ─── Tick scales (identical to Cesium's timelineTicScales) ────────────────────
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
  const y  = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  const h  = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const s  = d.getUTCSeconds();
  const ms2 = d.getUTCMilliseconds();
  if (durationSec > 315360000) return `${y}`;
  if (durationSec > 31536000)  return `${MONTHS[mo]} ${y}`;
  if (durationSec > 604800)    return `${MONTHS[mo]} ${dy}`;
  if (durationSec > 3600)      return `${MONTHS[mo]} ${dy} ${twoD(h)}:${twoD(mi)}`;
  if (durationSec > 60)        return `${twoD(h)}:${twoD(mi)}:${twoD(s)}`;
  const msStr = ms2 > 0 ? `.${String(ms2).padStart(3, '0')}` : '';
  return `${twoD(h)}:${twoD(mi)}:${twoD(s)}${msStr}`;
}

// Pick a round epoch near startMs so tick offsets are clean integers (mirrors Cesium).
function calcEpochMs(startMs: number, durationSec: number): number {
  const d  = new Date(startMs);
  const y  = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dy = d.getUTCDate();
  if (durationSec > 315360000) return Date.UTC(Math.floor(y / 100) * 100, 0);
  if (durationSec > 31536000)  return Date.UTC(Math.floor(y / 10)  * 10,  0);
  if (durationSec > 86400)     return Date.UTC(y, 0);
  return Date.UTC(y, mo, dy);
}

// Advance to next tick boundary (identical to Cesium's getNextTic).
function nextTic(t: number, scale: number): number {
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
    const {
      currentTime, defaultStartMs, defaultEndMs,
      height, theme, onTimeChange, onDragStart, onDragEnd,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // All mutable rendering state in refs — no React re-renders triggered from here.
    const themeRef   = useRef(theme);
    const startMsRef = useRef(defaultStartMs);
    const endMsRef   = useRef(defaultEndMs);
    const curMsRef   = useRef(Cesium.JulianDate.toDate(currentTime).getTime());

    // Keep theme ref current
    useEffect(() => { themeRef.current = theme; }, [theme]);

    // Edge-scroll animation
    const edgeRAF = useRef<number | null>(null);

    // Mouse state
    const mouseMode = useRef<'none' | 'scrub' | 'slide' | 'zoom'>('none');
    const mouseX    = useRef(0);

    // ── Imperative handle (called by Timeline parent) ──────────────────────
    useImperativeHandle(ref, () => ({
      zoomTo(startMs: number, endMs: number) {
        startMsRef.current = startMs;
        endMsRef.current   = endMs;
        draw();
      },
      getVisibleRange() {
        return { startMs: startMsRef.current, endMs: endMsRef.current };
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

      ctx.fillStyle = t.indicatorColor;
      ctx.beginPath();
      ctx.arc(needleX, 8, 5, 0, Math.PI * 2);
      ctx.fill();

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
      curMsRef.current = Cesium.JulianDate.toDate(currentTime).getTime();
      draw();
    }, [currentTime, draw]);

    // ── Edge-scroll animation loop ────────────────────────────────────────
    const startEdgeScroll = useCallback((direction: -1 | 1) => {
      if (edgeRAF.current !== null) return;
      const scroll = () => {
        const span  = endMsRef.current - startMsRef.current;
        const shift = direction * span * 0.005;
        startMsRef.current += shift;
        endMsRef.current   += shift;
        draw();
        edgeRAF.current = requestAnimationFrame(scroll);
      };
      edgeRAF.current = requestAnimationFrame(scroll);
    }, [draw]);

    const stopEdgeScroll = useCallback(() => {
      if (edgeRAF.current !== null) {
        cancelAnimationFrame(edgeRAF.current);
        edgeRAF.current = null;
      }
    }, []);

    // ── Mouse handlers ────────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.button === 0) {
        mouseMode.current = 'scrub';
        onDragStart?.();
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const x    = e.clientX - rect.left;
        const ms   = startMsRef.current + (x / rect.width) * (endMsRef.current - startMsRef.current);
        onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
      } else if (e.button === 1) {
        mouseMode.current = 'slide';
        mouseX.current    = e.clientX;
      } else if (e.button === 2) {
        mouseMode.current = 'zoom';
        mouseX.current    = e.clientX;
      }
    }, [onTimeChange, onDragStart]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        if (mouseMode.current === 'none') return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const w    = rect.width;

        if (mouseMode.current === 'scrub') {
          const x = e.clientX - rect.left;
          if (x < 0) {
            startEdgeScroll(-1);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(startMsRef.current)));
          } else if (x > w) {
            startEdgeScroll(1);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(endMsRef.current)));
          } else {
            stopEdgeScroll();
            const ms = startMsRef.current + (x / w) * (endMsRef.current - startMsRef.current);
            onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));
          }
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
    }, [draw, onTimeChange, onDragEnd, startEdgeScroll, stopEdgeScroll]);

    // Zoom around center (mirrors Cesium's zoomFrom)
    const zoomFrom = useCallback((amount: number) => {
      const span      = endMsRef.current - startMsRef.current;
      const centerSec = span / 2000;
      const flipSec   = span / 2000;
      startMsRef.current += (centerSec - centerSec * amount) * 1000;
      endMsRef.current   += (flipSec   * amount - flipSec)   * 1000;
      draw();
    }, [draw]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      zoomFrom(Math.pow(1.05, e.deltaY > 0 ? -1 : 1));
    }, [zoomFrom]);

    // Cleanup RAF on unmount
    useEffect(() => () => {
      if (edgeRAF.current !== null) cancelAnimationFrame(edgeRAF.current);
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'default' }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />
    );
  }
);

TimelineCanvas.displayName = 'TimelineCanvas';
