import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { activePhoneme, eyesClosedAt, faceVisibility, renderFaces, type FacesParams } from "../src/effects/faces";
import { emptyFaceSpec, type FaceSpec } from "../src/models/faces";
import { labelsFromTrack } from "../src/timing";
import type { FrameContext } from "../src/effects/types";
import type { ModelNode } from "../src/models/types";

const MOUTH = rgba(255, 0, 0);
const EYES = rgba(0, 255, 0);
const OUTLINE = rgba(0, 0, 255);
const PALETTE = [MOUTH, EYES, OUTLINE];

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

// A coro face: nodes 1-2 the outline, 3 eyes open, 4 eyes closed, 5-8 the four mouths.
const FACE: FaceSpec = {
  name: "Face1",
  mouths: [
    { name: "rest", nodes: "5" },
    { name: "AI", nodes: "6" },
    { name: "MBP", nodes: "7" },
    { name: "O", nodes: "8" },
  ],
  eyesOpen: "3",
  eyesClosed: "4",
  outline: "1-2",
};

const DEFAULTS: FacesParams = {
  faceDefinition: "Face1",
  timingTrack: "Lyrics",
  phoneme: "rest",
  useTimingTrack: true,
  eyes: "Open",
  eyeBlinkSeconds: 5,
  eyeBlinkLengthMs: 150,
  showOutline: true,
  suppressWhenNotSinging: false,
  leadInFrames: 0,
  leadOutFrames: 0,
  fadeDuringLeadInOut: false,
  transparentBlack: false,
};

function ctxAt(atMs: number, over: Partial<FrameContext> = {}): FrameContext {
  return {
    frameIndexInEffect: 0,
    positionInEffect01: atMs / 2000,
    seed: 1,
    clock: { atMs, startMs: 0, endMs: 2000, frameMs: 50 },
    data: { face: FACE },
    nodes: nodes(10),
    ...over,
  };
}

function lit(buffer: RenderBuffer): number[] {
  const on: number[] = [];
  for (let x = 0; x < buffer.width; x++) if (buffer.getPixel(x, 0).a > 0) on.push(x);
  return on;
}

const phonemes = labelsFromTrack([0, 500, 1000, 1500], ["AI", "MBP", "O"]);

describe("Faces effect", () => {
  it("lights the mouth the phoneme track names, plus the eyes and outline", () => {
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, DEFAULTS, ctxAt(100, { data: { face: FACE, timing: phonemes } }));
    // outline 1-2 -> nodes 0,1; eyes open 3 -> node 2; mouth AI 6 -> node 5
    expect(lit(buffer)).toEqual([0, 1, 2, 5]);
  });

  it("changes mouth as the phonemes go by", () => {
    const mouthAt = (ms: number): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderFaces(buffer, PALETTE, { ...DEFAULTS, showOutline: false, eyes: "(off)" }, ctxAt(ms, { data: { face: FACE, timing: phonemes } }));
      return lit(buffer);
    };
    expect(mouthAt(100)).toEqual([5]); // AI
    expect(mouthAt(600)).toEqual([6]); // MBP
    expect(mouthAt(1100)).toEqual([7]); // O
  });

  it("closes the mouth on a label that names no phoneme", () => {
    // A lyric track that hasn't been broken down holds whole words. Falling back to rest keeps
    // the face present with its mouth shut, rather than making it vanish.
    const words = labelsFromTrack([0, 500], ["silent"]);
    expect(activePhoneme(DEFAULTS, FACE, ctxAt(100, { data: { face: FACE, timing: words } }))).toBe("rest");
  });

  it("uses the chosen phoneme when no track drives it", () => {
    const buffer = new RenderBuffer(10, 1);
    const params = { ...DEFAULTS, useTimingTrack: false, phoneme: "O", showOutline: false, eyes: "(off)" as const };
    renderFaces(buffer, PALETTE, params, ctxAt(100, { data: { face: FACE, timing: phonemes } }));
    expect(lit(buffer)).toEqual([7]);
  });

  it("paints each part in its own palette colour, per the manual's table", () => {
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, DEFAULTS, ctxAt(100, { data: { face: FACE, timing: phonemes } }));
    expect(buffer.getPixel(0, 0)).toEqual(OUTLINE); // 3rd swatch
    expect(buffer.getPixel(2, 0)).toEqual(EYES); // 2nd swatch
    expect(buffer.getPixel(5, 0)).toEqual(MOUTH); // 1st swatch
  });

  it("a forced colour on a mouth beats the palette", () => {
    const forced: FaceSpec = { ...FACE, mouths: [{ name: "AI", nodes: "6", color: "#00ffff" }] };
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, DEFAULTS, ctxAt(100, { data: { face: forced, timing: phonemes } }));
    expect(buffer.getPixel(5, 0)).toEqual(rgba(0, 255, 255));
  });

  it("hides the outline when it isn't asked for", () => {
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, { ...DEFAULTS, showOutline: false }, ctxAt(100, { data: { face: FACE, timing: phonemes } }));
    expect(lit(buffer)).toEqual([2, 5]);
  });

  it("renders nothing without a face definition", () => {
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, DEFAULTS, ctxAt(100, { data: { timing: phonemes } }));
    expect(lit(buffer)).toEqual([]);
  });
});

describe("Faces eyes", () => {
  it("open, closed and off are what they say", () => {
    const eyesAt = (eyes: FacesParams["eyes"]): number[] => {
      const buffer = new RenderBuffer(10, 1);
      renderFaces(buffer, PALETTE, { ...DEFAULTS, eyes, showOutline: false }, ctxAt(100, { data: { face: FACE, timing: phonemes } }));
      return lit(buffer);
    };
    expect(eyesAt("Open")).toEqual([2, 5]);
    expect(eyesAt("Close")).toEqual([3, 5]);
    expect(eyesAt("(off)")).toEqual([5]);
  });

  it("Automatic blinks only while the mouth is at rest", () => {
    // "Setting the eyes to Auto will cause the eyes to blink every few seconds when the rest
    // phenome is on" - so a face doesn't blink mid-syllable.
    const params = { ...DEFAULTS, eyes: "Automatic" as const, eyeBlinkSeconds: 5, eyeBlinkLengthMs: 200 };
    expect(eyesClosedAt(params, "rest", ctxAt(50))).toBe(true); // inside the blink at 0
    expect(eyesClosedAt(params, "rest", ctxAt(2000))).toBe(false); // between blinks
    expect(eyesClosedAt(params, "rest", ctxAt(5100))).toBe(true); // the next blink
    expect(eyesClosedAt(params, "AI", ctxAt(50))).toBe(false); // singing: no blink
  });

  it("blink length is how long the eyes stay shut", () => {
    const short = { ...DEFAULTS, eyes: "Automatic" as const, eyeBlinkLengthMs: 100 };
    const long = { ...DEFAULTS, eyes: "Automatic" as const, eyeBlinkLengthMs: 400 };
    expect(eyesClosedAt(short, "rest", ctxAt(200))).toBe(false);
    expect(eyesClosedAt(long, "rest", ctxAt(200))).toBe(true);
  });
});

describe("Faces suppress when not singing", () => {
  const params = { ...DEFAULTS, suppressWhenNotSinging: true };
  const sparse = labelsFromTrack([0, 500, 2000, 2500], ["AI", "", "MBP"]);
  const withTrack = (ms: number): FrameContext => ctxAt(ms, { data: { face: FACE, timing: sparse } });

  it("shows the face while there are lyrics and hides it between them", () => {
    expect(faceVisibility(params, withTrack(100))).toBe(1);
    expect(faceVisibility(params, withTrack(1200))).toBe(0);
  });

  it("brings the face back for the lead-in frames before the next lyric", () => {
    // 10 frames at 50ms is half a second before the phrase at 2000ms.
    const leadIn = { ...params, leadInFrames: 10 };
    expect(faceVisibility(leadIn, withTrack(1400))).toBe(0);
    expect(faceVisibility(leadIn, withTrack(1600))).toBe(1);
  });

  it("keeps it for the lead-out frames after the last one", () => {
    const leadOut = { ...params, leadOutFrames: 10 };
    expect(faceVisibility(leadOut, withTrack(700))).toBe(1);
    expect(faceVisibility(leadOut, withTrack(1400))).toBe(0);
  });

  it("fades across the lead-in rather than cutting, when asked", () => {
    const fading = { ...params, leadInFrames: 10, fadeDuringLeadInOut: true };
    const early = faceVisibility(fading, withTrack(1600)); // just inside the lead-in
    const late = faceVisibility(fading, withTrack(1950)); // nearly singing
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(late);
    expect(late).toBeLessThanOrEqual(1);
  });

  it("dims what it draws while fading", () => {
    const fading = { ...params, leadInFrames: 10, fadeDuringLeadInOut: true, showOutline: false, eyes: "(off)" as const };
    const buffer = new RenderBuffer(10, 1);
    renderFaces(buffer, PALETTE, fading, withTrack(1700));
    const rest = buffer.getPixel(4, 0); // the rest mouth, node 5
    expect(rest.a).toBeGreaterThan(0);
    expect(rest.a).toBeLessThan(255);
  });

  it("leaves the face alone when the setting is off", () => {
    expect(faceVisibility(DEFAULTS, withTrack(1200))).toBe(1);
  });
});

describe("a new face definition", () => {
  it("is seeded with the standard phonemes and no nodes yet", () => {
    const spec = emptyFaceSpec("Face1");
    expect(spec.mouths.map((m) => m.name)).toContain("rest");
    expect(spec.mouths.map((m) => m.name)).toContain("MBP");
    expect(spec.mouths.every((m) => m.nodes === "")).toBe(true);
  });
});

describe("Matrix faces", () => {
  // A 2x2 picture: red, green / blue, black. Row-major, top row first.
  const picture = (r: number): { width: number; height: number; data: number[] } => ({
    width: 2,
    height: 2,
    data: [r, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255],
  });

  const matrixFace: FaceSpec = {
    name: "Matrix Face",
    kind: "matrix",
    mouths: [],
    placement: "Scaled",
    images: [
      { name: "rest", image: picture(100) },
      { name: "AI", image: picture(255), imageClosed: picture(50) },
    ],
  };

  function matrixCtx(atMs: number, over: Partial<FrameContext> = {}): FrameContext {
    return { ...ctxAt(atMs), data: { face: matrixFace, timing: phonemes }, ...over };
  }

  it("draws the picture for the mouth the track names", () => {
    const buffer = new RenderBuffer(2, 2);
    renderFaces(buffer, PALETTE, DEFAULTS, matrixCtx(100));
    // Scaled fills the buffer; the image's top-left red pixel lands on the buffer's top row,
    // because the buffer's origin is bottom-left and the image's rows are top-first.
    expect(buffer.getPixel(0, 1)).toEqual(rgba(255, 0, 0, 255));
    expect(buffer.getPixel(0, 0)).toEqual(rgba(0, 0, 255, 255));
  });

  it("falls back to the rest picture for a mouth it hasn't got", () => {
    const buffer = new RenderBuffer(2, 2);
    const params = { ...DEFAULTS, useTimingTrack: false, phoneme: "WQ" };
    renderFaces(buffer, PALETTE, params, matrixCtx(100));
    expect(buffer.getPixel(0, 1)).toEqual(rgba(100, 0, 0, 255)); // the rest picture
  });

  it("uses the closed-eyes picture when the eyes are shut, and the open one when it has none", () => {
    const closedParams = { ...DEFAULTS, useTimingTrack: false, phoneme: "AI", eyes: "Close" as const };
    const closed = new RenderBuffer(2, 2);
    renderFaces(closed, PALETTE, closedParams, matrixCtx(100));
    expect(closed.getPixel(0, 1)).toEqual(rgba(50, 0, 0, 255));

    // "rest" has no closed variant, so the open one is used - "by default, the same image is
    // copied across".
    const rest = new RenderBuffer(2, 2);
    renderFaces(rest, PALETTE, { ...closedParams, phoneme: "rest" }, matrixCtx(100));
    expect(rest.getPixel(0, 1)).toEqual(rgba(100, 0, 0, 255));
  });

  it("Centered keeps the picture's own size when the matrix is bigger", () => {
    const buffer = new RenderBuffer(6, 6);
    const centred: FaceSpec = { ...matrixFace, placement: "Centered" };
    renderFaces(buffer, PALETTE, { ...DEFAULTS, useTimingTrack: false, phoneme: "rest" }, matrixCtx(100, { data: { face: centred } }));
    let painted = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (buffer.getPixel(x, y).a > 0) painted++;
    expect(painted).toBe(4); // the 2x2 picture, not stretched across 36 pixels
    expect(buffer.getPixel(0, 0).a).toBe(0); // and it is in the middle
  });

  it("Scaled stretches the picture over the whole matrix", () => {
    const buffer = new RenderBuffer(6, 6);
    renderFaces(buffer, PALETTE, { ...DEFAULTS, useTimingTrack: false, phoneme: "rest" }, matrixCtx(100));
    let painted = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (buffer.getPixel(x, y).a > 0) painted++;
    expect(painted).toBe(36);
  });

  it("Transparent Black leaves the picture's black pixels alone", () => {
    // A face photo's background is black, and without this it covers the layer below - which is
    // the setting's whole purpose, and only a matrix face has pixels it wasn't asked to draw.
    const opaque = new RenderBuffer(2, 2);
    renderFaces(opaque, PALETTE, { ...DEFAULTS, useTimingTrack: false, phoneme: "rest" }, matrixCtx(100));
    expect(opaque.getPixel(1, 0).a).toBe(255); // the black pixel is drawn

    const transparent = new RenderBuffer(2, 2);
    renderFaces(transparent, PALETTE, { ...DEFAULTS, useTimingTrack: false, phoneme: "rest", transparentBlack: true }, matrixCtx(100));
    expect(transparent.getPixel(1, 0).a).toBe(0);
  });

  it("draws nothing for a mouth with no picture", () => {
    const bare: FaceSpec = { name: "Bare", kind: "matrix", mouths: [], images: [{ name: "rest" }] };
    const buffer = new RenderBuffer(2, 2);
    renderFaces(buffer, PALETTE, { ...DEFAULTS, useTimingTrack: false, phoneme: "rest" }, matrixCtx(100, { data: { face: bare } }));
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) expect(buffer.getPixel(x, y).a).toBe(0);
  });

  it("fades with the rest of the face", () => {
    const fading = {
      ...DEFAULTS,
      useTimingTrack: false,
      phoneme: "rest",
      suppressWhenNotSinging: true,
      leadInFrames: 10,
      fadeDuringLeadInOut: true,
    };
    const sparse = labelsFromTrack([0, 500, 2000, 2500], ["AI", "", "MBP"]);
    const buffer = new RenderBuffer(2, 2);
    renderFaces(buffer, PALETTE, fading, matrixCtx(1700, { data: { face: matrixFace, timing: sparse } }));
    const pixel = buffer.getPixel(0, 1);
    expect(pixel.a).toBeGreaterThan(0);
    expect(pixel.a).toBeLessThan(255);
  });
});
