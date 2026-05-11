import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import * as Cesium from 'cesium';
import {
  type TimelineTheme,
  type SwimLane,
  type SwimLaneItem,
  type SwimLaneEventInfo,
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
  totalSwimLaneHeight,
} from '@kteneyck/cesium-timeline-core';

export { TICK_AREA_HEIGHT };

/**
 * TimelineCanvasComponent – Angular wrapper around the core canvas rendering engine.
 *
 * All mutable state lives as class properties (equivalent to React refs) — no
 * change detection cycles are triggered from drawing or mouse handlers.
 * The core drawTimeline() function handles all rendering.
 */
@Component({
  selector: 'ct-timeline-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas
    style="width:100%;flex:1;min-height:0;display:block;cursor:default"
    (mousedown)="onCanvasMouseDown($event)"
    (mousemove)="onCanvasMouseMove($event)"
    (click)="onCanvasClick($event)"
    (dblclick)="onCanvasDblClick($event)"
    (contextmenu)="onCanvasContextMenu($event)"
    (mouseleave)="onCanvasMouseLeave()"
  ></canvas>`,
  styles: [`:host { display: flex; flex: 1; min-height: 0; }`],
})
export class TimelineCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() currentTime!: Cesium.JulianDate;
  @Input() defaultStartMs!: number;
  @Input() defaultEndMs!: number;
  @Input() theme!: TimelineTheme;
  @Input() maxTicks?: number;
  @Input() swimLanes?: SwimLane[];
  @Input() showSwimLanes?: boolean;

  @Output() timeChange = new EventEmitter<Cesium.JulianDate>();
  @Output() dragStart = new EventEmitter<void>();
  @Output() dragEnd = new EventEmitter<void>();
  @Output() swimLaneItemClick = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneItemHover = new EventEmitter<SwimLaneEventInfo | null>();
  @Output() swimLaneItemDoubleClick = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneItemContextMenu = new EventEmitter<SwimLaneEventInfo>();
  @Output() swimLaneReorder = new EventEmitter<string[]>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // ── Mutable render state (equivalent to React refs) ────────────────────
  private startMs = 0;
  private endMs = 0;
  private curMs = 0;
  private scrollTop = 0;
  private swimLanesState: SwimLane[] = [];
  private showSwimLanesState = false;
  private hoveredItem: { lane: SwimLane; item: SwimLaneItem } | null = null;
  private reorderState: ReorderState | null = null;

  // Mouse state
  private mouseMode: 'none' | 'scrub' | 'slide' | 'zoom' = 'none';
  private mouseX = 0;
  private scrubClientX = 0;
  private swimLaneDownTime = 0;

  // Touch state
  private touchMode: 'none' | 'scrub' | 'slide' | 'pinch' = 'none';
  private touchX = 0;
  private pinchDist = 0;

  // Edge-scroll animation
  private edgeRAF: number | null = null;

  // Follow-scroll (playback auto-scroll)
  private followRAF: number | null = null;
  private following = false;
  private followRate = 0;

  private ro?: ResizeObserver;

  // Bound handlers for cleanup
  private boundMouseMove = this.onDocMouseMove.bind(this);
  private boundMouseUp = this.onDocMouseUp.bind(this);
  private boundTouchStart = this.onTouchStart.bind(this);
  private boundTouchMove = this.onTouchMove.bind(this);
  private boundTouchEnd = this.onTouchEnd.bind(this);
  private boundWheel = this.onWheel.bind(this);

  constructor(private ngZone: NgZone) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.startMs = this.defaultStartMs;
    this.endMs = this.defaultEndMs;
    this.curMs = Cesium.JulianDate.toDate(this.currentTime).getTime();
    this.swimLanesState = this.swimLanes ?? [];
    this.showSwimLanesState = this.showSwimLanes ?? (this.swimLanesState.length > 0);

    // Run outside Angular zone for performance — no change detection on draw/mouse
    this.ngZone.runOutsideAngular(() => {
      this.draw();

      const canvas = this.canvasRef.nativeElement;
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);

      document.addEventListener('mousemove', this.boundMouseMove);
      document.addEventListener('mouseup', this.boundMouseUp);
      canvas.addEventListener('wheel', this.boundWheel, { passive: false });
      canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
      canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentTime'] && !this.following) {
      const newMs = Cesium.JulianDate.toDate(this.currentTime).getTime();
      if (this.curMs !== newMs) {
        this.curMs = newMs;
        this.draw();
      }
    }
    if (changes['theme'] || changes['maxTicks']) {
      this.draw();
    }
    if (changes['swimLanes']) {
      this.swimLanesState = this.swimLanes ?? [];
      this.draw();
    }
    if (changes['showSwimLanes']) {
      this.showSwimLanesState = this.showSwimLanes ?? (this.swimLanesState.length > 0);
      this.draw();
    }
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('wheel', this.boundWheel);
      canvas.removeEventListener('touchstart', this.boundTouchStart);
      canvas.removeEventListener('touchmove', this.boundTouchMove);
      canvas.removeEventListener('touchend', this.boundTouchEnd);
    }

    if (this.edgeRAF !== null) cancelAnimationFrame(this.edgeRAF);
    if (this.followRAF !== null) cancelAnimationFrame(this.followRAF);
  }

  // ── Public API (called by parent via ViewChild) ────────────────────────

  zoomTo(startMs: number, endMs: number, currentMs?: number): void {
    const span = Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, endMs - startMs));
    const center = (startMs + endMs) / 2;
    this.startMs = center - span / 2;
    this.endMs = center + span / 2;
    if (currentMs !== undefined) this.curMs = currentMs;
    this.draw();
  }

  getVisibleRange(): { startMs: number; endMs: number } {
    return { startMs: this.startMs, endMs: this.endMs };
  }

  startFollow(rate: number): void {
    this.followRate = rate;
    if (this.followRAF !== null) return;
    this.following = true;
    let lastTime = performance.now();

    const scroll = () => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      const shift = dt * this.followRate;
      this.startMs += shift;
      this.endMs += shift;
      this.curMs += shift;
      this.draw();
      this.followRAF = requestAnimationFrame(scroll);
    };
    this.followRAF = requestAnimationFrame(scroll);
  }

  stopFollow(): void {
    this.following = false;
    if (this.followRAF !== null) {
      cancelAnimationFrame(this.followRAF);
      this.followRAF = null;
    }
  }

  correctFollow(currentMs: number): void {
    if (!this.following) return;
    const drift = currentMs - this.curMs;
    this.curMs = currentMs;
    this.startMs += drift;
    this.endMs += drift;
  }

  appendSwimLane(lane: SwimLane): void {
    this.swimLanesState = [...this.swimLanesState, lane];
    this.draw();
  }

  updateSwimLane(id: string, updates: Partial<SwimLane>): void {
    this.swimLanesState = this.swimLanesState.map(l =>
      l.id === id ? { ...l, ...updates, id: l.id } : l
    );
    this.draw();
  }

  removeSwimLane(id: string): void {
    this.swimLanesState = this.swimLanesState.filter(l => l.id !== id);
    this.draw();
  }

  reorderSwimLanes(orderedIds: string[]): void {
    const byId = new Map(this.swimLanesState.map(l => [l.id, l]));
    const reordered: SwimLane[] = [];
    for (const id of orderedIds) {
      const lane = byId.get(id);
      if (lane) reordered.push(lane);
    }
    this.swimLanesState = reordered;
    this.draw();
  }

  // ── Core draw ──────────────────────────────────────────────────────────

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const physW = Math.round(w * dpr);
    const physH = Math.round(h * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const clampedScrollTop = drawTimeline(ctx, w, h, {
      startMs: this.startMs,
      endMs: this.endMs,
      currentMs: this.curMs,
      theme: this.theme,
      maxTicks: this.maxTicks,
      swimLanes: this.swimLanesState,
      showSwimLanes: this.showSwimLanesState,
      scrollTop: this.scrollTop,
      reorderState: this.reorderState,
    });

    if (clampedScrollTop !== this.scrollTop) {
      this.scrollTop = clampedScrollTop;
    }

    ctx.restore();
  }

  // ── Hit testing (delegates to core) ────────────────────────────────────

  private hitTestSwimLane(x: number, y: number, w: number, h: number) {
    return coreHitTestSwimLane(x, y, w, h, {
      startMs: this.startMs, endMs: this.endMs,
      theme: this.theme,
      swimLanes: this.swimLanesState, showSwimLanes: this.showSwimLanesState,
      scrollTop: this.scrollTop,
    });
  }

  private hitTestLaneLabel(x: number, y: number, h: number) {
    return coreHitTestLaneLabel(x, y, h, {
      swimLanes: this.swimLanesState, showSwimLanes: this.showSwimLanesState,
      scrollTop: this.scrollTop,
    });
  }

  private isInSwimLaneRegion(y: number, h: number): boolean {
    return coreIsInSwimLaneRegion(y, h, {
      swimLanes: this.swimLanesState, showSwimLanes: this.showSwimLanesState,
    });
  }

  // ── Zoom helper ────────────────────────────────────────────────────────

  private zoomFrom(amount: number): void {
    const result = zoomRange(this.startMs, this.endMs, amount);
    this.startMs = result.startMs;
    this.endMs = result.endMs;
    this.draw();
  }

  // ── Edge scroll ────────────────────────────────────────────────────────

  private startEdgeScroll(direction: -1 | 1): void {
    if (this.edgeRAF !== null) return;
    const scroll = () => {
      const canvas = this.canvasRef?.nativeElement;
      const span = this.endMs - this.startMs;
      const shift = direction * span * 0.01;
      this.startMs += shift;
      this.endMs += shift;

      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = Math.max(0, Math.min(rect.width, this.scrubClientX - rect.left));
        const ms = this.startMs + (cx / rect.width) * (this.endMs - this.startMs);
        this.curMs = ms;
        this.ngZone.run(() => this.timeChange.emit(Cesium.JulianDate.fromDate(new Date(ms))));
      }

      this.draw();
      this.edgeRAF = requestAnimationFrame(scroll);
    };
    this.edgeRAF = requestAnimationFrame(scroll);
  }

  private stopEdgeScroll(): void {
    if (this.edgeRAF !== null) {
      cancelAnimationFrame(this.edgeRAF);
      this.edgeRAF = null;
    }
  }

  private getTouchDist(a: Touch, b: Touch): number {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  // ── Mouse handlers (template-bound) ────────────────────────────────────

  onCanvasMouseDown(e: MouseEvent): void {
    e.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Reorder drag on lane label
    if (e.button === 0 && this.swimLaneReorder.observed) {
      const labelLane = this.hitTestLaneLabel(x, y, rect.height);
      if (labelLane) {
        const lanes = this.swimLanesState;
        const dragIdx = lanes.findIndex(l => l.id === labelLane.id);
        this.reorderState = {
          dragging: true,
          dragLaneId: labelLane.id,
          dragStartY: e.clientY,
          currentY: e.clientY,
          insertIndex: dragIdx,
        };
        canvas.style.cursor = 'grabbing';
        return;
      }
    }

    // Swim lane item click detection
    if (e.button === 0 && this.isInSwimLaneRegion(y, rect.height)) {
      const needleX = ((this.curMs - this.startMs) / (this.endMs - this.startMs)) * rect.width;
      const nearNeedle = Math.abs(x - needleX) <= 10;
      if (!nearNeedle) {
        const hit = this.hitTestSwimLane(x, y, rect.width, rect.height);
        if (hit) {
          this.swimLaneDownTime = performance.now();
          return;
        }
      }
    }

    if (e.button === 0) {
      this.mouseMode = 'scrub';
      this.scrubClientX = e.clientX;
      canvas.style.cursor = 'grabbing';
      this.ngZone.run(() => this.dragStart.emit());
      const ms = this.startMs + (x / rect.width) * (this.endMs - this.startMs);
      this.curMs = ms;
      this.draw();
      this.ngZone.run(() => this.timeChange.emit(Cesium.JulianDate.fromDate(new Date(ms))));
    } else if (e.button === 1) {
      this.mouseMode = 'slide';
      this.mouseX = e.clientX;
    } else if (e.button === 2) {
      if (this.swimLaneItemContextMenu.observed && this.isInSwimLaneRegion(y, rect.height)) return;
      this.mouseMode = 'zoom';
      this.mouseX = e.clientX;
    }
  }

  private onDocMouseMove(e: MouseEvent): void {
    // Reorder drag
    const rs = this.reorderState;
    if (rs && rs.dragging) {
      rs.currentY = e.clientY;
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasY = e.clientY - rect.top;
        let y = -this.scrollTop;
        const lanes = this.swimLanesState;
        let idx = lanes.length;
        for (let i = 0; i < lanes.length; i++) {
          const laneH = lanes[i].height ?? DEFAULT_LANE_HEIGHT;
          const mid = y + laneH / 2;
          if (canvasY < mid) { idx = i; break; }
          y += laneH + LANE_GAP;
        }
        rs.insertIndex = idx;
      }
      this.draw();
      return;
    }

    if (this.mouseMode === 'none') return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;

    if (this.mouseMode === 'scrub') {
      this.scrubClientX = e.clientX;
      const x = e.clientX - rect.left;
      const edge = w * 0.08;
      if (x < edge) this.startEdgeScroll(-1);
      else if (x > w - edge) this.startEdgeScroll(1);
      else this.stopEdgeScroll();
      const cx = Math.max(0, Math.min(w, x));
      const ms = this.startMs + (cx / w) * (this.endMs - this.startMs);
      this.curMs = ms;
      this.draw();
      this.ngZone.run(() => this.timeChange.emit(Cesium.JulianDate.fromDate(new Date(ms))));
    } else if (this.mouseMode === 'slide') {
      const dx = this.mouseX - e.clientX;
      this.mouseX = e.clientX;
      if (dx !== 0) {
        const shift = (dx / w) * (this.endMs - this.startMs);
        this.startMs += shift;
        this.endMs += shift;
        this.draw();
      }
    } else if (this.mouseMode === 'zoom') {
      const dx = this.mouseX - e.clientX;
      this.mouseX = e.clientX;
      if (dx !== 0) this.zoomFrom(Math.pow(1.01, dx));
    }
  }

  private onDocMouseUp(): void {
    // Finish reorder drag
    const rs = this.reorderState;
    if (rs && rs.dragging) {
      const dragDistance = Math.abs(rs.currentY - rs.dragStartY);
      const lanes = this.swimLanesState;
      const dragIdx = lanes.findIndex(l => l.id === rs.dragLaneId);
      if (dragDistance > 5 && dragIdx >= 0 && rs.insertIndex !== dragIdx && rs.insertIndex !== dragIdx + 1) {
        const newLanes = [...lanes];
        const [removed] = newLanes.splice(dragIdx, 1);
        const insertAt = rs.insertIndex > dragIdx ? rs.insertIndex - 1 : rs.insertIndex;
        newLanes.splice(insertAt, 0, removed);
        this.swimLanesState = newLanes;
        this.ngZone.run(() => this.swimLaneReorder.emit(newLanes.map(l => l.id)));
      }
      this.reorderState = null;
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) canvas.style.cursor = 'default';
      this.draw();
      return;
    }

    this.stopEdgeScroll();
    this.mouseMode = 'none';
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) canvas.style.cursor = 'default';
    this.ngZone.run(() => this.dragEnd.emit());
  }

  onCanvasMouseMove(e: MouseEvent): void {
    if (this.mouseMode !== 'none') return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const needleX = ((this.curMs - this.startMs) / (this.endMs - this.startMs)) * rect.width;
    const nearNeedle = Math.abs(x - needleX) <= 10;

    if (this.isInSwimLaneRegion(y, rect.height)) {
      const hit = this.hitTestSwimLane(x, y, rect.width, rect.height);
      const prev = this.hoveredItem;
      if (hit) {
        canvas.style.cursor = nearNeedle ? 'grab' : 'pointer';
        if (!prev || prev.item.id !== hit.item.id || prev.lane.id !== hit.lane.id) {
          this.hoveredItem = hit;
          this.ngZone.run(() =>
            this.swimLaneItemHover.emit({ laneId: hit.lane.id, item: hit.item, originalEvent: e })
          );
          this.draw();
        }
      } else {
        if (prev) {
          this.hoveredItem = null;
          this.ngZone.run(() => this.swimLaneItemHover.emit(null));
          this.draw();
        }
        if (nearNeedle) {
          canvas.style.cursor = 'grab';
        } else {
          const labelLane = this.hitTestLaneLabel(x, y, rect.height);
          canvas.style.cursor = labelLane && this.swimLaneReorder.observed ? 'grab' : 'default';
        }
      }
      return;
    }

    if (this.hoveredItem) {
      this.hoveredItem = null;
      this.ngZone.run(() => this.swimLaneItemHover.emit(null));
      this.draw();
    }

    canvas.style.cursor = nearNeedle ? 'grab' : 'default';
  }

  onCanvasClick(e: MouseEvent): void {
    const elapsed = performance.now() - this.swimLaneDownTime;
    if (elapsed > 300) return;

    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.hitTestSwimLane(x, y, rect.width, rect.height);
    if (hit) {
      this.ngZone.run(() =>
        this.swimLaneItemClick.emit({ laneId: hit.lane.id, item: hit.item, originalEvent: e })
      );
    }
  }

  onCanvasDblClick(e: MouseEvent): void {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.hitTestSwimLane(x, y, rect.width, rect.height);
    if (hit) {
      this.ngZone.run(() =>
        this.swimLaneItemDoubleClick.emit({ laneId: hit.lane.id, item: hit.item, originalEvent: e })
      );
    }
  }

  onCanvasContextMenu(e: MouseEvent): void {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.hitTestSwimLane(x, y, rect.width, rect.height);
    if (hit && this.swimLaneItemContextMenu.observed) {
      e.preventDefault();
      this.ngZone.run(() =>
        this.swimLaneItemContextMenu.emit({ laneId: hit.lane.id, item: hit.item, originalEvent: e })
      );
    } else {
      e.preventDefault();
    }
  }

  onCanvasMouseLeave(): void {
    if (this.hoveredItem) {
      this.hoveredItem = null;
      this.ngZone.run(() => this.swimLaneItemHover.emit(null));
      this.draw();
    }
    const canvas = this.canvasRef?.nativeElement;
    if (this.mouseMode === 'none' && canvas) canvas.style.cursor = 'default';
  }

  // ── Wheel handler ──────────────────────────────────────────────────────

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    if (this.isInSwimLaneRegion(y, rect.height)) {
      const lanes = this.swimLanesState;
      const totalH = totalSwimLaneHeight(lanes);
      const laneRegionH = Math.max(0, rect.height - TICK_AREA_HEIGHT);
      const maxScroll = Math.max(0, totalH - laneRegionH);
      if (maxScroll > 0) {
        this.scrollTop = Math.max(0, Math.min(maxScroll, this.scrollTop + e.deltaY * SWIM_LANE_SCROLL_SPEED));
        this.draw();
        return;
      }
    }

    this.zoomFrom(Math.pow(1.05, e.deltaY > 0 ? -1 : 1));
  }

  // ── Touch handlers ─────────────────────────────────────────────────────

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 1) {
      const x = e.touches[0].clientX - rect.left;
      const cx = Math.max(0, Math.min(rect.width, x));
      const ms = this.startMs + (cx / rect.width) * (this.endMs - this.startMs);
      this.touchMode = 'scrub';
      this.touchX = e.touches[0].clientX;
      this.scrubClientX = e.touches[0].clientX;
      this.curMs = ms;
      this.draw();
      this.ngZone.run(() => {
        this.dragStart.emit();
        this.timeChange.emit(Cesium.JulianDate.fromDate(new Date(ms)));
      });
    } else if (e.touches.length >= 2) {
      this.touchMode = 'pinch';
      this.pinchDist = this.getTouchDist(e.touches[0], e.touches[1]);
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    if (this.touchMode === 'scrub' && e.touches.length >= 1) {
      const x = e.touches[0].clientX - rect.left;
      const edge = rect.width * 0.08;
      this.scrubClientX = e.touches[0].clientX;

      if (x < edge) {
        this.startEdgeScroll(-1);
      } else if (x > rect.width - edge) {
        this.startEdgeScroll(1);
      } else {
        this.stopEdgeScroll();
        const cx = Math.max(0, Math.min(rect.width, x));
        const ms = this.startMs + (cx / rect.width) * (this.endMs - this.startMs);
        this.curMs = ms;
        this.draw();
        this.ngZone.run(() => this.timeChange.emit(Cesium.JulianDate.fromDate(new Date(ms))));
      }
    } else if (this.touchMode === 'slide' && e.touches.length >= 1) {
      const dx = this.touchX - e.touches[0].clientX;
      this.touchX = e.touches[0].clientX;
      if (dx !== 0) {
        const shift = (dx / rect.width) * (this.endMs - this.startMs);
        this.startMs += shift;
        this.endMs += shift;
        this.draw();
      }
    } else if (this.touchMode === 'pinch' && e.touches.length >= 2) {
      const newDist = this.getTouchDist(e.touches[0], e.touches[1]);
      if (newDist > 0 && this.pinchDist > 0) {
        this.zoomFrom(this.pinchDist / newDist);
      }
      this.pinchDist = newDist;
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    this.stopEdgeScroll();
    if (this.touchMode === 'scrub') {
      this.ngZone.run(() => this.dragEnd.emit());
    }

    if (e.touches.length === 0) {
      this.touchMode = 'none';
    } else if (e.touches.length === 1) {
      this.touchMode = 'slide';
      this.touchX = e.touches[0].clientX;
    }
  }
}
