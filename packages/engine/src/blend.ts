import { rgba, type RGBA } from "./color";

export type BlendMode =
  | "Normal"
  | "Effect 1"
  | "Effect 2"
  | "Average"
  | "Additive"
  | "Subtractive"
  | "Max"
  | "Min"
  | "1 reveals 2"
  | "2 reveals 1"
  | "1 is Mask"
  | "2 is Mask"
  | "1 is Unmask"
  | "2 is Unmask"
  | "Shadow 1 on 2"
  | "Shadow 2 on 1"
  | "Layered"
  | "Brightness"
  | "Bottom-Top"
  | "Left-Right"
  | "Morph"
  | "Canvas";

// The set the props panel offers, in the manual's own order.
export const BLEND_MODES: BlendMode[] = [
  "Normal",
  "Effect 1",
  "Effect 2",
  "Average",
  "Additive",
  "Subtractive",
  "Max",
  "Min",
  "1 reveals 2",
  "2 reveals 1",
  "1 is Mask",
  "2 is Mask",
  "1 is Unmask",
  "2 is Unmask",
  "Shadow 1 on 2",
  "Shadow 2 on 1",
  "Layered",
  "Brightness",
  "Bottom-Top",
  "Left-Right",
  "Morph",
  "Canvas",
];

// Canvas isn't a way of combining two colours - it is the layer being handed what is underneath
// it to modify, so by the time blending happens the effect has already accounted for the
// background and its output replaces it. The layer stack seeds the buffer; this is the other
// half of the same rule, and keeping it here means no caller has to special-case the mode.
export function isCanvasMode(mode: BlendMode): boolean {
  return mode === "Canvas";
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

// (HSV "value" is just the brightest channel, and "black" is all-zero colour with no alpha -
// both are computed inline in blendPixelInto rather than through helper calls, because this is
// the engine's innermost loop and rgbToHsv built a {h,s,v} object per pixel.)

// SPEC ch9 §5.2 / manual "Layer Blending": fg is this layer's pixel ("layer 1" in the manual's
// wording), bg is the accumulated result of the layers below it ("layer 2").
//
// A caveat worth stating plainly: the manual documents these modes with screenshots and the
// advice "put two effects on a model and step through each of the layering modes to see what
// they will look like. Experience is much better than reading about it." It never defines them
// in words. The eight added beyond the original ten are therefore implemented from what their
// names unambiguously mean - a mask hides, an unmask reveals, a shadow darkens, Layered picks
// whichever layer has something to show - rather than from a specification. They behave sensibly
// and consistently; whether each matches xLights pixel for pixel is unverified, and recorded as
// such in docs/MANUAL-COVERAGE.md.
//
// Bottom-Top and Left-Right (the split-screen pair) are deliberately absent: they need the
// pixel's position in the buffer, and this function is given only the two colours. Adding a
// position parameter for two modes would put a coordinate through every blend call in the
// engine, so they wait for a reason bigger than themselves.
// `position01` is where this pixel sits along the axis the positional modes read - 0 at the
// bottom or left edge, 1 at the top or right. Every other mode ignores it, which is why it has a
// default: only three of the twenty-four care where a pixel is, and threading a coordinate
// through the rest would be noise.
export function blendPixel(fg: RGBA, bg: RGBA, mode: BlendMode, effectMixThreshold: number, position01 = 0.5): RGBA {
  const out = rgba(0, 0, 0, 0);
  blendPixelInto(fg, bg, mode, effectMixThreshold, position01, out);
  return out;
}

/**
 * blendPixel without the allocation: the answer is written into `out`.
 *
 * This is the innermost loop of the whole engine - every node of every layer of every frame
 * passes through here - and blendPixel's fresh object per call was, with the compositor around
 * it, two thirds of a full render's CPU time in the M9 bench profile. Every input channel is
 * read into a local before anything is written, so `out` may alias `fg` or `bg` - which is
 * exactly how the compositor calls it, blending each layer into the accumulated result in place.
 */
export function blendPixelInto(fg: RGBA, bg: RGBA, mode: BlendMode, effectMixThreshold: number, position01: number, out: RGBA): void {
  const fr = fg.r, fgG = fg.g, fb = fg.b, fa = fg.a;
  const br = bg.r, bgG = bg.g, bb = bg.b, ba = bg.a;
  const fgIsBlack = fr === 0 && fgG === 0 && fb === 0 && (fa === 0 || fa === undefined);
  const bgIsBlack = br === 0 && bgG === 0 && bb === 0 && (ba === 0 || ba === undefined);

  switch (mode) {
    case "Normal": {
      const alpha = fa * (1 - effectMixThreshold);
      // The two overwhelmingly common pixels - fully opaque and fully transparent foreground
      // with no mix - reduce to a copy, and the general formula below gives exactly these
      // values for them (t = 1 and t = 0 on integer channels). Most of a frame is one or the
      // other, so most pixels skip four rounds and eight multiplies.
      if (alpha === 255) {
        out.r = fr; out.g = fgG; out.b = fb; out.a = 255;
        return;
      }
      if (alpha === 0) {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
        return;
      }
      const t = alpha / 255;
      const u = 1 - t;
      out.r = clamp255(fr * t + br * u);
      out.g = clamp255(fgG * t + bgG * u);
      out.b = clamp255(fb * t + bb * u);
      out.a = clamp255(alpha + ba * u);
      return;
    }
    case "Effect 1": {
      const emt = effectMixThreshold;
      out.r = clamp255(fr * emt + br * (1 - emt));
      out.g = clamp255(fgG * emt + bgG * (1 - emt));
      out.b = clamp255(fb * emt + bb * (1 - emt));
      out.a = 255;
      return;
    }
    case "Effect 2": {
      const emt = 1 - effectMixThreshold;
      out.r = clamp255(fr * emt + br * (1 - emt));
      out.g = clamp255(fgG * emt + bgG * (1 - emt));
      out.b = clamp255(fb * emt + bb * (1 - emt));
      out.a = 255;
      return;
    }
    case "Average":
      if (bgIsBlack) {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      } else if (!fgIsBlack) {
        out.r = clamp255((fr + br) / 2);
        out.g = clamp255((fgG + bgG) / 2);
        out.b = clamp255((fb + bb) / 2);
        out.a = clamp255((fa + ba) / 2);
      } else {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      }
      return;
    case "Additive":
      out.r = clamp255(fr + br); out.g = clamp255(fgG + bgG); out.b = clamp255(fb + bb); out.a = 255;
      return;
    case "Subtractive":
      out.r = clamp255(br - fr); out.g = clamp255(bgG - fgG); out.b = clamp255(bb - fb); out.a = 255;
      return;
    case "Max": {
      const alphaMul = fa / 255;
      out.r = clamp255(Math.max(fr, br) * alphaMul);
      out.g = clamp255(Math.max(fgG, bgG) * alphaMul);
      out.b = clamp255(Math.max(fb, bb) * alphaMul);
      out.a = 255;
      return;
    }
    case "Min": {
      const alphaMul = fa / 255;
      out.r = clamp255(Math.min(fr, br) * alphaMul);
      out.g = clamp255(Math.min(fgG, bgG) * alphaMul);
      out.b = clamp255(Math.min(fb, bb) * alphaMul);
      out.a = 255;
      return;
    }
    case "1 reveals 2":
      if (Math.max(fr, fgG, fb) / 255 > effectMixThreshold) {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      } else {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      }
      return;
    case "2 reveals 1":
      if (Math.max(br, bgG, bb) / 255 > effectMixThreshold) {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      } else {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      }
      return;

    // A mask hides: where this layer has something lit, the layer below is punched out.
    case "1 is Mask":
      if (fgIsBlack) {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      } else {
        out.r = 0; out.g = 0; out.b = 0; out.a = 0;
      }
      return;
    case "2 is Mask":
      if (bgIsBlack) {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      } else {
        out.r = 0; out.g = 0; out.b = 0; out.a = 0;
      }
      return;

    // An unmask is the converse - the layer below shows only through what this layer lights.
    case "1 is Unmask":
      if (fgIsBlack) {
        out.r = 0; out.g = 0; out.b = 0; out.a = 0;
      } else {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      }
      return;
    case "2 is Unmask":
      if (bgIsBlack) {
        out.r = 0; out.g = 0; out.b = 0; out.a = 0;
      } else {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      }
      return;

    // A shadow keeps one layer's colour and dims it by how bright the other is.
    case "Shadow 1 on 2": {
      const level = 1 - Math.max(fr, fgG, fb) / 255;
      out.r = clamp255(br * level); out.g = clamp255(bgG * level); out.b = clamp255(bb * level); out.a = ba;
      return;
    }
    case "Shadow 2 on 1": {
      const level = 1 - Math.max(br, bgG, bb) / 255;
      out.r = clamp255(fr * level); out.g = clamp255(fgG * level); out.b = clamp255(fb * level); out.a = fa;
      return;
    }

    // Layered shows this layer wherever it has anything to show, and the layer below elsewhere -
    // the same idea as Normal, but decided per pixel rather than blended.
    case "Layered":
      if (fgIsBlack) {
        out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      } else {
        out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      }
      return;

    // Brightness uses this layer purely as a dimmer over the one below.
    case "Brightness": {
      const level = Math.max(fr, fgG, fb) / 255;
      out.r = clamp255(br * level); out.g = clamp255(bgG * level); out.b = clamp255(bb * level); out.a = ba;
      return;
    }
    // The effect was given the background to work on, so what it returns is the whole answer -
    // including where it cleared a pixel, which a Normal blend would have quietly kept.
    case "Canvas":
      out.r = fr; out.g = fgG; out.b = fb; out.a = fa;
      return;

    // The two positional modes: the layer below shows at one edge of the model, this layer at the
    // other, mixed across the span between them. Bottom-Top and Left-Right differ only in which
    // axis the caller measured, so they share one implementation - the axis is chosen where the
    // position is computed (layerStack.ts), which is the only place that knows the geometry.
    case "Bottom-Top":
    case "Left-Right": {
      const t = clamp01(position01);
      out.r = clamp255(br + (fr - br) * t);
      out.g = clamp255(bgG + (fgG - bgG) * t);
      out.b = clamp255(bb + (fb - bb) * t);
      out.a = clamp255(ba + (fa - ba) * t);
      return;
    }

    // "The morph option of layer blending will magically make effect 1 'morph' into effect 2
    // during the length of the timing cell that the effects are in." So it is a cross-fade driven
    // by how far through the effect the playhead is, not by the Mix slider - renderFrame.ts puts
    // that position here in place of the slider value.
    case "Morph": {
      const t = clamp01(effectMixThreshold);
      out.r = clamp255(br + (fr - br) * t);
      out.g = clamp255(bgG + (fgG - bgG) * t);
      out.b = clamp255(bb + (fb - bb) * t);
      out.a = clamp255(ba + (fa - ba) * t);
      return;
    }
    default:
      out.r = br; out.g = bgG; out.b = bb; out.a = ba;
      return;
  }
}
