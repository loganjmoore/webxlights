import { ADJUST_MODES } from "./adjust";
import { KALEIDOSCOPE_TYPES } from "./kaleidoscope";
import { FACE_EYE_MODES } from "./faces";
import { PIANO_SOURCES, PIANO_TYPES } from "./piano";
import { STATE_COLOR_MODES, STATE_MODES } from "./state";
import { VU_METER_TYPES } from "./vuMeter";
import { TENDRIL_MOVEMENTS } from "./tendrils";
import { WARP_TREATMENTS, WARP_TYPES } from "./warp";

// SPEC ch7-9 parameter tables -> UI control descriptors. Keys match each effect's *Params
// interface exactly (e.g. OnParams) so the props panel can bind straight to them.
export interface EffectParamSpec {
  key: string;
  label: string;
  type: "intSlider" | "floatSlider" | "checkbox" | "choice" | "text" | "image";
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // choice type only
  /**
   * A choice whose options aren't known until there is a sequence and a model to look at - the
   * timing tracks this sequence has, the state definitions this model carries. The schema names
   * the source and the props panel fills it in; an empty list is a real answer ("no timing tracks
   * yet"), which is why it isn't just `options`.
   */
  optionsFrom?: "timingTracks" | "stateDefinitions" | "faceDefinitions" | "phonemes";
  default: number | boolean | string;
  valueCurve?: boolean; // param accepts a ValueCurve as well as a flat number (valueCurve.ts)
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

export const STROBE_EFFECT_SCHEMA: EffectSchema = {
  name: "Strobe",
  params: [
    { key: "numberStrobes", label: "Number Strobes", type: "intSlider", min: 1, max: 300, default: 3 },
    { key: "duration", label: "Strobe Duration", type: "intSlider", min: 1, max: 100, default: 10 },
    { key: "type", label: "Strobe Type", type: "intSlider", min: 1, max: 4, default: 1 },
  ],
};

export const RIPPLE_EFFECT_SCHEMA: EffectSchema = {
  name: "Ripple",
  params: [
    { key: "movement", label: "Movement", type: "choice", options: ["explode", "implode"], default: "explode" },
    { key: "cycles", label: "Cycle Cnt", type: "floatSlider", min: 0, max: 30, step: 0.1, default: 1, valueCurve: true },
    { key: "thickness", label: "Ripples", type: "intSlider", min: 1, max: 100, default: 3, valueCurve: true },
  ],
};

export const WAVE_EFFECT_SCHEMA: EffectSchema = {
  name: "Wave",
  params: [
    { key: "numberOfWavesDeg", label: "Number of Waves", type: "intSlider", min: 180, max: 3600, default: 900, valueCurve: true },
    { key: "thicknessPct", label: "Thickness of Wave", type: "intSlider", min: 0, max: 100, default: 5, valueCurve: true },
    { key: "heightPct", label: "Scale Height of Wave", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "speed", label: "Speed", type: "floatSlider", min: 0, max: 50, step: 0.1, default: 10, valueCurve: true },
    { key: "leftToRight", label: "Left to Right", type: "checkbox", default: false },
  ],
};

export const PINWHEEL_EFFECT_SCHEMA: EffectSchema = {
  name: "Pinwheel",
  params: [
    { key: "arms", label: "#Arms", type: "intSlider", min: 1, max: 20, default: 3 },
    { key: "armSizePct", label: "Size", type: "intSlider", min: 0, max: 400, default: 100, valueCurve: true },
    { key: "thicknessPct", label: "Thick", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
    { key: "counterClockwise", label: "Rotation (CCW)", type: "checkbox", default: true },
  ],
};

export const SHOCKWAVE_EFFECT_SCHEMA: EffectSchema = {
  name: "Shockwave",
  params: [
    { key: "centerXPct", label: "Center X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "centerYPct", label: "Center Y", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "startRadius", label: "Radius1", type: "intSlider", min: 0, max: 750, default: 1, valueCurve: true },
    { key: "endRadius", label: "Radius2", type: "intSlider", min: 0, max: 750, default: 10, valueCurve: true },
    { key: "startWidth", label: "Width1", type: "intSlider", min: 0, max: 255, default: 5, valueCurve: true },
    { key: "endWidth", label: "Width2", type: "intSlider", min: 0, max: 255, default: 10, valueCurve: true },
    { key: "cycles", label: "Cycles", type: "intSlider", min: 1, max: 100, default: 1 },
    { key: "blendEdges", label: "Blend Edges", type: "checkbox", default: true },
  ],
};

export const GARLANDS_EFFECT_SCHEMA: EffectSchema = {
  name: "Garlands",
  params: [
    { key: "type", label: "Type", type: "intSlider", min: 0, max: 4, default: 0 },
    { key: "spacing", label: "Spacing", type: "intSlider", min: 1, max: 100, default: 10, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
    { key: "fillPct", label: "Fill", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
  ],
};

export const CURTAIN_EFFECT_SCHEMA: EffectSchema = {
  name: "Curtain",
  params: [
    { key: "edge", label: "Edge", type: "choice", options: ["left", "right", "center", "top", "bottom"], default: "center" },
    { key: "movement", label: "Movement", type: "choice", options: ["open", "close", "open then close", "close then open"], default: "open" },
    { key: "swagPct", label: "Swag", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "repeat", label: "Repeat", type: "intSlider", min: 1, max: 10, default: 1 },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
  ],
};

export const PLASMA_EFFECT_SCHEMA: EffectSchema = {
  name: "Plasma",
  params: [
    { key: "style", label: "Style", type: "intSlider", min: 1, max: 4, default: 1 },
    { key: "lineDensity", label: "Line Density", type: "intSlider", min: 1, max: 10, default: 3, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
    { key: "colors", label: "Colors", type: "choice", options: ["palette", "rainbow"], default: "rainbow" },
  ],
};

export const GALAXY_EFFECT_SCHEMA: EffectSchema = {
  name: "Galaxy",
  params: [
    { key: "centerXPct", label: "Center X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "centerYPct", label: "Center Y", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "startRadius", label: "Start Radius", type: "intSlider", min: 0, max: 200, default: 1, valueCurve: true },
    { key: "endRadius", label: "End Radius", type: "intSlider", min: 0, max: 200, default: 20, valueCurve: true },
    { key: "startAngleDeg", label: "Start Angle", type: "intSlider", min: 0, max: 360, default: 0, valueCurve: true },
    { key: "revolutionsDeg", label: "Revolutions", type: "intSlider", min: 90, max: 3600, default: 1440, valueCurve: true },
    { key: "startWidth", label: "Start Width", type: "intSlider", min: 1, max: 50, default: 5, valueCurve: true },
    { key: "endWidth", label: "End Width", type: "intSlider", min: 1, max: 50, default: 2, valueCurve: true },
    { key: "durationPct", label: "Duration", type: "intSlider", min: 1, max: 100, default: 100, valueCurve: true },
    { key: "reverse", label: "Reverse", type: "checkbox", default: false },
    { key: "blendEdges", label: "Blend Edges", type: "checkbox", default: true },
    { key: "inward", label: "Inward", type: "checkbox", default: false },
  ],
};

export const FAN_EFFECT_SCHEMA: EffectSchema = {
  name: "Fan",
  params: [
    { key: "centerXPct", label: "Center X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "centerYPct", label: "Center Y", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "startRadiusPct", label: "Start Radius", type: "intSlider", min: 0, max: 100, default: 10, valueCurve: true },
    { key: "endRadiusPct", label: "End Radius", type: "intSlider", min: 0, max: 100, default: 80, valueCurve: true },
    { key: "startAngleDeg", label: "Start Angle", type: "intSlider", min: 0, max: 360, default: 0, valueCurve: true },
    { key: "revolutionsDeg", label: "Revolutions", type: "intSlider", min: 0, max: 3600, default: 720, valueCurve: true },
    { key: "bladeCount", label: "Blades", type: "intSlider", min: 1, max: 10, default: 3 },
    { key: "bladeWidthDeg", label: "Blade Width", type: "intSlider", min: 1, max: 360, default: 40, valueCurve: true },
    { key: "bladeAngleDeg", label: "Blade Angle", type: "intSlider", min: -180, max: 180, default: 30, valueCurve: true },
    { key: "elementCount", label: "Num Elements", type: "intSlider", min: 1, max: 8, default: 1 },
    { key: "elementWidthPct", label: "Element Width", type: "intSlider", min: 1, max: 100, default: 100, valueCurve: true },
    { key: "reverse", label: "Reverse", type: "checkbox", default: false },
    { key: "blendEdges", label: "Blend Edges", type: "checkbox", default: true },
  ],
};

export const MARQUEE_EFFECT_SCHEMA: EffectSchema = {
  name: "Marquee",
  params: [
    { key: "bandCount", label: "Bands", type: "intSlider", min: 1, max: 10, default: 3 },
    { key: "bandSize", label: "Band Size", type: "intSlider", min: 1, max: 50, default: 4, valueCurve: true },
    { key: "skipSize", label: "Skip Size", type: "intSlider", min: 0, max: 50, default: 2, valueCurve: true },
    { key: "thickness", label: "Thickness", type: "intSlider", min: 1, max: 10, default: 1, valueCurve: true },
    { key: "stagger", label: "Stagger", type: "intSlider", min: -20, max: 20, default: 0, valueCurve: true },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
    { key: "reverse", label: "Reverse", type: "checkbox", default: false },
  ],
};

export const CIRCLES_EFFECT_SCHEMA: EffectSchema = {
  name: "Circles",
  params: [
    { key: "count", label: "Count", type: "intSlider", min: 1, max: 50, default: 5, valueCurve: true },
    { key: "size", label: "Size", type: "intSlider", min: 1, max: 50, default: 4, valueCurve: true },
    { key: "movement", label: "Movement", type: "choice", options: ["bounce", "radial", "explode", "none"], default: "bounce" },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 10, valueCurve: true },
    { key: "fade", label: "Fade Edges", type: "checkbox", default: false },
    { key: "bubbles", label: "Bubbles", type: "checkbox", default: false },
  ],
};

export const TEXT_EFFECT_SCHEMA: EffectSchema = {
  name: "Text",
  params: [
    { key: "text", label: "Text", type: "text", default: "MERRY CHRISTMAS" },
    { key: "scale", label: "Size", type: "intSlider", min: 1, max: 4, default: 1 },
    { key: "movement", label: "Movement", type: "choice", options: ["none", "left", "right", "up", "down"], default: "left" },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 1, valueCurve: true },
    { key: "xOffsetPct", label: "X Offset", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
    { key: "yOffsetPct", label: "Y Offset", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
    { key: "perCharacterColor", label: "Color per Character", type: "checkbox", default: false },
  ],
};

export const PICTURES_EFFECT_SCHEMA: EffectSchema = {
  name: "Pictures",
  params: [
    { key: "image", label: "Image", type: "image", default: "" },
    { key: "scaleMode", label: "Scale", type: "choice", options: ["fit", "stretch", "none"], default: "fit" },
    { key: "movement", label: "Movement", type: "choice", options: ["none", "left", "right", "up", "down", "scaled"], default: "none" },
    { key: "speed", label: "Speed", type: "intSlider", min: 0, max: 50, default: 1, valueCurve: true },
    { key: "transparentBlack", label: "Black is Transparent", type: "checkbox", default: false },
    { key: "brightnessPct", label: "Brightness", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
  ],
};

export const VU_METER_EFFECT_SCHEMA: EffectSchema = {
  name: "VU Meter",
  params: [
    {
      key: "type",
      label: "Type",
      type: "choice",
      options: [...VU_METER_TYPES],
      default: "Spectrogram",
    },
    // Only the timing-event types read this; the rest are driven by the audio. Listed once here
    // rather than as a second schema, because it is one effect with one Type list in xLights too.
    { key: "timingTrack", label: "Timing Track", type: "choice", optionsFrom: "timingTracks", default: "" },
    // MIDI note numbers: 48 is C3 and 84 is C6, which spans most of where a mix has melody.
    // Only the note and dominant-frequency types read them.
    { key: "startNote", label: "Start Note", type: "intSlider", min: 0, max: 127, default: 48 },
    { key: "endNote", label: "End Note", type: "intSlider", min: 0, max: 127, default: 84 },
    { key: "bars", label: "Bars", type: "intSlider", min: 1, max: 32, default: 12, valueCurve: true },
    { key: "gainPct", label: "Gain", type: "intSlider", min: 0, max: 300, default: 100, valueCurve: true },
    { key: "sensitivityPct", label: "Sensitivity", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
  ],
};

export const OFF_EFFECT_SCHEMA: EffectSchema = {
  name: "Off",
  params: [{ key: "transparent", label: "Transparent", type: "checkbox", default: false }],
};

export const SHIMMER_EFFECT_SCHEMA: EffectSchema = {
  name: "Shimmer",
  params: [
    { key: "dutyFactor", label: "Duty Factor", type: "intSlider", min: 1, max: 100, default: 50, valueCurve: true },
    { key: "cycleCount", label: "Cycle Count", type: "intSlider", min: 1, max: 100, default: 10, valueCurve: true },
    { key: "useAllColors", label: "Use All Colors", type: "checkbox", default: false },
  ],
};

export const FILL_EFFECT_SCHEMA: EffectSchema = {
  name: "Fill",
  params: [
    { key: "position", label: "Position", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "bandSize", label: "Band Size", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "skipSize", label: "Skip Size", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "offset", label: "Offset", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "changeColorOverTime", label: "Change Color based on Time", type: "checkbox", default: false },
    { key: "direction", label: "Direction", type: "choice", options: ["up", "down", "left", "right"], default: "up" },
  ],
};

export const SNOW_STORM_EFFECT_SCHEMA: EffectSchema = {
  name: "Snow Storm",
  params: [
    { key: "maxFlakes", label: "Max Flakes", type: "intSlider", min: 1, max: 100, default: 20 },
    { key: "trailLength", label: "Trail Length", type: "intSlider", min: 0, max: 20, default: 3 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 100, default: 20 },
  ],
};

export const LIFE_EFFECT_SCHEMA: EffectSchema = {
  name: "Life",
  params: [
    { key: "cellsToStart", label: "Cells to Start", type: "intSlider", min: 1, max: 100, default: 30 },
    { key: "type", label: "Type", type: "intSlider", min: 0, max: 3, default: 0 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 100, default: 25 },
  ],
};

export const LIGHTNING_EFFECT_SCHEMA: EffectSchema = {
  name: "Lightning",
  params: [
    { key: "segments", label: "Number of Segments", type: "intSlider", min: 1, max: 20, default: 4, valueCurve: true },
    { key: "boltWidth", label: "Width of Bolt", type: "intSlider", min: 1, max: 20, default: 3, valueCurve: true },
    { key: "forked", label: "Forked Lightning", type: "checkbox", default: false },
    { key: "topX", label: "Top Location X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "xMovement", label: "X Movement", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
    { key: "direction", label: "Direction", type: "choice", options: ["down", "up"], default: "down" },
  ],
};

export const CANDLE_EFFECT_SCHEMA: EffectSchema = {
  name: "Candle",
  params: [
    { key: "flameAgility", label: "Flame Agility", type: "intSlider", min: 1, max: 20, default: 10 },
    { key: "windBaseline", label: "Wind Baseline", type: "intSlider", min: 0, max: 100, default: 60 },
    { key: "windVariability", label: "Wind Variability", type: "intSlider", min: 0, max: 100, default: 40 },
    { key: "windCalmness", label: "Wind Calmness", type: "intSlider", min: 0, max: 100, default: 30 },
    { key: "perNode", label: "Per Node", type: "checkbox", default: false },
    { key: "useColorPalette", label: "Use Color Palette", type: "checkbox", default: false },
  ],
};

export const LINES_EFFECT_SCHEMA: EffectSchema = {
  name: "Lines",
  params: [
    { key: "lines", label: "Lines", type: "intSlider", min: 1, max: 10, default: 2 },
    { key: "points", label: "Points", type: "intSlider", min: 2, max: 10, default: 4 },
    { key: "thickness", label: "Thickness", type: "intSlider", min: 1, max: 10, default: 1 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 100, default: 10 },
    { key: "tails", label: "Tails", type: "intSlider", min: 0, max: 20, default: 5 },
    { key: "fadeTails", label: "Fade Tails", type: "checkbox", default: true },
  ],
};

export const SPIROGRAPH_EFFECT_SCHEMA: EffectSchema = {
  name: "Spirograph",
  params: [
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 100, default: 10, valueCurve: true },
    { key: "outerRadius", label: "R - Radius outer circle", type: "intSlider", min: 1, max: 100, default: 20, valueCurve: true },
    { key: "innerRadius", label: "r - Radius of inner circle", type: "intSlider", min: 1, max: 100, default: 7, valueCurve: true },
    { key: "distance", label: "d - Distance", type: "intSlider", min: 0, max: 100, default: 12, valueCurve: true },
    { key: "animate", label: "d - Animation", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "length", label: "Length", type: "intSlider", min: 1, max: 100, default: 100, valueCurve: true },
  ],
};

export const SHAPE_EFFECT_SCHEMA: EffectSchema = {
  name: "Shape",
  params: [
    { key: "shape", label: "Object to Draw", type: "choice", options: ["Circle", "Square", "Triangle", "Star", "Heart"], default: "Circle" },
    { key: "thickness", label: "Thickness", type: "intSlider", min: 1, max: 10, default: 1 },
    { key: "count", label: "Count", type: "intSlider", min: 1, max: 20, default: 3 },
    { key: "startSize", label: "Start Size", type: "intSlider", min: 1, max: 100, default: 30 },
    { key: "randomSizes", label: "Random initial shape sizes", type: "checkbox", default: false },
    { key: "velocity", label: "Velocity", type: "intSlider", min: 0, max: 100, default: 0 },
    { key: "direction", label: "Direction", type: "intSlider", min: 0, max: 359, default: 90 },
    { key: "lifetime", label: "Lifetime", type: "intSlider", min: 1, max: 100, default: 100 },
    { key: "growth", label: "Growth", type: "intSlider", min: -100, max: 100, default: 0 },
    { key: "centerX", label: "X Center", type: "intSlider", min: 0, max: 100, default: 50 },
    { key: "centerY", label: "Y Center", type: "intSlider", min: 0, max: 100, default: 50 },
  ],
};

export const MUSIC_EFFECT_SCHEMA: EffectSchema = {
  name: "Music",
  params: [
    { key: "bars", label: "Bars", type: "intSlider", min: 1, max: 64, default: 12 },
    { key: "type", label: "Type", type: "choice", options: ["Separate", "Morph", "Bounce", "Collide", "On"], default: "Morph" },
    { key: "sensitivity", label: "Sensitivity", type: "intSlider", min: 0, max: 100, default: 20 },
    { key: "offset", label: "Offset", type: "intSlider", min: -32, max: 32, default: 0, valueCurve: true },
    { key: "scaleBars", label: "Scale Bars", type: "checkbox", default: true },
    { key: "color", label: "Color", type: "choice", options: ["Distinct", "Blend", "Cycle"], default: "Blend" },
    { key: "fade", label: "Fade", type: "checkbox", default: false },
    { key: "logarithmicX", label: "Logarithmic X Axis", type: "checkbox", default: false },
  ],
};

export const FIREWORKS_EFFECT_SCHEMA: EffectSchema = {
  name: "Fireworks",
  params: [
    { key: "explosions", label: "Number of Explosions", type: "intSlider", min: 1, max: 40, default: 8 },
    { key: "particles", label: "Particles in Explosion", type: "intSlider", min: 1, max: 100, default: 30 },
    { key: "velocity", label: "Velocity of Particles", type: "intSlider", min: 1, max: 100, default: 20 },
    { key: "gravity", label: "Gravity", type: "intSlider", min: 0, max: 100, default: 20 },
    { key: "particleFade", label: "Particle Fade", type: "intSlider", min: 1, max: 100, default: 30 },
    { key: "holdColor", label: "Hold Color", type: "checkbox", default: true },
    { key: "fireWithMusic", label: "Fire with Music", type: "checkbox", default: false },
    { key: "triggerLevel", label: "Trigger level", type: "intSlider", min: 0, max: 100, default: 30 },
  ],
};

export const TREE_EFFECT_SCHEMA: EffectSchema = {
  name: "Tree",
  params: [
    { key: "branches", label: "Number Branches", type: "intSlider", min: 1, max: 20, default: 5 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 100, default: 10 },
    { key: "showTreeLights", label: "Show Tree Lights", type: "checkbox", default: true },
  ],
};

export const MORPH_EFFECT_SCHEMA: EffectSchema = {
  name: "Morph",
  params: [
    // The two lines the morph travels between. The defaults sweep the model bottom to top, which
    // is the arch and mega-tree movement Morph is most often reached for.
    { key: "x1a", label: "Start X1", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "y1a", label: "Start Y1", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "x1b", label: "Start X2", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "y1b", label: "Start Y2", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "x2a", label: "End X1", type: "intSlider", min: 0, max: 100, default: 0, valueCurve: true },
    { key: "y2a", label: "End Y1", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "x2b", label: "End X2", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "y2b", label: "End Y2", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "headLength", label: "Head Length", type: "intSlider", min: 0, max: 100, default: 20, valueCurve: true },
    { key: "headDuration", label: "Head Duration", type: "intSlider", min: 0, max: 100, default: 100, valueCurve: true },
    { key: "acceleration", label: "Acceleration", type: "intSlider", min: -10, max: 10, default: 0, valueCurve: true },
    { key: "repeatCount", label: "Repeat Count", type: "intSlider", min: 1, max: 20, default: 1 },
    { key: "repeatSkip", label: "Repeat Skip", type: "intSlider", min: 0, max: 20, default: 0 },
    { key: "stagger", label: "Stagger", type: "intSlider", min: 0, max: 10, default: 0 },
    { key: "showHeadAtStart", label: "Show Head at Start", type: "checkbox", default: false },
    { key: "swapStartEnd", label: "Swap Start and End", type: "checkbox", default: false },
  ],
};

export const TENDRILS_EFFECT_SCHEMA: EffectSchema = {
  name: "Tendrils",
  params: [
    {
      key: "movement",
      label: "Movement",
      type: "choice",
      // Taken from the effect rather than restated here, so a movement can't be implemented and
      // left unofferable - which is exactly what had happened to the blend modes.
      options: TENDRIL_MOVEMENTS,
      default: "Random",
    },
    { key: "tuneMovement", label: "Tune Movement", type: "intSlider", min: 1, max: 20, default: 10, valueCurve: true },
    { key: "thickness", label: "Thickness", type: "intSlider", min: 1, max: 10, default: 1, valueCurve: true },
    { key: "friction", label: "Friction", type: "intSlider", min: 0, max: 20, default: 10 },
    { key: "dampening", label: "Dampening", type: "intSlider", min: 0, max: 20, default: 10 },
    { key: "tension", label: "Tension", type: "intSlider", min: 0, max: 20, default: 10 },
    { key: "trails", label: "Trails", type: "intSlider", min: 0, max: 10, default: 0 },
    { key: "length", label: "Length", type: "intSlider", min: 2, max: 120, default: 60 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 10, default: 10 },
    { key: "horizontalOffset", label: "Horizontal Offset", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
    { key: "verticalOffset", label: "Vertical Offset", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
  ],
};

// The three canvas-mode effects. They modify what the layers underneath them drew rather than
// drawing anything themselves, so each is only useful on a layer whose blend mode is Canvas -
// the props panel says so, and the manual is blunt about it: Kaleidoscope "by itself does
// nothing".
export const KALEIDOSCOPE_EFFECT_SCHEMA: EffectSchema = {
  name: "Kaleidoscope",
  params: [
    { key: "type", label: "Kaleidoscope Type", type: "choice", options: KALEIDOSCOPE_TYPES, default: "Square" },
    { key: "centerX", label: "Center X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "centerY", label: "Center Y", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "size", label: "Size", type: "intSlider", min: 1, max: 100, default: 25, valueCurve: true },
    { key: "rotation", label: "Rotation", type: "intSlider", min: -180, max: 180, default: 0, valueCurve: true },
  ],
};

export const WARP_EFFECT_SCHEMA: EffectSchema = {
  name: "Warp",
  params: [
    { key: "type", label: "Warp Type", type: "choice", options: WARP_TYPES, default: "Ripple" },
    { key: "treatment", label: "Treatment", type: "choice", options: WARP_TREATMENTS, default: "Constant" },
    { key: "x", label: "X", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "y", label: "Y", type: "intSlider", min: 0, max: 100, default: 50, valueCurve: true },
    { key: "cycleCount", label: "Cycle Count", type: "intSlider", min: 1, max: 20, default: 1 },
    { key: "speed", label: "Speed", type: "intSlider", min: 1, max: 50, default: 10, valueCurve: true },
    { key: "frequency", label: "Frequency", type: "intSlider", min: 1, max: 20, default: 4, valueCurve: true },
  ],
};

export const ADJUST_EFFECT_SCHEMA: EffectSchema = {
  name: "Adjust",
  params: [
    { key: "mode", label: "Adjustment", type: "choice", options: ADJUST_MODES, default: "Adjust By Percentage" },
    { key: "value", label: "Value", type: "intSlider", min: -255, max: 255, default: -50, valueCurve: true },
    { key: "minimum", label: "Minimum", type: "intSlider", min: 0, max: 255, default: 0 },
    { key: "maximum", label: "Maximum", type: "intSlider", min: 0, max: 255, default: 255 },
  ],
};

export const SKETCH_EFFECT_SCHEMA: EffectSchema = {
  name: "Sketch",
  params: [
    // The path itself. A text field rather than a slider because it is a *drawing*; the props
    // panel gives it a small canvas to trace on, and this is what that canvas writes.
    { key: "sketch", label: "Sketch", type: "text", default: "M 0.1,0.2 L 0.5,0.85 L 0.9,0.2 L 0.1,0.2" },
    { key: "drawPercent", label: "Draw Percentage", type: "intSlider", min: 1, max: 100, default: 100, valueCurve: true },
    { key: "thickness", label: "Thickness", type: "intSlider", min: 1, max: 10, default: 1, valueCurve: true },
    { key: "motion", label: "Motion", type: "checkbox", default: false },
    { key: "motionPercent", label: "Motion Percentage", type: "intSlider", min: 1, max: 100, default: 25, valueCurve: true },
  ],
};

// The State effect (state.ts). Its two most important settings aren't sliders: which of the
// model's state definitions drives it, and which timing track supplies the words.
export const STATE_EFFECT_SCHEMA: EffectSchema = {
  name: "State",
  params: [
    { key: "stateDefinition", label: "State Definition", type: "choice", optionsFrom: "stateDefinitions", default: "" },
    { key: "mode", label: "Mode", type: "choice", options: [...STATE_MODES], default: "Default" },
    { key: "useTimingTrack", label: "Use Timing Track", type: "checkbox", default: true },
    { key: "timingTrack", label: "Timing Track", type: "choice", optionsFrom: "timingTracks", default: "" },
    // Doubles as the countdown's starting value ("specify the starting number in the label").
    { key: "state", label: "State / Countdown From", type: "text", default: "" },
    { key: "colorMode", label: "Color", type: "choice", options: [...STATE_COLOR_MODES], default: "Default" },
  ],
};

// The Piano effect (piano.ts).
export const PIANO_EFFECT_SCHEMA: EffectSchema = {
  name: "Piano",
  params: [
    { key: "notesSource", label: "Notes Source", type: "choice", options: [...PIANO_SOURCES], default: "Timing Track" },
    { key: "timingTrack", label: "Timing Track", type: "choice", optionsFrom: "timingTracks", default: "" },
    { key: "type", label: "Type", type: "choice", options: [...PIANO_TYPES], default: "True Piano" },
    // 60 is C4 and 84 is C7 - two octaves, which is as much as most props have the width for.
    { key: "startMidi", label: "Start MIDI Key", type: "intSlider", min: 1, max: 127, default: 60 },
    { key: "endMidi", label: "End MIDI Key", type: "intSlider", min: 1, max: 127, default: 84 },
    { key: "showSharps", label: "Show Sharps and Flats", type: "checkbox", default: true },
    { key: "verticalScalePct", label: "Vertical Scale", type: "intSlider", min: 1, max: 100, default: 100, valueCurve: true },
    { key: "horizontalOffsetPct", label: "Horizontal Offset", type: "intSlider", min: -100, max: 100, default: 0, valueCurve: true },
  ],
};

// The Faces effect (faces.ts). Its Phoneme and Face Definition lists come from the model, so they
// are filled in by the props panel rather than fixed here.
export const FACES_EFFECT_SCHEMA: EffectSchema = {
  name: "Faces",
  params: [
    { key: "faceDefinition", label: "Face Definition", type: "choice", optionsFrom: "faceDefinitions", default: "" },
    { key: "useTimingTrack", label: "Use Timing Track", type: "checkbox", default: true },
    { key: "timingTrack", label: "Timing Track", type: "choice", optionsFrom: "timingTracks", default: "" },
    { key: "phoneme", label: "Phoneme", type: "choice", optionsFrom: "phonemes", default: "rest" },
    { key: "eyes", label: "Eyes", type: "choice", options: [...FACE_EYE_MODES], default: "Open" },
    { key: "eyeBlinkSeconds", label: "Eye Blink Frequency", type: "floatSlider", min: 0.5, max: 30, step: 0.5, default: 5 },
    { key: "eyeBlinkLengthMs", label: "Eye Blink Length", type: "intSlider", min: 50, max: 1000, default: 150 },
    { key: "showOutline", label: "Show Outline", type: "checkbox", default: true },
    { key: "suppressWhenNotSinging", label: "Suppress When Not Singing", type: "checkbox", default: false },
    { key: "leadInFrames", label: "Lead In Frames", type: "intSlider", min: 0, max: 100, default: 0 },
    { key: "leadOutFrames", label: "Lead Out Frames", type: "intSlider", min: 0, max: 100, default: 0 },
    { key: "fadeDuringLeadInOut", label: "Fade During Lead In/Out", type: "checkbox", default: false },
    // Matrix faces only: a node-range face never writes a pixel it wasn't asked to.
    { key: "transparentBlack", label: "Transparent Black", type: "checkbox", default: false },
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
  Strobe: STROBE_EFFECT_SCHEMA,
  Ripple: RIPPLE_EFFECT_SCHEMA,
  Wave: WAVE_EFFECT_SCHEMA,
  Pinwheel: PINWHEEL_EFFECT_SCHEMA,
  Shockwave: SHOCKWAVE_EFFECT_SCHEMA,
  Garlands: GARLANDS_EFFECT_SCHEMA,
  Curtain: CURTAIN_EFFECT_SCHEMA,
  Plasma: PLASMA_EFFECT_SCHEMA,
  Galaxy: GALAXY_EFFECT_SCHEMA,
  Fan: FAN_EFFECT_SCHEMA,
  Marquee: MARQUEE_EFFECT_SCHEMA,
  Circles: CIRCLES_EFFECT_SCHEMA,
  Text: TEXT_EFFECT_SCHEMA,
  Pictures: PICTURES_EFFECT_SCHEMA,
  "VU Meter": VU_METER_EFFECT_SCHEMA,
  Off: OFF_EFFECT_SCHEMA,
  Shimmer: SHIMMER_EFFECT_SCHEMA,
  Fill: FILL_EFFECT_SCHEMA,
  "Snow Storm": SNOW_STORM_EFFECT_SCHEMA,
  Life: LIFE_EFFECT_SCHEMA,
  Lightning: LIGHTNING_EFFECT_SCHEMA,
  Candle: CANDLE_EFFECT_SCHEMA,
  Lines: LINES_EFFECT_SCHEMA,
  Spirograph: SPIROGRAPH_EFFECT_SCHEMA,
  Shape: SHAPE_EFFECT_SCHEMA,
  Music: MUSIC_EFFECT_SCHEMA,
  Fireworks: FIREWORKS_EFFECT_SCHEMA,
  Tree: TREE_EFFECT_SCHEMA,
  Morph: MORPH_EFFECT_SCHEMA,
  Tendrils: TENDRILS_EFFECT_SCHEMA,
  Kaleidoscope: KALEIDOSCOPE_EFFECT_SCHEMA,
  Warp: WARP_EFFECT_SCHEMA,
  Adjust: ADJUST_EFFECT_SCHEMA,
  Sketch: SKETCH_EFFECT_SCHEMA,
  State: STATE_EFFECT_SCHEMA,
  Piano: PIANO_EFFECT_SCHEMA,
  Faces: FACES_EFFECT_SCHEMA,
};

// Effects driven by the words on a timing track rather than by their own parameters. The props
// panel warns when one of these names a track the sequence hasn't got, because the symptom
// otherwise is an effect that renders nothing for no visible reason.
export const TIMING_TRACK_EFFECTS = new Set<string>(["State", "Piano", "Faces"]);

// Effects that read the analysed audio track rather than only their own params - the UI warns
// when one of these is placed in a sequence with no audio loaded.
export const AUDIO_REACTIVE_EFFECTS = new Set<string>(["VU Meter", "Music", "Fireworks", "Tendrils", "Piano"]);

// Effects that modify the layer below rather than drawing their own. On any other blend mode
// they are handed a blank buffer and have nothing to work on, so the props panel warns rather
// than leaving a layer that silently renders nothing.
export const CANVAS_ONLY_EFFECTS = new Set<string>(["Kaleidoscope", "Warp", "Adjust"]);

export function defaultParamsFor(effectName: string): Record<string, number | boolean | string> {
  const schema = EFFECT_SCHEMAS[effectName];
  if (!schema) return {};
  return Object.fromEntries(schema.params.map((p) => [p.key, p.default]));
}
