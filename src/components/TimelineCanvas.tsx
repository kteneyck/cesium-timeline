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
}

// ─── Component ────────────────────────────────────────────────────────────────
export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(
  (props, ref) => {
    const {
      currentTime, defaultStartMs, defaultEndMs,
      height, theme, maxTicks, onTimeChange, onDragStart, onDragEnd,
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
        // Silently adjust for drift between RAF interpolation and the real clock.
        // No draw — the next RAF frame picks up the correction automatically.
        const drift = currentMs - curMsRef.current;
        curMsRef.current    = currentMs;
        startMsRef.current += drift;
        endMsRef.current   += drift;
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

    // ── Mouse handlers ────────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.button === 0) {
        mouseMode.current  = 'scrub';
        scrubClientX.current = e.clientX;
        e.currentTarget.style.cursor = 'grabbing';
        onDragStart?.();
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const x    = e.clientX - rect.left;
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
    }, [draw, onTimeChange, onDragStart]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
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
      zoomFrom(Math.pow(1.05, e.deltaY > 0 ? -1 : 1));
    }, [zoomFrom]);

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
          if (x < edge)                  startEdgeScroll(-1);
          else if (x > rect.width - edge) startEdgeScroll(1);
          else                            stopEdgeScroll();

          const cx = Math.max(0, Math.min(rect.width, x));
          const ms = startMsRef.current + (cx / rect.width) * (endMsRef.current - startMsRef.current);
          curMsRef.current = ms;
          draw();
          onTimeChange(Cesium.JulianDate.fromDate(new Date(ms)));

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
      const needleX = ((curMsRef.current - startMsRef.current) / (endMsRef.current - startMsRef.current)) * rect.width;
      e.currentTarget.style.cursor = Math.abs(x - needleX) <= 10 ? 'grab' : 'default';
    }, []);

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
        onMouseLeave={() => { if (mouseMode.current === 'none' && canvasRef.current) canvasRef.current.style.cursor = 'default'; }}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />
    );
  }
);

TimelineCanvas.displayName = 'TimelineCanvas';
