import { rgba, rgbToHsv, type RGBA } from "./color";

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

// Linear cross-fade from the background to the foreground. Alpha travels with the colour, so a
// cross-fade into a transparent layer fades out rather than fading to black.
function mixTowards(fg: RGBA, bg: RGBA, t: number): RGBA {
  return rgba(
    clamp255(bg.r + (fg.r - bg.r) * t),
    clamp255(bg.g + (fg.g - bg.g) * t),
    clamp255(bg.b + (fg.b - bg.b) * t),
    clamp255(bg.a + (fg.a - bg.a) * t),
  );
}

function value(c: RGBA): number {
  return rgbToHsv(c).v; // 0..1
}

// Keeps `subject`'s colour, dimmed by how bright `by` is: a bright shadow layer darkens most.
function shadow(subject: RGBA, by: RGBA): RGBA {
  const level = 1 - value(by);
  return rgba(clamp255(subject.r * level), clamp255(subject.g * level), clamp255(subject.b * level), subject.a);
}

function isBlack(c: RGBA): boolean {
  return c.r === 0 && c.g === 0 && c.b === 0 && (c.a === 0 || c.a === undefined);
}

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
  switch (mode) {
    case "Normal": {
      const alpha = fg.a * (1 - effectMixThreshold);
      const t = alpha / 255;
      return rgba(
        clamp255(fg.r * t + bg.r * (1 - t)),
        clamp255(fg.g * t + bg.g * (1 - t)),
        clamp255(fg.b * t + bg.b * (1 - t)),
        clamp255(alpha + bg.a * (1 - t)),
      );
    }
    case "Effect 1": {
      const emt = effectMixThreshold;
      return rgba(
        clamp255(fg.r * emt + bg.r * (1 - emt)),
        clamp255(fg.g * emt + bg.g * (1 - emt)),
        clamp255(fg.b * emt + bg.b * (1 - emt)),
        255,
      );
    }
    case "Effect 2": {
      const emt = 1 - effectMixThreshold;
      return rgba(
        clamp255(fg.r * emt + bg.r * (1 - emt)),
        clamp255(fg.g * emt + bg.g * (1 - emt)),
        clamp255(fg.b * emt + bg.b * (1 - emt)),
        255,
      );
    }
    case "Average": {
      if (isBlack(bg)) return fg;
      if (!isBlack(fg)) {
        return rgba(
          clamp255((fg.r + bg.r) / 2),
          clamp255((fg.g + bg.g) / 2),
          clamp255((fg.b + bg.b) / 2),
          clamp255((fg.a + bg.a) / 2),
        );
      }
      return bg;
    }
    case "Additive":
      return rgba(clamp255(fg.r + bg.r), clamp255(fg.g + bg.g), clamp255(fg.b + bg.b), 255);
    case "Subtractive":
      return rgba(clamp255(bg.r - fg.r), clamp255(bg.g - fg.g), clamp255(bg.b - fg.b), 255);
    case "Max": {
      const alphaMul = fg.a / 255;
      return rgba(
        clamp255(Math.max(fg.r, bg.r) * alphaMul),
        clamp255(Math.max(fg.g, bg.g) * alphaMul),
        clamp255(Math.max(fg.b, bg.b) * alphaMul),
        255,
      );
    }
    case "Min": {
      const alphaMul = fg.a / 255;
      return rgba(
        clamp255(Math.min(fg.r, bg.r) * alphaMul),
        clamp255(Math.min(fg.g, bg.g) * alphaMul),
        clamp255(Math.min(fg.b, bg.b) * alphaMul),
        255,
      );
    }
    case "1 reveals 2":
      return value(fg) > effectMixThreshold ? fg : bg;
    case "2 reveals 1":
      return value(bg) > effectMixThreshold ? bg : fg;

    // A mask hides: where this layer has something lit, the layer below is punched out.
    case "1 is Mask":
      return isBlack(fg) ? bg : rgba(0, 0, 0, 0);
    case "2 is Mask":
      return isBlack(bg) ? fg : rgba(0, 0, 0, 0);

    // An unmask is the converse - the layer below shows only through what this layer lights.
    case "1 is Unmask":
      return isBlack(fg) ? rgba(0, 0, 0, 0) : bg;
    case "2 is Unmask":
      return isBlack(bg) ? rgba(0, 0, 0, 0) : fg;

    // A shadow keeps one layer's colour and dims it by how dark the other is.
    case "Shadow 1 on 2":
      return shadow(bg, fg);
    case "Shadow 2 on 1":
      return shadow(fg, bg);

    // Layered shows this layer wherever it has anything to show, and the layer below elsewhere -
    // the same idea as Normal, but decided per pixel rather than blended.
    case "Layered":
      return isBlack(fg) ? bg : fg;

    // Brightness uses this layer purely as a dimmer over the one below.
    case "Brightness": {
      const level = value(fg);
      return rgba(clamp255(bg.r * level), clamp255(bg.g * level), clamp255(bg.b * level), bg.a);
    }
    // The effect was given the background to work on, so what it returns is the whole answer -
    // including where it cleared a pixel, which a Normal blend would have quietly kept.
    case "Canvas":
      return fg;

    // The two positional modes: the layer below shows at one edge of the model, this layer at the
    // other, mixed across the span between them. Bottom-Top and Left-Right differ only in which
    // axis the caller measured, so they share one implementation - the axis is chosen where the
    // position is computed (layerStack.ts), which is the only place that knows the geometry.
    case "Bottom-Top":
    case "Left-Right":
      return mixTowards(fg, bg, clamp01(position01));

    // "The morph option of layer blending will magically make effect 1 'morph' into effect 2
    // during the length of the timing cell that the effects are in." So it is a cross-fade driven
    // by how far through the effect the playhead is, not by the Mix slider - renderFrame.ts puts
    // that position here in place of the slider value.
    case "Morph":
      return mixTowards(fg, bg, clamp01(effectMixThreshold));
    default:
      return bg;
  }
}
