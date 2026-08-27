// The metrics decide whether a shader ships, so the maths behind them gets a real check.
//
//   node --test tools/shader-check/
//
// Every case here is a frame sequence built by hand with a known answer, because the failures
// worth catching are the silent ones: a renamed field that reads back `undefined` and quietly
// never fires (which happened to openingLuma), a correlation that reports flow for a still
// image, a brightness measure that calls saturated red "dark".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relLuma, rgbToHsl, hueDistance, pearson, frameStats, analyze, spatialFrequency,
  featureVector, closestPairs,
} from "./metricsCore.mjs";

/** One frame of solid colour, as the float RGBA the harness reads back. */
function solid(w, h, [r, g, b]) {
  const f = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) f.set([r, g, b, 1], i * 4);
  return f;
}

/** Vertical stripes of two colours, offset by `shift` pixels - a pattern that can be moved. */
function stripes(w, h, a, b, period, shift) {
  const f = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = Math.floor((x + shift) / period) % 2 === 0;
      f.set([...(on ? a : b), 1], (y * w + x) * 4);
    }
  }
  return f;
}

const RED = [1, 0, 0], WHITE = [1, 1, 1], BLACK = [0, 0, 0], GREY = [0.5, 0.5, 0.5];
const OPTS = { isFloat: true, fps: 20 };

test("relative luminance follows the sRGB weights", () => {
  assert.equal(relLuma(0, 0, 0), 0);
  assert.ok(Math.abs(relLuma(1, 1, 1) - 1) < 1e-6);
  // Green carries most of the luminance, blue almost none. This asymmetry is exactly why the
  // brightness family uses drive level instead.
  assert.ok(relLuma(0, 1, 0) > relLuma(1, 0, 0));
  assert.ok(relLuma(1, 0, 0) > relLuma(0, 0, 1));
  assert.ok(Math.abs(relLuma(1, 0, 0) - 0.2126) < 1e-3);
});

test("saturated red is full brightness but low luminance - the reason for drive level", () => {
  const m = analyze([solid(4, 4, RED)], 4, 4, OPTS);
  assert.equal(m.meanBrightness, 1);
  assert.ok(m.meanRelLuma < 0.25, "relative luminance of full red is ~0.21");
  // A brightness gate on relative luminance would call a fully-on red bulb dark.
  assert.ok(m.meanBrightness > m.meanRelLuma * 4);
});

test("HSL and hue distance wrap correctly", () => {
  assert.equal(rgbToHsl(1, 0, 0).h, 0);
  assert.ok(Math.abs(rgbToHsl(0, 1, 0).h - 120) < 1e-6);
  assert.ok(Math.abs(rgbToHsl(0, 0, 1).h - 240) < 1e-6);
  assert.equal(rgbToHsl(0.4, 0.4, 0.4).s, 0);
  assert.equal(hueDistance(350, 10), 20, "distance wraps the short way round the circle");
  assert.equal(hueDistance(10, 350), 20);
  assert.equal(hueDistance(0, 180), 180);
});

test("pearson is null for a flat series and 1 for an identical one", () => {
  assert.equal(pearson(new Float32Array([1, 1, 1]), new Float32Array([1, 2, 3])), null);
  assert.ok(Math.abs(pearson(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3])) - 1) < 1e-6);
  assert.ok(Math.abs(pearson(new Float32Array([1, 2, 3]), new Float32Array([3, 2, 1])) + 1) < 1e-6);
});

test("NaN is counted on a float target and reported as null on an 8-bit one", () => {
  const f = solid(2, 2, WHITE);
  f[0] = NaN;
  assert.equal(frameStats(f, 2, 2, true).nonFinite, 1);
  assert.equal(analyze([f], 2, 2, OPTS).nanFraction, 1 / 4);
  // 8-bit readback cannot represent NaN, so claiming zero would be a confident lie.
  const bytes = new Uint8Array(2 * 2 * 4).fill(255);
  assert.equal(analyze([bytes], 2, 2, { isFloat: false, fps: 20 }).nanFraction, null);
});

test("a still image has no motion, and a moving pattern does", () => {
  const still = [stripes(16, 4, RED, WHITE, 4, 0), stripes(16, 4, RED, WHITE, 4, 0)];
  const stillM = analyze(still, 16, 4, OPTS);
  assert.equal(stillM.motionEnergy, 0);
  assert.equal(stillM.slowMotionEnergy, 0);

  const moving = Array.from({ length: 40 }, (_, i) => stripes(16, 4, RED, WHITE, 8, i));
  const movingM = analyze(moving, 16, 4, OPTS);
  assert.ok(movingM.motionEnergy > 0);
  assert.ok(movingM.slowMotionEnergy > 0);
});

test("slow motion is invisible frame-to-frame but visible over half a second", () => {
  // Moves one pixel every ten frames: a real drift that an adjacent-frame delta nearly misses.
  const frames = Array.from({ length: 40 }, (_, i) => stripes(40, 4, RED, WHITE, 10, Math.floor(i / 10)));
  const m = analyze(frames, 40, 4, OPTS);
  assert.ok(m.slowMotionEnergy > m.motionEnergy * 3, "the long baseline sees what the short one cannot");
});

test("deep black counts as dark, and dead frames are counted", () => {
  const m = analyze([solid(8, 8, BLACK), solid(8, 8, WHITE)], 8, 8, OPTS);
  assert.equal(m.deadFrames, 0.5, "one of the two frames is unlit");
  assert.equal(m.peakBrightness, 1);
  assert.ok(Math.abs(m.meanBrightness - 0.5) < 1e-6);
});

test("strobing is measured per second against the photosensitivity limit", () => {
  // Full black to full white every frame, at 20 fps: 19 swings over 1 s of frames.
  const flashes = Array.from({ length: 20 }, (_, i) => solid(4, 4, i % 2 ? WHITE : BLACK));
  const m = analyze(flashes, 4, 4, OPTS);
  assert.ok(m.strobeRate > 3, `flashing every frame must exceed 3/s, got ${m.strobeRate}`);

  const calm = Array.from({ length: 20 }, () => solid(4, 4, RED));
  assert.equal(analyze(calm, 4, 4, OPTS).strobeRate, 0);
});

test("mid-grey is mud; saturated colour is not", () => {
  assert.ok(analyze([solid(8, 8, GREY)], 8, 8, OPTS).mudFraction > 0.99);
  assert.equal(analyze([solid(8, 8, RED)], 8, 8, OPTS).mudFraction, 0);
  // Black is unlit rather than muddy: it is negative space, and must not count either way.
  assert.equal(analyze([solid(8, 8, BLACK)], 8, 8, OPTS).mudFraction, 0);
});

test("palette fidelity rewards palette hues and punishes foreign ones", () => {
  const palette = [0, 240]; // red and blue
  assert.equal(analyze([solid(8, 8, RED)], 8, 8, { ...OPTS, palette }).paletteFidelity, 1);
  assert.equal(analyze([solid(8, 8, [0, 1, 0])], 8, 8, { ...OPTS, palette }).paletteFidelity, 0);
  // A near-grey has no meaningful hue and must not be scored for or against the palette.
  assert.equal(analyze([solid(8, 8, GREY)], 8, 8, { ...OPTS, palette }).paletteFidelity, null);
});

test("aliasing and roofline liveness only apply to the one-pixel line", () => {
  const alias = Array.from({ length: 4 }, () => stripes(60, 1, WHITE, BLACK, 1, 0));
  assert.ok(analyze(alias, 60, 1, OPTS).aliasEnergy > 0.9, "every adjacent pair flips full-scale");

  const broad = Array.from({ length: 4 }, () => stripes(60, 1, WHITE, BLACK, 20, 0));
  assert.ok(analyze(broad, 60, 1, OPTS).aliasEnergy < 0.1, "wide bands are not aliasing");

  // A solid colour that merely cycles has no structure along the line: the failure the metric
  // exists to catch.
  const cycling = Array.from({ length: 20 }, (_, i) => solid(60, 1, [i / 20, 0, 0]));
  assert.equal(analyze(cycling, 60, 1, OPTS).rooflineLiveness, 0);

  assert.equal(analyze([solid(32, 32, RED)], 32, 32, OPTS).aliasEnergy, null, "not a roofline");
});

test("spatial frequency separates fine detail from broad structure", () => {
  const fine = spatialFrequency(stripes(32, 32, WHITE, BLACK, 1, 0), 32, 32, true);
  const broad = spatialFrequency(stripes(32, 32, WHITE, BLACK, 16, 0), 32, 32, true);
  assert.ok(fine[0] > broad[0], "lag-1 gradient energy is much higher for 1px stripes");
});

test("distinctness ranks near-duplicates closest", () => {
  const mk = (id, m, spatial) => ({ id, vector: featureVector(m, spatial) });
  const a = analyze([solid(8, 8, RED)], 8, 8, OPTS);
  const b = analyze([solid(8, 8, [1, 0.02, 0.02])], 8, 8, OPTS); // all but identical to a
  const c = analyze([solid(8, 8, [0, 0, 1])], 8, 8, OPTS);
  const pairs = closestPairs([mk("a", a, null), mk("b", b, null), mk("c", c, null)]);
  assert.deepEqual([pairs[0].a, pairs[0].b].sort(), ["a", "b"]);
  assert.ok(pairs[0].distance < pairs[pairs.length - 1].distance);
});
