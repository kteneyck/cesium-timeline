import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { DebugElement } from "@angular/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimelineControlsComponent } from "./timeline-controls.component";
import { defaultTheme, DEFAULT_LABELS } from "@kteneyck/cesium-timeline-core";
import * as Cesium from "cesium";

vi.mock("cesium", () => {
  const dates = new Map();
  let id = 0;
  class JulianDate {
    constructor(d) { this._id = ++id; if (d) dates.set(this._id, d); }
    static fromDate(d) { return new JulianDate(d); }
    static toDate(jd) { return dates.get(jd._id) ?? new Date(); }
    static clone(jd) { return JulianDate.fromDate(JulianDate.toDate(jd)); }
  }
  return { JulianDate };
});

function findBtnDE(fixture, text) {
  const btns = fixture.debugElement.queryAll(By.css("button"));
  return btns.find(b => b.nativeElement.textContent?.includes(text)) ?? null;
}

function findBtnByTitle(fixture, title) {
  return fixture.debugElement.query(By.css(`button[title="${title}"]`));
}

describe("TimelineControlsComponent", () => {
  let fixture;
  let component;

  function setInputs(overrides = {}) {
    component.currentTime = Cesium.JulianDate.fromDate(new Date("2026-02-24T14:04:07Z"));
    component.isPlaying = false;
    component.multiplier = 1;
    component.isLive = false;
    component.hasStartTime = true;
    component.hasEndTime = true;
    component.theme = defaultTheme;
    Object.assign(component, overrides);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineControlsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TimelineControlsComponent);
    component = fixture.componentInstance;
  });

  it("renders without crashing", () => {
    setInputs();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it("shows LIVE label when not live", () => {
    setInputs({ isLive: false });
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_LABELS.liveLabel);
  });

  it("shows active LIVE label when live", () => {
    setInputs({ isLive: true });
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_LABELS.liveActiveLabel);
  });

  it("hides the LIVE button when showLive is false", () => {
    setInputs({ showLive: false });
    expect(findBtnDE(fixture, DEFAULT_LABELS.liveLabel)).toBeNull();
  });

  it("still shows the speed reset badge when showLive is false", () => {
    setInputs({ showLive: false, multiplier: 4 });
    expect(findBtnDE(fixture, DEFAULT_LABELS.liveLabel)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("4×");
  });

  it("emits jumpToLive when LIVE button clicked", () => {
    setInputs({ isLive: false });
    const emitted = [];
    component.jumpToLive.subscribe(() => emitted.push(1));
    findBtnDE(fixture, "LIVE")?.triggerEventHandler("click", null);
    expect(emitted.length).toBeGreaterThan(0);
  });

  it("emits playPause(true) when play button clicked while stopped", () => {
    setInputs({ isPlaying: false });
    const values = [];
    component.playPause.subscribe(v => values.push(v));
    findBtnByTitle(fixture, DEFAULT_LABELS.playTooltip).triggerEventHandler("click", null);
    expect(values).toContain(true);
  });

  it("hides speed badge when multiplier=1", () => {
    setInputs({ multiplier: 1 });
    expect(findBtnDE(fixture, "\u00D7 \u25B6")).toBeNull();
  });

  it("shows speed badge when multiplier != 1", () => {
    setInputs({ multiplier: 4 });
    expect(fixture.nativeElement.textContent).toContain("4\u00D7");
  });

  it("opens the speed overlay when the speed badge is clicked", () => {
    setInputs({ multiplier: 4 });
    expect(fixture.nativeElement.querySelector("input[type=range]")).toBeNull();
    findBtnDE(fixture, "4\u00D7")?.triggerEventHandler("click", null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("input[type=range]")).not.toBeNull();
  });

  it("emits setSpeed when the overlay slider changes", () => {
    setInputs({ multiplier: 4 });
    const emitted = [];
    component.setSpeed.subscribe(v => emitted.push(v));
    findBtnDE(fixture, "4\u00D7")?.triggerEventHandler("click", null);
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector("input[type=range]");
    slider.value = "10";
    slider.dispatchEvent(new Event("input"));
    expect(emitted).toEqual([10]);
  });

  it("allows a number input value above maxSpeed and applies it as-is on blur", () => {
    setInputs({ multiplier: 4 });
    const emitted = [];
    component.setSpeed.subscribe(v => emitted.push(v));
    findBtnDE(fixture, "4×")?.triggerEventHandler("click", null);
    fixture.detectChanges();
    const numberInput = fixture.nativeElement.querySelector("input[type=number]");
    numberInput.value = "500";
    numberInput.dispatchEvent(new Event("input"));
    numberInput.dispatchEvent(new Event("blur"));
    fixture.detectChanges();
    expect(emitted).toEqual([500]);
    expect(numberInput.value).toBe("500");
  });

  it("emits resetSpeed when the overlay reset link is clicked", () => {
    setInputs({ multiplier: 4 });
    const emitted = [];
    component.resetSpeed.subscribe(() => emitted.push(1));
    findBtnDE(fixture, "4\u00D7")?.triggerEventHandler("click", null);
    fixture.detectChanges();
    findBtnDE(fixture, DEFAULT_LABELS.resetSpeedLabel)?.triggerEventHandler("click", null);
    expect(emitted.length).toBe(1);
  });

  it("applies custom labels from labels input", () => {
    setInputs({ isLive: false, labels: { liveLabel: "EN DIRECT" } });
    expect(fixture.nativeElement.textContent).toContain("EN DIRECT");
  });

  it("emits rewind when clicked", () => {
    setInputs();
    const emitted = [];
    component.rewind.subscribe(() => emitted.push(1));
    findBtnByTitle(fixture, DEFAULT_LABELS.rewindTooltip).triggerEventHandler("click", null);
    expect(emitted.length).toBe(1);
  });

  it("emits fastForward when clicked", () => {
    setInputs();
    const emitted = [];
    component.fastForward.subscribe(() => emitted.push(1));
    findBtnByTitle(fixture, DEFAULT_LABELS.fastForwardTooltip).triggerEventHandler("click", null);
    expect(emitted.length).toBe(1);
  });

  it("renders transport controls as SVG icons, not text glyphs", () => {
    setInputs();
    const titles = [
      DEFAULT_LABELS.jumpToStartTooltip,
      DEFAULT_LABELS.rewindTooltip,
      DEFAULT_LABELS.playTooltip,
      DEFAULT_LABELS.fastForwardTooltip,
      DEFAULT_LABELS.jumpToEndTooltip,
    ];
    for (const title of titles) {
      const btn = findBtnByTitle(fixture, title).nativeElement;
      expect(btn.querySelector("svg")).not.toBeNull();
      expect(btn.textContent.trim()).toBe("");
    }
  });

  describe("compact (two-row) layout", () => {
    const OriginalResizeObserver = global.ResizeObserver;
    let roCallback;

    beforeEach(() => {
      global.ResizeObserver = class {
        constructor(cb) { roCallback = cb; }
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    });

    afterEach(() => {
      global.ResizeObserver = OriginalResizeObserver;
    });

    /** Render, then report a phone-sized container so the controls switch to the compact layout. */
    function setNarrowInputs(overrides = {}) {
      setInputs(overrides);
      roCallback([{ contentRect: { width: 360 } }]);
      fixture.detectChanges();
    }

    function root() {
      return fixture.nativeElement.querySelector("[data-layout]");
    }

    it("splits status and transport into two rows", () => {
      setNarrowInputs({ swimLanesVisible: true });
      expect(root().dataset.layout).toBe("compact");
      expect(root().style.flexDirection).toBe("column");

      const [statusRow, transportRow] = Array.from(root().children);
      expect(statusRow.textContent).toContain(DEFAULT_LABELS.liveLabel);
      expect(statusRow.querySelector(`[title="${DEFAULT_LABELS.collapseSwimLanesTooltip}"]`)).not.toBeNull();
      expect(transportRow.querySelector(`[title="${DEFAULT_LABELS.jumpToStartTooltip}"]`)).not.toBeNull();
      expect(transportRow.querySelector(`[title="${DEFAULT_LABELS.jumpToEndTooltip}"]`)).not.toBeNull();
      expect(transportRow.style.justifyContent).toBe("space-evenly");
    });

    it("marks the container for compact transport button sizing", () => {
      setNarrowInputs();
      expect(root().classList.contains("ct-narrow")).toBe(true);
      expect(root().querySelector(".ct-transport .ct-btn")).not.toBeNull();
    });

    it("keeps the speed badge reachable in the status row", () => {
      setNarrowInputs({ multiplier: 4 });
      const [statusRow] = Array.from(root().children);
      expect(statusRow.querySelector("[data-speed-badge]")).not.toBeNull();
    });

    it("omits the transport row in live mode", () => {
      setNarrowInputs({ live: true });
      expect(root().children).toHaveLength(1);
      expect(findBtnByTitle(fixture, DEFAULT_LABELS.rewindTooltip)).toBeNull();
    });

    it("returns to the full layout when widened", () => {
      setNarrowInputs();
      roCallback([{ contentRect: { width: 900 } }]);
      fixture.detectChanges();
      expect(root().dataset.layout).toBe("full");
      expect(root().style.display).toBe("grid");
    });
  });
});
