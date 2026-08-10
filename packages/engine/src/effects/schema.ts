// SPEC ch7-9 parameter tables -> UI control descriptors. Keys match each effect's *Params
// interface exactly (e.g. OnParams) so the props panel can bind straight to them.
export interface EffectParamSpec {
  key: string;
  label: string;
  type: "intSlider" | "floatSlider" | "checkbox";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
  valueCurve?: boolean; // has a "VC" button in xLights (stubbed until M6)
}

export interface EffectSchema {
  name: string;
  params: EffectParamSpec[];
}

// SPEC ch8 "On" table verbatim.
export const ON_EFFECT_SCHEMA: EffectSchema = {
  name: "On",
  params: [
    { key: "startIntensity", label: "Start Intensity", type: "intSlider", min: 0, max: 100, default: 100 },
    { key: "endIntensity", label: "End Intensity", type: "intSlider", min: 0, max: 100, default: 100 },
    { key: "transparencyPct", label: "Transparency", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "cycles", label: "Cycle Count", type: "floatSlider", min: 0, max: 100, step: 0.1, default: 1 },
    { key: "shimmer", label: "Shimmer", type: "checkbox", default: false },
  ],
};

export const EFFECT_SCHEMAS: Record<string, EffectSchema> = {
  On: ON_EFFECT_SCHEMA,
};

export function defaultParamsFor(effectName: string): Record<string, number | boolean> {
  const schema = EFFECT_SCHEMAS[effectName];
  if (!schema) return {};
  return Object.fromEntries(schema.params.map((p) => [p.key, p.default]));
}
