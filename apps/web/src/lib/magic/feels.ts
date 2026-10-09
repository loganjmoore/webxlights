import type { Motif } from "./motifs";
import type { Feel } from "./plan";
import type { SongMap } from "@webxlights/engine";

// Feels: multipliers over the corpus priors (docs/MAGIC-SEQUENCE.md 6.2). Starting values,
// tuned against the fit score; "auto" picks one from the song.

export interface FeelSpec {
  label: string;
  /** Effects this feel reaches for: their weight is multiplied by FAVOUR. */
  favours: string[];
  /** Effects this feel keeps out entirely. */
  avoids: string[];
  /** Multiplies speed sliders. */
  speed: number;
  /** Added to every section's intensity. */
  intensityShift: number;
  /** How much the corpus's per-role lift decides over plain usage: the exponent on roleLift. */
  character: number;
  /** Candidate palettes, most typical first; sections take them in turn. */
  palettes: string[][];
  /** Built-in library shaders by name, for the quiet sections and the loud ones. */
  shaders: { calm: string[]; lively: string[] };
  /** Pictures for the matrix when the title names none. */
  motifs: Motif[];
}

export const FAVOUR = 3;

const WARM_WHITE = "#ffd9a0";

export const FEELS: Record<Exclude<Feel, "auto">, FeelSpec> = {
  traditional: {
    label: "Traditional",
    favours: ["On", "Color Wash", "Twinkle", "SingleStrand"],
    avoids: ["Strobe", "Plasma", "Lightning"],
    speed: 0.8,
    intensityShift: -0.1,
    character: 0.6,
    palettes: [["#ff0000", "#00ff00", "#ffffff"], ["#ff0000", "#ffffff"], ["#00ff00", WARM_WHITE], ["#ffb000", WARM_WHITE], ["#ff0000", "#00ff00"]],
    shaders: { calm: ["Warm White Sparkle", "Twinkle Field", "Snowfall", "Colour Wash"], lively: ["Candy Cane", "Peppermint Swirl", "Comet Chase", "Champagne Shimmer"] },
    motifs: ["tree", "ornament", "candycane"],
  },
  joyful: {
    label: "Joyful",
    favours: ["SingleStrand", "Bars", "Marquee", "Twinkle"],
    avoids: ["Fire", "Lightning"],
    speed: 1,
    intensityShift: 0.05,
    character: 0.8,
    palettes: [["#ff0000", "#00ff00", "#0000ff", "#ffff00"], ["#ff00ff", "#00ffff", "#ffff00"], ["#ff0000", "#ffffff"], ["#00ff00", "#ffff00"], ["#ff8000", "#ffffff"]],
    shaders: { calm: ["Mesh Gradient", "Twinkle Field", "Champagne Shimmer"], lively: ["Checker Slide", "Starburst", "Expanding Rings", "Marquee Chase", "Kaleidoscope"] },
    motifs: ["gift", "star", "note"],
  },
  peaceful: {
    label: "Peaceful",
    favours: ["Color Wash", "Twinkle", "Snowflakes", "On"],
    avoids: ["Shockwave", "Strobe", "Bars", "Lightning", "Fire"],
    speed: 0.6,
    intensityShift: -0.25,
    character: 0.5,
    palettes: [[WARM_WHITE, "#fbe0b4"], ["#0080ff", "#ffffff"], ["#8000ff", "#0033cc"], [WARM_WHITE, "#63c9fa"]],
    shaders: { calm: ["Aurora Curtain", "Snowfall", "Cloud Drift", "Ocean Swell", "Iridescent Silk"], lively: ["Plankton Glow", "Mesh Gradient", "Caustics"] },
    motifs: ["star", "snowflake"],
  },
  powerful: {
    label: "Powerful",
    favours: ["Shockwave", "Bars", "SingleStrand", "Strobe"],
    avoids: ["Twinkle", "Color Wash"],
    speed: 1.4,
    intensityShift: 0.25,
    character: 1.1,
    palettes: [["#ff0000", "#ffffff"], ["#0000ff", "#ffffff"], ["#ff8000", "#ff0000"], ["#ffffff", "#c0c0c0"], ["#8000ff", "#ff00ff"]],
    shaders: { calm: ["Godrays", "Smoke Plume", "Liquid Metal"], lively: ["Plasma Storm", "Spin Tunnel", "Radar Sweep", "Lightning", "Vu Bars"] },
    motifs: ["star", "note"],
  },
  magical: {
    label: "Magical",
    favours: ["Twinkle", "Butterfly", "Spirals", "Galaxy", "Shimmer"],
    avoids: ["Strobe", "Bars"],
    speed: 0.8,
    intensityShift: 0,
    character: 1,
    palettes: [["#8000ff", "#00ffff", "#ffffff"], ["#0080ff", "#ff00ff"], ["#63c9fa", "#ffffff", "#c0c0c0"], ["#ffb000", "#8000ff"]],
    shaders: { calm: ["Aurora Curtain", "Iridescent Silk", "Ink Bloom", "Plankton Glow"], lively: ["Kaleidoscope", "Voronoi Crystal", "Champagne Shimmer", "Metaballs", "Starburst"] },
    motifs: ["snowflake", "star"],
  },
  rock: {
    label: "Rock/EDM",
    favours: ["Shockwave", "Strobe", "VU Meter", "Lightning", "Bars"],
    avoids: ["Twinkle", "Candle"],
    speed: 1.5,
    intensityShift: 0.3,
    character: 1.2,
    palettes: [["#ff0000", "#ffffff", "#0000ff"], ["#00ffff", "#ff00ff"], ["#ffff00", "#ff0000"], ["#00ff00", "#0000ff"], ["#ffffff", "#ff0000"]],
    shaders: { calm: ["Smoke Plume", "Ember Rise", "Neuro Noise"], lively: ["Plasma Storm", "Lava Flow", "Spin Tunnel", "Lightning", "Vu Bars"] },
    motifs: ["note", "star"],
  },
};

/**
 * "From the song": the tempo and how hard the song pushes decide.
 *
 * ponytail: tempo and loudness only, so a fast carol and a slow rocker can land on the wrong
 * side. The AI director, which knows the title, is the upgrade.
 */
export function feelFromSong(song: SongMap): Exclude<Feel, "auto"> {
  const sorted = [...song.energy].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.5;
  const spread = (sorted[Math.floor(sorted.length * 0.9)] ?? 1) - (sorted[Math.floor(sorted.length * 0.1)] ?? 0);
  if (song.bpm >= 140 && median >= 0.5) return "rock";
  if (song.bpm < 80) return spread > 0.55 ? "magical" : "peaceful";
  if (song.bpm < 100) return "traditional";
  if (median >= 0.6 && spread < 0.5) return "powerful";
  return "joyful";
}

export function feelSpec(feel: Feel, song: SongMap): FeelSpec {
  return FEELS[feel === "auto" ? feelFromSong(song) : feel];
}
