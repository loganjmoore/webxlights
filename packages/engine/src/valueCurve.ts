// SPEC ch9 §"Value curves": any slider parameter can animate across the effect's duration
// instead of holding a flat value. A curve maps the effect's position (0..1) through a shape
// function (also 0..1), then scales that into the param's own [min,max] range.
//
// M6 originally shipped one type (Ramp) wired to one param as a proof of the mechanism. This
// is the full system: every xLights curve type, a Custom point-list type, and a generic
// resolution pass (`resolveParamsAtPosition`) that applies curves to *every* param of *every*
// effect without each effect needing to know curves exist.

export type ValueCurveType =
  | "Flat"
  | "Ramp"
  | "Ramp Up/Down"
  | "Ramp Down/Up"
  | "Saw Tooth"
  | "Triangle"
  | "Sine"
  | "Abs Sine"
  | "Square"
  | "Parabolic Up"
  | "Parabolic Down"
  | "Logarithmic Up"
  | "Logarithmic Down"
  | "Exponential Up"
  | "Exponential Down"
  | "Custom";

export const VALUE_CURVE_TYPES: ValueCurveType[] = [
  "Flat",
  "Ramp",
  "Ramp Up/Down",
  "Ramp Down/Up",
  "Saw Tooth",
  "Triangle",
  "Sine",
  "Abs Sine",
  "Square",
  "Parabolic Up",
  "Parabolic Down",
  "Logarithmic Up",
  "Logarithmic Down",
  "Exponential Up",
  "Exponential Down",
  "Custom",
];

// Curve types whose shape repeats; `cycles`/`phase01` only mean something for these.
export const PERIODIC_VALUE_CURVE_TYPES = new Set<ValueCurveType>([
  "Saw Tooth",
  "Triangle",
  "Sine",
  "Abs Sine",
  "Square",
  // Custom is periodic too: "a Custom curve has a Cycles control (1 to 10) that repeats the shape
  // you have drawn across the effect". A cycles of 1 - the default - is the whole span, so this
  // changes nothing for a curve nobody has asked to repeat.
  "Custom",
]);

/** The manual's own ceiling for the Custom curve's Cycles control. */
export const MAX_VALUE_CURVE_CYCLES = 10;

export interface ValueCurvePoint {
  x: number; // 0..1 across the effect
  y: number; // 0..1 shape value
}

export interface ValueCurve {
  type: ValueCurveType;
  min: number; // param value where the shape reads 0
  max: number; // param value where the shape reads 1 (and the value of a "Flat" curve)
  cycles?: number; // periodic types only, default 1
  phase01?: number; // periodic types only, 0..1 shift, default 0
  reverse?: boolean; // mirror the curve in time
  points?: ValueCurvePoint[]; // "Custom" only
}

export type CurvedNumber = number | ValueCurve;

const TYPE_SET = new Set<string>(VALUE_CURVE_TYPES);

export function isValueCurve(v: unknown): v is ValueCurve {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Partial<ValueCurve>;
  return typeof c.type === "string" && TYPE_SET.has(c.type) && typeof c.min === "number" && typeof c.max === "number";
}

export function makeValueCurve(type: ValueCurveType, min: number, max: number, extra: Partial<ValueCurve> = {}): ValueCurve {
  return { type, min, max, ...extra };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Position through a periodic curve's own repeating cycle, honouring cycles + phase.
function cyclePosition(curve: ValueCurve, x: number): number {
  const cycles = curve.cycles ?? 1;
  const phase = curve.phase01 ?? 0;
  const t = x * cycles + phase;
  return t - Math.floor(t);
}

// The 0..1 shape of a curve at effect position `position01` — the part that's independent of
// the param's own value range. Exported so the UI can draw the curve without knowing min/max.
export function valueCurveShape01(curve: ValueCurve, position01: number): number {
  const raw = clamp01(position01);
  const x = curve.reverse ? 1 - raw : raw;

  switch (curve.type) {
    case "Flat":
      return 1;
    case "Ramp":
      return x;
    case "Ramp Up/Down":
      return x <= 0.5 ? x * 2 : (1 - x) * 2;
    case "Ramp Down/Up":
      return x <= 0.5 ? 1 - x * 2 : (x - 0.5) * 2;
    case "Saw Tooth":
      return cyclePosition(curve, x);
    case "Triangle": {
      const t = cyclePosition(curve, x);
      return t <= 0.5 ? t * 2 : (1 - t) * 2;
    }
    case "Sine":
      return 0.5 + 0.5 * Math.sin(2 * Math.PI * cyclePosition(curve, x));
    case "Abs Sine":
      return Math.abs(Math.sin(Math.PI * cyclePosition(curve, x)));
    case "Square":
      return cyclePosition(curve, x) < 0.5 ? 1 : 0;
    case "Parabolic Up":
      // opens upward: high at both ends, 0 in the middle
      return (2 * x - 1) * (2 * x - 1);
    case "Parabolic Down":
      // opens downward: 0 at both ends, peak in the middle
      return 1 - (2 * x - 1) * (2 * x - 1);
    case "Logarithmic Up":
      // fast rise then flattens
      return Math.log10(1 + 9 * x);
    case "Logarithmic Down":
      return 1 - Math.log10(1 + 9 * x);
    case "Exponential Up":
      // slow start then accelerates
      return (Math.pow(10, x) - 1) / 9;
    case "Exponential Down":
      return 1 - (Math.pow(10, x) - 1) / 9;
    case "Custom": {
      // "A Custom curve has a Cycles control (1 to 10) that repeats the shape you have drawn
      // across the effect." So the drawn shape is a *period* rather than the whole span, which is
      // what makes a hand-drawn flicker usable on a four-second effect instead of only a slow one.
      //
      // Only wrapped when it actually repeats. cyclePosition takes the fractional part, so at
      // exactly the end of the effect it returns 0 - the start of the next cycle, which is right
      // when there is a next cycle and wrong when there isn't: a single-cycle custom curve holds
      // its last point past the end, and wrapping would send it back to its first.
      const cycles = curve.cycles ?? 1;
      return customShape01(curve.points ?? [], cycles > 1 ? cyclePosition(curve, x) : x);
    }
    default:
      return 0;
  }
}

// Piecewise-linear through the point list. Points are sorted by x; the curve holds the first
// point's y before it and the last point's y after it, so a partial list is still well-defined.
function customShape01(points: ValueCurvePoint[], x: number): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (x <= first.x) return clamp01(first.y);
  if (x >= last.x) return clamp01(last.y);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x;
      if (span <= 0) return clamp01(b.y);
      const t = (x - a.x) / span;
      return clamp01(a.y + (b.y - a.y) * t);
    }
  }
  return clamp01(last.y);
}

export function resolveParam(value: CurvedNumber, position01: number): number {
  if (typeof value === "number") return value;
  return value.min + (value.max - value.min) * valueCurveShape01(value, position01);
}

// Generic pass applied once per effect per frame, before the effect function runs: every param
// holding a ValueCurve object collapses to the number that curve produces at this position.
// This is why individual effects never have to know about curves — they always see plain
// numbers, so any param flagged `valueCurve: true` in EFFECT_SCHEMAS is automatically curvable.
export function resolveParamsAtPosition(
  params: Record<string, unknown>,
  position01: number,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const key in params) {
    const value = params[key];
    if (isValueCurve(value)) {
      if (!out) out = { ...params };
      out[key] = resolveParam(value, position01);
    }
  }
  return out ?? params;
}

// Evenly-spaced samples of a curve's shape, for drawing it in the editor.
export function sampleValueCurve(curve: ValueCurve, samples = 100): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) out.push(valueCurveShape01(curve, samples === 1 ? 0 : i / (samples - 1)));
  return out;
}
