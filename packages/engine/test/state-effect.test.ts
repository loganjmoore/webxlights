import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { activeStates, renderState, type StateParams } from "../src/effects/state";
import { labelsFromTrack } from "../src/timing";
import type { FrameContext } from "../src/effects/types";
import type { ModelNode } from "../src/models/types";

const RED = rgba(255, 0, 0);
const BLUE = rgba(0, 0, 255);
const GREEN = rgba(0, 255, 0);

// A one-row model: node n sits at buffer x = n.
function nodes(count: number): ModelNode[] {
  return Array.from({ length: count }, (_, i) => ({
    bufX: i,
    bufY: 0,
    screenX: i,
    screenY: 0,
    string: 0,
    indexInString: i,
  }));
}

const ENTRIES = [
  { name: "eyesleft", nodes: "1,2" },
  { name: "eyesright", nodes: "4,5" },
  { name: "wink", nodes: "7" },
];

const DEFAULTS: StateParams = {
  stateDefinition: "State1",
  mode: "Default",
  useTimingTrack: true,
  timingTrack: "New Timing",
  state: "",
  colorMode: "Default",
};

function ctxAt(atMs: number, over: Partial<FrameContext> = {}): FrameContext {
  return {
    frameIndexInEffect: 0,
    positionInEffect01: atMs / 1000,
    seed: 1,
    clock: { atMs, startMs: 0, endMs: 1000, frameMs: 50 },
    data: { states: ENTRIES },
    nodes: nodes(10),
    ...over,
  };
}

function lit(buffer: RenderBuffer): number[] {
  const on: number[] = [];
  for (let x = 0; x < buffer.width; x++) if (buffer.getPixel(x, 0).a > 0) on.push(x);
  return on;
}

describe("State effect", () => {
  const track = labelsFromTrack([0, 400, 800, 1000], ["eyesleft", "eyesright", "wink"]);

  it("lights the nodes of the state named at the playhead", () => {
    const buffer = new RenderBuffer(10, 1);
    renderState(buffer, [RED], DEFAULTS, ctxAt(200, { data: { states: ENTRIES, timing: track } }));
    expect(lit(buffer)).toEqual([0, 1]); // node ranges are one-based: "1,2" is nodes 0 and 1
    expect(buffer.getPixel(0, 0)).toEqual(RED);
  });

  it("changes state as the playhead moves through the track", () => {
    const at = (ms: number): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderState(buffer, [RED], DEFAULTS, ctxAt(ms, { data: { states: ENTRIES, timing: track } }));
      return lit(buffer);
    };
    expect(at(200)).toEqual([0, 1]);
    expect(at(500)).toEqual([3, 4]);
    expect(at(900)).toEqual([6]);
  });

  it("renders nothing where the track has no label", () => {
    const buffer = new RenderBuffer(10, 1);
    const gappy = labelsFromTrack([0, 200, 800, 1000], ["eyesleft", "", "wink"]);
    renderState(buffer, [RED], DEFAULTS, ctxAt(500, { data: { states: ENTRIES, timing: gappy } }));
    expect(lit(buffer)).toEqual([]);
  });

  it("holds one chosen state when no timing track drives it", () => {
    const buffer = new RenderBuffer(10, 1);
    const params = { ...DEFAULTS, useTimingTrack: false, state: "wink" };
    renderState(buffer, [RED], params, ctxAt(500, { data: { states: ENTRIES, timing: track } }));
    expect(lit(buffer)).toEqual([6]);
  });

  it("turns on every state a label names", () => {
    const buffer = new RenderBuffer(10, 1);
    const params = { ...DEFAULTS, useTimingTrack: false, state: "eyesleft,wink" };
    renderState(buffer, [RED], params, ctxAt(500));
    expect(lit(buffer)).toEqual([0, 1, 6]);
  });

  it("Iterate loops the labels evenly across the effect, ignoring where the cells fall", () => {
    // The track's own cells are 0-400, 400-800, 800-1000; Iterate divides the effect into three
    // equal parts instead, which is the whole difference between the two modes.
    const params = { ...DEFAULTS, mode: "Iterate" as const };
    const at = (ms: number): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderState(buffer, [RED], params, ctxAt(ms, { data: { states: ENTRIES, timing: track } }));
      return lit(buffer);
    };
    expect(at(100)).toEqual([0, 1]);
    expect(at(500)).toEqual([3, 4]);
    expect(at(700)).toEqual([6]);
  });

  it("renders nothing when the model has no state definitions", () => {
    const buffer = new RenderBuffer(10, 1);
    renderState(buffer, [RED], DEFAULTS, ctxAt(200, { data: { timing: track } }));
    expect(lit(buffer)).toEqual([]);
  });

  it("skips a range naming nodes the model doesn't have", () => {
    const buffer = new RenderBuffer(10, 1);
    const entries = [{ name: "wink", nodes: "1,999" }];
    const params = { ...DEFAULTS, useTimingTrack: false, state: "wink" };
    expect(() => renderState(buffer, [RED], params, ctxAt(0, { data: { states: entries } }))).not.toThrow();
    expect(lit(buffer)).toEqual([0]);
  });
});

describe("State effect colours", () => {
  const params = { ...DEFAULTS, useTimingTrack: false };

  it("a forced colour on the state beats every colour mode", () => {
    const buffer = new RenderBuffer(10, 1);
    const entries = [{ name: "wink", nodes: "1", color: "#00ff00" }];
    renderState(
      buffer,
      [RED, BLUE],
      { ...params, state: "wink", colorMode: "Allocate" },
      ctxAt(0, { data: { states: entries } }),
    );
    expect(buffer.getPixel(0, 0)).toEqual(GREEN);
  });

  it("Allocate gives each state its own palette colour", () => {
    const buffer = new RenderBuffer(10, 1);
    renderState(buffer, [RED, BLUE, GREEN], { ...params, state: "eyesleft,eyesright,wink", colorMode: "Allocate" }, ctxAt(0));
    expect(buffer.getPixel(0, 0)).toEqual(RED); // state 0
    expect(buffer.getPixel(3, 0)).toEqual(BLUE); // state 1
    expect(buffer.getPixel(6, 0)).toEqual(GREEN); // state 2
  });

  it("Cycle changes colour from one timing cell to the next", () => {
    const track = labelsFromTrack([0, 400, 800, 1000], ["wink", "wink", "wink"]);
    const colorAt = (ms: number): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderState(
        buffer,
        [RED, BLUE],
        { ...DEFAULTS, colorMode: "Cycle" },
        ctxAt(ms, { data: { states: ENTRIES, timing: track } }),
      );
      const c = buffer.getPixel(6, 0);
      return [c.r, c.g, c.b];
    };
    // The same state throughout - only the cell changes, and the colour follows it.
    expect(colorAt(200)).toEqual([255, 0, 0]);
    expect(colorAt(500)).toEqual([0, 0, 255]);
  });

  it("Number colours a digit state by its leading digit", () => {
    const entries = [
      { name: "1", nodes: "1" },
      { name: "2", nodes: "2" },
    ];
    const buffer = new RenderBuffer(10, 1);
    renderState(buffer, [RED, BLUE, GREEN], { ...params, state: "1,2", colorMode: "Number" }, ctxAt(0, { data: { states: entries } }));
    expect(buffer.getPixel(0, 0)).toEqual(BLUE); // palette[1]
    expect(buffer.getPixel(1, 0)).toEqual(GREEN); // palette[2]
  });
});

describe("State countdown modes", () => {
  const digits = [
    { name: "3", nodes: "1" },
    { name: "2", nodes: "2" },
    { name: "1", nodes: "3" },
    { name: "0", nodes: "4" },
    { name: "10", nodes: "5" },
    { name: "Colon", nodes: "6" },
  ];

  it("Countdown reaches zero as the effect ends", () => {
    const params = { ...DEFAULTS, mode: "Countdown" as const, useTimingTrack: false, state: "3" };
    const shown = (ms: number): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderState(buffer, [RED], params, {
        ...ctxAt(ms, { data: { states: digits } }),
        positionInEffect01: ms / 1000,
      });
      return lit(buffer);
    };
    expect(shown(0)).toEqual([0]); // "3"
    expect(shown(300)).toEqual([1]); // "2"
    expect(shown(600)).toEqual([2]); // "1"
    expect(shown(999)).toEqual([3]); // "0"
  });

  it("Time Countdown counts real seconds and shows the colon", () => {
    const params = { ...DEFAULTS, mode: "Time Countdown" as const, useTimingTrack: false, state: "0.13" };
    const buffer = new RenderBuffer(10, 1);
    // Three seconds in, ten seconds are left. Both digits light - the tens state "10" and the
    // units state "0" - plus the colon a clock face needs.
    renderState(buffer, [RED], params, {
      ...ctxAt(3000, { data: { states: digits } }),
      clock: { atMs: 3000, startMs: 0, endMs: 20000, frameMs: 50 },
    });
    expect(lit(buffer)).toEqual([3, 4, 5]);
  });

  it("the countdown's starting value can come from the timing track label", () => {
    const track = labelsFromTrack([0, 1000], ["3"]);
    const params = { ...DEFAULTS, mode: "Countdown" as const };
    const { names } = activeStates(params, {
      ...ctxAt(0, { data: { states: digits, timing: track } }),
      positionInEffect01: 0,
    });
    expect(names).toEqual(["3"]);
  });
});
