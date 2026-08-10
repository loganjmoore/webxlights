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
  | "2 reveals 1";

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

function value(c: RGBA): number {
  return rgbToHsv(c).v; // 0..1
}

function isBlack(c: RGBA): boolean {
  return c.r === 0 && c.g === 0 && c.b === 0 && (c.a === 0 || c.a === undefined);
}

// SPEC ch9 §5.2 "Layer Method": fg = this layer's pixel, bg = accumulated result of the
// layers below it. M3 scope = the 10 modes in the goal prompt; the other 14 (masks, shadow,
// highlight, split-screen, brightness-multiply, layered) are a documented ceiling.
export function blendPixel(fg: RGBA, bg: RGBA, mode: BlendMode, effectMixThreshold: number): RGBA {
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
    default:
      return bg;
  }
}
