import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { DebugElement } from "@angular/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    findBtnDE(fixture, "\u25B6")?.triggerEventHandler("click", null);
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

  it("emits resetSpeed when speed badge clicked", () => {
    setInputs({ multiplier: 4 });
    const emitted = [];
    component.resetSpeed.subscribe(() => emitted.push(1));
    findBtnDE(fixture, "4\u00D7")?.triggerEventHandler("click", null);
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
    findBtnDE(fixture, "\u25C0\u25C0")?.triggerEventHandler("click", null);
    expect(emitted.length).toBe(1);
  });

  it("emits fastForward when clicked", () => {
    setInputs();
    const emitted = [];
    component.fastForward.subscribe(() => emitted.push(1));
    findBtnDE(fixture, "\u25B6\u25B6")?.triggerEventHandler("click", null);
    expect(emitted.length).toBe(1);
  });
});
