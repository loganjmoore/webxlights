// The measurements themselves: pure functions over pixels, no GL, no browser, no I/O.
//
// This file is loaded twice on purpose. metrics.mjs imports it normally so the maths can be
// unit-tested in Node against hand-built frames, and also injects its source into the page (with
// `export ` stripped) so the SAME code runs over the pixels without shipping 40 MB of frames
// across the CDP bridge. One implementation, two call sites - a reimplementation on either side
// would drift, and a metric that disagrees with itself is worse than no metric.
//
// Colour space, stated once because every threshold depends on it:
//
//   - `value` is max(R, G, B) - the drive level of the brightest channel. This, NOT relative
//     luminance, is what the brightness family (meanBrightness, contrast, deadFrames, alias,
//     roofline) is measured in, and the reason is worth recording. WCAG relative luminance
//     weights green at 0.72 and blue at 0.07, so a fully-on red bulb scores 0.21 and a fully-on
//     blue one scores 0.07 - both of them "too dark" against any threshold that a white frame
//     passes. Christmas displays are mostly saturated red, green and blue. Measured that way,
//     the brightness gate would reject the entire genre for being the colour it is meant to be.
//     An RGB LED at full red really is at full output, and from the street it reads that way.
//   - `luma` is WCAG relative luminance, kept for exactly one job: `strobeRate`. That is a
//     photosensitivity limit defined in luminance terms (WCAG 2.3.1), so it uses the standard's
//     own definition rather than this file's more convenient one.
//   - `S` and `L` are plain HSL in sRGB (gamma) space, because that is what "saturation" means
//     to everyone reading the number, and what `mudFraction`'s S/L bounds were written against.

export function srgbToLinear(c) {
  if (!(c > 0)) return 0; // also maps NaN and negatives to 0
  if (c > 1) c = 1;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relLuma(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** HSL in sRGB space. h in degrees 0..360, s and l in 0..1. */
export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Smallest absolute angle between two hues, in degrees (0..180). */
export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/**
 * Per-pixel decomposition of one frame.
 *
 * `raw` is RGBA, either Float32Array (values as the shader wrote them, so NaN and >1 survive)
 * or Uint8Array (already clamped and quantised, so NaN is unrecoverable - `nonFinite` is then
 * reported as null rather than as a confident zero).
 */
export function frameStats(raw, w, h, isFloat) {
  const n = w * h;
  const luma = new Float32Array(n);
  const value = new Float32Array(n);
  const sat = new Float32Array(n);
  const light = new Float32Array(n);
  const hue = new Float32Array(n);
  let nonFinite = 0;

  for (let i = 0; i < n; i++) {
    let r = raw[i * 4], g = raw[i * 4 + 1], b = raw[i * 4 + 2];
    if (isFloat) {
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) nonFinite++;
      // Clamp for the perceptual maths: a display cannot show 1.4, and a metric that lets an
      // over-bright pixel drag the mean up would hide exactly the blowout it should flag.
      r = Math.min(1, Math.max(0, r || 0));
      g = Math.min(1, Math.max(0, g || 0));
      b = Math.min(1, Math.max(0, b || 0));
    } else {
      r /= 255; g /= 255; b /= 255;
    }
    luma[i] = relLuma(r, g, b);
    value[i] = Math.max(r, g, b);
    const { h: hh, s, l } = rgbToHsl(r, g, b);
    sat[i] = s; light[i] = l; hue[i] = hh;
  }
  return { luma, value, sat, light, hue, nonFinite: isFloat ? nonFinite : null, count: n };
}

/** Pearson correlation of two equal-length series. Null when either is flat. */
export function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  if (da < 1e-12 || db < 1e-12) return null;
  return num / Math.sqrt(da * db);
}

/**
 * Every headline metric for one shader at one shape.
 *
 * `frames` is the array of raw RGBA buffers in render order; `palette` is the RGB list the
 * colour inputs were filled from, used only for `paletteFidelity`.
 */
export function analyze(frames, w, h, { isFloat, fps = 20, palette = null, litFloor = 0.05, deadP90 = 0.25 } = {}) {
  const perFrame = frames.map((f) => frameStats(f, w, h, isFloat));
  const frameCount = perFrame.length;
  const seconds = frameCount / fps;
  const px = w * h;

  let valueSum = 0, lumaSum = 0, litCount = 0, satSum = 0, mudCount = 0, nonFinite = 0;
  let hueOk = 0, hueTested = 0, achromatic = 0;
  const hueHist = new Float32Array(12);
  const meanLumaPerFrame = new Float32Array(frameCount);
  let deadFrames = 0;
  let contrast = 0;
  let peakBrightness = 0;

  for (let f = 0; f < frameCount; f++) {
    const { luma, value, sat, light, hue, nonFinite: nf } = perFrame[f];
    if (nf !== null) nonFinite += nf;
    let frameLumaSum = 0;
    for (let i = 0; i < px; i++) {
      frameLumaSum += luma[i];
      lumaSum += luma[i];
      const V = value[i];
      valueSum += V;
      if (V < litFloor) continue; // essentially off: deep black is negative space, not a colour
      litCount++;
      satSum += sat[i];
      // Mud: desaturated and stuck in the middle. This is what mix() between two complementary
      // palette colours produces in linear RGB, and what a person calls "muddy brown".
      if (sat[i] < 0.25 && light[i] > 0.2 && light[i] < 0.7) mudCount++;
      if (sat[i] < 0.15) { achromatic++; continue; } // hue of a near-grey is meaningless
      hueHist[Math.min(11, Math.floor(hue[i] / 30))]++;
      if (palette) {
        hueTested++;
        for (const p of palette) {
          if (hueDistance(hue[i], p) <= 25) { hueOk++; break; }
        }
      }
    }
    meanLumaPerFrame[f] = frameLumaSum / px;

    const sorted = Float32Array.from(value).sort();
    if (quantile(sorted, 0.9) < deadP90) deadFrames++;
    const spread = quantile(sorted, 0.95) - quantile(sorted, 0.05);
    if (spread > contrast) contrast = spread;
    const peak = quantile(sorted, 0.99);
    if (peak > peakBrightness) peakBrightness = peak;
  }

  // Motion is measured across RGB, not luma: a hue sweep at constant brightness really is
  // moving, and a luma-only delta would score it a still image.
  //
  // Two baselines, because one cannot answer both questions. The adjacent-frame delta says
  // whether motion is smooth or violent, but a deliberately slow drift - which is the whole
  // aesthetic being aimed at - moves so little in 50 ms that it is indistinguishable from a
  // still image at this baseline. `slowMotionEnergy` compares frames half a second apart, which
  // is the honest test of "does anything happen at all".
  const slowLag = Math.max(1, Math.round(fps * 0.5));
  let slowSum = 0, slowPairs = 0;
  for (let f = slowLag; f < frameCount; f++) {
    const a = frames[f - slowLag], b = frames[f];
    let d = 0;
    for (let i = 0; i < px; i++) {
      for (let c = 0; c < 3; c++) {
        const x = isFloat ? Math.min(1, Math.max(0, a[i * 4 + c] || 0)) : a[i * 4 + c] / 255;
        const y = isFloat ? Math.min(1, Math.max(0, b[i * 4 + c] || 0)) : b[i * 4 + c] / 255;
        d += Math.abs(x - y);
      }
    }
    slowSum += d / (px * 3);
    slowPairs++;
  }

  let motionSum = 0, motionPairs = 0;
  let coherenceSum = 0, coherencePairs = 0;
  let strobes = 0;
  for (let f = 1; f < frameCount; f++) {
    const a = frames[f - 1], b = frames[f];
    let d = 0;
    for (let i = 0; i < px; i++) {
      for (let c = 0; c < 3; c++) {
        const x = isFloat ? Math.min(1, Math.max(0, a[i * 4 + c] || 0)) : a[i * 4 + c] / 255;
        const y = isFloat ? Math.min(1, Math.max(0, b[i * 4 + c] || 0)) : b[i * 4 + c] / 255;
        d += Math.abs(x - y);
      }
    }
    motionSum += d / (px * 3);
    motionPairs++;

    const r = pearson(perFrame[f - 1].value, perFrame[f].value);
    // Two flat frames are perfectly coherent (a still image), not incoherent. One flat and one
    // not is a jump from nothing to something, which is the opposite of flow.
    if (r === null) {
      const flatA = perFrame[f - 1].value.every((v) => Math.abs(v - perFrame[f - 1].value[0]) < 1e-6);
      const flatB = perFrame[f].value.every((v) => Math.abs(v - perFrame[f].value[0]) < 1e-6);
      coherenceSum += flatA && flatB ? 1 : 0;
    } else {
      coherenceSum += r;
    }
    coherencePairs++;

    if (Math.abs(meanLumaPerFrame[f] - meanLumaPerFrame[f - 1]) > 0.5) strobes++;
  }

  // Aliasing and roofline liveness only mean anything on the one-pixel-tall line, where a
  // hard pixel-to-pixel jump is the whole prop flickering rather than an edge in an image.
  let aliasEnergy = null, rooflineLiveness = null, rooflineSpatialStd = null, rooflineTemporalStd = null;
  if (h === 1 && w > 2) {
    let harsh = 0, pairs = 0, spatialStdSum = 0;
    for (let f = 0; f < frameCount; f++) {
      const value = perFrame[f].value;
      let mean = 0;
      for (let i = 0; i < w; i++) mean += value[i];
      mean /= w;
      let varr = 0;
      for (let i = 0; i < w; i++) varr += (value[i] - mean) ** 2;
      spatialStdSum += Math.sqrt(varr / w);
      for (let i = 1; i < w; i++) { pairs++; if (Math.abs(value[i] - value[i - 1]) > 0.5) harsh++; }
    }
    aliasEnergy = pairs ? harsh / pairs : 0;
    rooflineSpatialStd = spatialStdSum / frameCount;

    let temporalStdSum = 0;
    for (let i = 0; i < w; i++) {
      let m = 0;
      for (let f = 0; f < frameCount; f++) m += perFrame[f].value[i];
      m /= frameCount;
      let v = 0;
      for (let f = 0; f < frameCount; f++) v += (perFrame[f].value[i] - m) ** 2;
      temporalStdSum += Math.sqrt(v / frameCount);
    }
    rooflineTemporalStd = temporalStdSum / w;
    // Both halves must hold: structure along the line AND that structure changing. A solid
    // colour that merely cycles passes the second and fails the first, which is the failure
    // this exists to catch.
    rooflineLiveness = Math.min(
      Math.min(1, rooflineSpatialStd / 0.1),
      Math.min(1, rooflineTemporalStd / 0.05),
    );
  }

  const totalPx = px * frameCount;
  return {
    meanBrightness: valueSum / totalPx,
    peakBrightness,
    // Reported, never gated: the same frames in WCAG relative luminance, so anyone who wants
    // the standard's number has it without re-rendering, and so the gap between the two is
    // visible rather than an assertion in a comment.
    meanRelLuma: lumaSum / totalPx,
    deadFrames: deadFrames / frameCount,
    contrast,
    chroma: litCount ? satSum / litCount : 0,
    mudFraction: litCount ? mudCount / litCount : 0,
    litFraction: litCount / totalPx,
    motionEnergy: motionPairs ? motionSum / motionPairs : 0,
    slowMotionEnergy: slowPairs ? slowSum / slowPairs : 0,
    flowCoherence: coherencePairs ? coherenceSum / coherencePairs : 1,
    strobeRate: strobes / seconds,
    aliasEnergy,
    rooflineLiveness,
    rooflineSpatialStd,
    rooflineTemporalStd,
    paletteFidelity: palette ? (hueTested ? hueOk / hueTested : null) : null,
    achromaticFraction: litCount ? achromatic / litCount : 0,
    // null, not 0, when the target was 8-bit: an unmeasurable NaN must not read as "no NaN".
    nanFraction: perFrame[0]?.nonFinite === null ? null : nonFinite / totalPx,
    hueHistogram: Array.from(hueHist, (v) => (litCount ? v / litCount : 0)),
    frames: frameCount,
  };
}

/**
 * Gradient energy at three lags, in x and y - a cheap stand-in for a spatial-frequency
 * histogram. High lag-1 energy with low lag-4 energy is fine detail (which a prop cannot show);
 * the reverse is broad structure (which it can).
 */
export function spatialFrequency(frame, w, h, isFloat) {
  const { luma } = frameStats(frame, w, h, isFloat);
  const out = [];
  for (const lag of [1, 2, 4]) {
    let sx = 0, nx = 0, sy = 0, ny = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x + lag < w; x++) { sx += Math.abs(luma[y * w + x + lag] - luma[y * w + x]); nx++; }
    }
    for (let y = 0; y + lag < h; y++) {
      for (let x = 0; x < w; x++) { sy += Math.abs(luma[(y + lag) * w + x] - luma[y * w + x]); ny++; }
    }
    out.push(nx ? sx / nx : 0, ny ? sy / ny : 0);
  }
  return out;
}

/** The per-shader feature vector distinctness is measured in. */
export function featureVector(m, spatial) {
  return [
    m.meanBrightness, m.peakBrightness, m.contrast, m.chroma, m.mudFraction, m.litFraction,
    m.motionEnergy, m.flowCoherence, m.aliasEnergy ?? 0, m.achromaticFraction,
    ...m.hueHistogram,
    ...(spatial ?? [0, 0, 0, 0, 0, 0]),
  ];
}

/**
 * Closest pairs in the library, after per-dimension min-max normalisation so that a dimension
 * with a naturally large range (hue histogram counts) does not swamp one with a small one
 * (flowCoherence). Returns every pair, nearest first.
 */
export function closestPairs(entries) {
  const dims = entries[0]?.vector.length ?? 0;
  const lo = new Array(dims).fill(Infinity);
  const hi = new Array(dims).fill(-Infinity);
  for (const e of entries) {
    e.vector.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      if (v < lo[i]) lo[i] = v;
      if (v > hi[i]) hi[i] = v;
    });
  }
  const norm = (v, i) => {
    const span = hi[i] - lo[i];
    if (!Number.isFinite(v)) return 0;
    return span < 1e-9 ? 0 : (v - lo[i]) / span;
  };
  const pairs = [];
  for (let a = 0; a < entries.length; a++) {
    for (let b = a + 1; b < entries.length; b++) {
      let sum = 0;
      for (let i = 0; i < dims; i++) sum += (norm(entries[a].vector[i], i) - norm(entries[b].vector[i], i)) ** 2;
      pairs.push({ a: entries[a].id, b: entries[b].id, distance: Math.sqrt(sum / dims) });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}
