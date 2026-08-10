// SPEC ch9 §"Value curves": a slider parameter can animate over the effect's duration
// instead of holding a flat value. ponytail: one curve type (Ramp = linear interpolation,
// the simplest and most common case) as a proof of the mechanism end-to-end - schema flags
// a param as VC-eligible (EFFECT_SCHEMAS' `valueCurve: true`), a param can hold a ValueCurve
// object instead of a number, and effects resolve it per-frame via resolveParam. The full VC
// system (Sine/Ramp/Square/Custom types, presets, the point editor) is an M6+ follow-up.
export interface ValueCurve {
  type: "Ramp";
  min: number;
  max: number;
}

export type CurvedNumber = number | ValueCurve;

export function isValueCurve(v: unknown): v is ValueCurve {
  return typeof v === "object" && v !== null && (v as ValueCurve).type === "Ramp";
}

export function resolveParam(value: CurvedNumber, position01: number): number {
  if (typeof value === "number") return value;
  if (value.type === "Ramp") return value.min + (value.max - value.min) * position01;
  return 0;
}
