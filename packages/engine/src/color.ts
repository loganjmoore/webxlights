export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function rgba(r: number, g: number, b: number, a = 255): RGBA {
  return { r, g, b, a };
}

// `<input type="color">` <-> RGBA - the wire format for a per-effect palette override
// (SequenceEffect.palette on apps/web's side), always opaque (a=255).
export function hexToRgba(hex: string): RGBA {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
}
export function rgbaToHex(c: RGBA): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

// The app-wide fallback palette for any effect without its own per-effect Color override -
// a "warm white LED" look, matching what real xLights ships with in a blank sequence. One
// source of truth (used to be copy-pasted RGBA literals in HousePreview.vue and fseqExport.ts).
export const DEFAULT_PALETTE_HEX = ["#ffc878", "#50a0ff"];
export const DEFAULT_PALETTE: RGBA[] = DEFAULT_PALETTE_HEX.map(hexToRgba);

// SPEC ch7-8 "On" effect ramps HSV.value; standard RGB<->HSV, H in [0,360), S/V in [0,1].
export function rgbToHsv(c: RGBA): { h: number; s: number; v: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb(h: number, s: number, v: number, a = 255): RGBA {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgba(Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255), a);
}

// Full-saturation pure hue (Rainbow color schemes in Butterfly/Meteors). hue01 in [0,1).
export function h2rgb(hue01: number): RGBA {
  return hsvToRgb(((hue01 % 1) + 1) % 1 * 360, 1, 1);
}

export function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  const clamped = Math.max(0, Math.min(1, t));
  return rgba(
    Math.round(a.r + (b.r - a.r) * clamped),
    Math.round(a.g + (b.g - a.g) * clamped),
    Math.round(a.b + (b.b - a.b) * clamped),
    Math.round(a.a + (b.a - a.a) * clamped),
  );
}

// SPEC "GetMultiColorBlend": blend across the whole palette by position t in [0,1).
// circular=true wraps the last color back into the first (seamless loop); otherwise the
// last segment holds palette[N-1] fixed at t=1 (no wrap).
export function multiColorBlend(palette: RGBA[], t: number, circular = false): RGBA {
  const n = palette.length;
  if (n === 0) return rgba(0, 0, 0, 0);
  if (n === 1) return palette[0]!;
  const segments = circular ? n : n - 1;
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * segments;
  const idx = Math.floor(scaled) % n;
  const nextIdx = (idx + 1) % n;
  const frac = scaled - Math.floor(scaled);
  return lerpColor(palette[idx]!, palette[nextIdx]!, frac);
}

// SPEC "Get2ColorBlend": blend between two explicit palette indices by pct in [0,1].
export function twoColorBlend(palette: RGBA[], idx1: number, idx2: number, pct: number): RGBA {
  const c1 = palette[idx1 % palette.length]!;
  const c2 = palette[idx2 % palette.length]!;
  return lerpColor(c1, c2, pct);
}
