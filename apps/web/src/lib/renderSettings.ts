import type { RGBA } from "@webxlights/engine";

// Shared by the live 3D preview and the .fseq export so the two can't drift: what you see in
// the visualizer is what gets written to the file. Still no palette editor (DECISIONS.md
// M4/M6), so this is one fixed 2-colour palette for every effect.
export const DEFAULT_PALETTE: RGBA[] = [
  { r: 255, g: 200, b: 120, a: 255 },
  { r: 80, g: 160, b: 255, a: 255 },
];

// Fixed RNG seed - determinism is a hard requirement (SPEC ch10/16), so the preview and the
// export must seed identically or the random-driven effects would differ between them.
export const PREVIEW_SEED = 12345;
