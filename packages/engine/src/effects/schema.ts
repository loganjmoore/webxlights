// SPEC ch7-9 parameter tables -> UI control descriptors. Keys match each effect's *Params
// interface exactly (e.g. OnParams) so the props panel can bind straight to them.
export interface EffectParamSpec {
  key: string;
  label: string;
  type: "intSlider" | "floatSlider" | "checkbox" | "choice";
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // choice type only
  default: number | boolean | string;
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

export const BARS_EFFECT_SCHEMA: EffectSchema = {
  name: "Bars",
  params: [
    { key: "paletteRep", label: "Palette Rep", type: "intSlider", min: 1, max: 5, default: 1, valueCurve: true },
    { key: "cycles", label: "Cycles", type: "floatSlider", min: 0, max: 30, step: 0.1, default: 1, valueCurve: true },
    { key: "direction", label: "Direction", type: "choice", options: ["up", "down", "left", "right", "expand", "compress", "h-expand", "h-compress"], default: "up" },
    { key: "centerPercent", label: "Center Point", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
    { key: "highlight", label: "Highlight", type: "checkbox", default: false },
  ],
};

export const COLOR_WASH_EFFECT_SCHEMA: EffectSchema = {
  name: "Color Wash",
  params: [
    { key: "cycles", label: "Count", type: "floatSlider", min: 0.1, max: 20, step: 0.1, default: 1, valueCurve: true },
    { key: "verticalFade", label: "Vertical Fade", type: "checkbox", default: false },
    { key: "horizontalFade", label: "Horizontal Fade", type: "checkbox", default: false },
    { key: "reverseFades", label: "Reverse Fades", type: "checkbox", default: false },
    { key: "shimmer", label: "Shimmer", type: "checkbox", default: false },
    { key: "circularPalette", label: "Circular Palette", type: "checkbox", default: false },
  ],
};

export const FIRE_EFFECT_SCHEMA: EffectSchema = {
  name: "Fire",
  params: [
    { key: "height", label: "Height", type: "intSlider", min: 1, max: 100, default: 50, valueCurve: true },
    { key: "hueShift", label: "Hue Shift", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "growthCycles", label: "Growth Cycles", type: "floatSlider", min: 0, max: 20, step: 0.1, default: 0, valueCurve: true },
  ],
};

export const METEORS_EFFECT_SCHEMA: EffectSchema = {
  name: "Meteors",
  params: [
    { key: "colors", label: "Colors", type: "choice", options: ["rainbow", "range", "palette"], default: "rainbow" },
    { key: "count", label: "Count", type: "intSlider", min: 1, max: 100, default: 10, valueCurve: true },
    { key: "trailLength", label: "Trail Length", type: "intSlider", min: 1, max: 100, default: 25, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
  ],
};

export const BUTTERFLY_EFFECT_SCHEMA: EffectSchema = {
  name: "Butterfly",
  params: [
    { key: "colors", label: "Colors", type: "choice", options: ["rainbow", "palette"], default: "rainbow" },
    { key: "chunks", label: "Bkgrd Chunks", type: "intSlider", min: 1, max: 10, default: 1, valueCurve: true },
    { key: "skip", label: "Bkgrd Skip", type: "intSlider", min: 2, max: 10, default: 2, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 100, default: 10, valueCurve: true },
    { key: "reverse", label: "Reverse Direction", type: "checkbox", default: false },
  ],
};

export const SINGLE_STRAND_CHASE_EFFECT_SCHEMA: EffectSchema = {
  name: "SingleStrand",
  params: [
    { key: "chaseSizePct", label: "Chase Size", type: "intSlider", min: 1, max: 100, default: 10, valueCurve: true },
    { key: "cycles", label: "Cycles", type: "floatSlider", min: 0.1, max: 50, step: 0.1, default: 1, valueCurve: true },
    { key: "offsetPct", label: "Offset", type: "floatSlider", min: -500, max: 500, step: 1, default: 0, valueCurve: true },
  ],
};

export const SNOWFLAKES_EFFECT_SCHEMA: EffectSchema = {
  name: "Snowflakes",
  params: [{ key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true }],
};

export const SPIRALS_EFFECT_SCHEMA: EffectSchema = {
  name: "Spirals",
  params: [
    { key: "paletteRep", label: "Palette Rep", type: "intSlider", min: 1, max: 5, default: 1, valueCurve: true },
    { key: "spiralWraps", label: "Spiral Wraps", type: "floatSlider", min: -30, max: 30, step: 0.1, default: 2, valueCurve: true },
    { key: "thicknessPct", label: "Thickness", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "movement", label: "Movement", type: "floatSlider", min: -20, max: 20, step: 0.1, default: 1, valueCurve: true },
    { key: "blend", label: "Blend", type: "checkbox", default: false },
  ],
};

export const TWINKLE_EFFECT_SCHEMA: EffectSchema = {
  name: "Twinkle",
  params: [
    { key: "countPct", label: "Percent of Lights", type: "intSlider", min: 2, max: 100, default: 3, valueCurve: true },
    { key: "steps", label: "Twinkle Steps", type: "intSlider", min: 2, max: 400, default: 30, valueCurve: true },
  ],
};

export const EFFECT_SCHEMAS: Record<string, EffectSchema> = {
  On: ON_EFFECT_SCHEMA,
  Bars: BARS_EFFECT_SCHEMA,
  "Color Wash": COLOR_WASH_EFFECT_SCHEMA,
  Fire: FIRE_EFFECT_SCHEMA,
  Meteors: METEORS_EFFECT_SCHEMA,
  Butterfly: BUTTERFLY_EFFECT_SCHEMA,
  SingleStrand: SINGLE_STRAND_CHASE_EFFECT_SCHEMA,
  Snowflakes: SNOWFLAKES_EFFECT_SCHEMA,
  Spirals: SPIRALS_EFFECT_SCHEMA,
  Twinkle: TWINKLE_EFFECT_SCHEMA,
};

export function defaultParamsFor(effectName: string): Record<string, number | boolean | string> {
  const schema = EFFECT_SCHEMAS[effectName];
  if (!schema) return {};
  return Object.fromEntries(schema.params.map((p) => [p.key, p.default]));
}
