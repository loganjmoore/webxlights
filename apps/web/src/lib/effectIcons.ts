// A glyph per effect, for the palette.
//
// The palette used to be forty-eight text buttons, which is three crowded rows of names you read
// rather than a toolbar you aim at. Names are still there as tooltips and in the command palette;
// what a glyph buys is that the row you reach for stops being a reading task.
//
// Drawn as inline SVG in a 24x24 box using `currentColor`, so a glyph inherits the button's own
// colour and follows the armed/hover states without a second set of assets. No icon font and no
// image files: an effect list that changes shouldn't need a build step to redraw.
//
// Each glyph is a rough picture of what the effect *does* rather than a literal illustration -
// Bars are bars, Ripple is concentric arcs, Fire is a flame outline. Where an effect has no
// obvious shape (Adjust, State) the glyph leans on its interface instead.

/** Inner SVG markup for one effect, on a 0 0 24 24 viewBox. */
const ICONS: Record<string, string> = {
  On: `<circle cx="12" cy="12" r="7" fill="currentColor"/>`,
  Off: `<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  Bars: `<rect x="3" y="5" width="18" height="3.2" rx="1"/><rect x="3" y="10.4" width="18" height="3.2" rx="1"/><rect x="3" y="15.8" width="18" height="3.2" rx="1"/>`,
  "Color Wash": `<defs><linearGradient id="cw" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.25"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs><rect x="3" y="6" width="18" height="12" rx="2" fill="url(#cw)"/>`,
  Fire: `<path d="M12 21c4 0 6-2.6 6-5.6 0-4-3.4-5.4-3-9.4-2.2 1-3.4 3-3.4 5 0 1.2-.8 1.8-1.4 1.2-.8-.8-.6-2-.6-2C7.6 12 6 13.4 6 15.4 6 18.4 8 21 12 21z" fill="currentColor"/>`,
  Candle: `<rect x="9.5" y="10" width="5" height="10" rx="1"/><path d="M12 3c1.6 1.8 2.5 3 2.5 4.4a2.5 2.5 0 1 1-5 0C9.5 6 10.4 4.8 12 3z" fill="currentColor"/>`,
  Meteors: `<path d="M4 18 12 10M9 19l7-7M14 20l6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="19" cy="5" r="2" fill="currentColor"/>`,
  Butterfly: `<path d="M12 5v14M12 12c-4-6-9-5-9-1s5 5 9 1zM12 12c4-6 9-5 9-1s-5 5-9 1z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  SingleStrand: `<path d="M3 12h18" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="12" r="2" fill="currentColor"/><circle cx="13" cy="12" r="2" fill="currentColor"/>`,
  Snowflakes: `<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  "Snow Storm": `<path d="M5 4v6M2.5 5.5l5 3M7.5 5.5l-5 3" stroke="currentColor" stroke-width="1.2"/><path d="M17 12v6M14.5 13.5l5 3M19.5 13.5l-5 3" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="17" r="1.6" fill="currentColor"/>`,
  Spirals: `<path d="M12 12m-1 0a1 1 0 1 1 2 0a1 1 0 1 1-2 0M12 8a4 4 0 1 1-4 4 6 6 0 1 0 6-6" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  Spirograph: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.2"/>`,
  Twinkle: `<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" fill="currentColor"/><circle cx="18.5" cy="18" r="1.5" fill="currentColor"/>`,
  Strobe: `<path d="M13 2 5 13h6l-2 9 10-12h-6z" fill="currentColor"/>`,
  Ripple: `<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>`,
  Wave: `<path d="M2 14c3-6 5-6 8 0s5 6 8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  Pinwheel: `<path d="M12 12 12 3a9 9 0 0 1 7.8 4.5zM12 12l7.8 4.5A9 9 0 0 1 12 21zM12 12 4.2 16.5A9 9 0 0 1 4.2 7.5z" fill="currentColor"/>`,
  Shockwave: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/>`,
  Garlands: `<path d="M2 7c4 6 8 6 10 0M12 7c2 6 6 6 10 0" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="13.5" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>`,
  Curtain: `<path d="M4 3v18c4 0 5-4 5-9S8 3 4 3zM20 3v18c-4 0-5-4-5-9s1-9 5-9z" fill="currentColor"/>`,
  Plasma: `<path d="M3 16c4-10 8 8 12-2s5 2 6 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 9c4-8 8 6 12-3" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.6"/>`,
  Galaxy: `<path d="M12 12c5-4 9-1 9 2 0 4-5 7-9 7s-9-3-9-7" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/>`,
  Fan: `<path d="M12 21 4 9a14 14 0 0 1 16 0z" fill="currentColor"/>`,
  Marquee: `<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>`,
  Circles: `<circle cx="8" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  Text: `<path d="M5 6h14M12 6v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  Pictures: `<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m5 16 4-4 3 3 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9.5" r="1.4" fill="currentColor"/>`,
  "VU Meter": `<rect x="4" y="12" width="3" height="8"/><rect x="9" y="7" width="3" height="13"/><rect x="14" y="10" width="3" height="10"/><rect x="19" y="4" width="1.6" height="16"/>`,
  Shimmer: `<path d="M6 4v16M12 4v16M18 4v16" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/>`,
  Fill: `<path d="M4 20h16v-6H4z" fill="currentColor"/><rect x="4" y="5" width="16" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  Life: `<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6" opacity="0.4"/><rect x="4" y="14" width="6" height="6" opacity="0.4"/><rect x="14" y="14" width="6" height="6"/>`,
  Lightning: `<path d="M13 2 4 14h6l-1 8 10-13h-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  Lines: `<path d="M3 18 9 6l6 12 6-12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  Shape: `<path d="M12 3 21 19H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  Music: `<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="18" r="2.4" fill="currentColor"/><circle cx="17" cy="16" r="2.4" fill="currentColor"/>`,
  Fireworks: `<path d="M12 12 12 3M12 12l6.4-6.4M12 12H3M12 12l-6.4 6.4M12 12l6.4 6.4M12 12V21" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>`,
  Tree: `<path d="M12 3 5 19h14z" fill="currentColor"/><rect x="10.6" y="19" width="2.8" height="3"/>`,
  Morph: `<path d="M4 12a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 12a8 8 0 0 0 16 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/>`,
  Tendrils: `<path d="M4 20c6 0 6-8 10-8s4 5 6 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 14c5 0 4-7 8-7" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>`,
  Kaleidoscope: `<path d="M12 3 21 12 12 21 3 12z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1"/>`,
  Warp: `<path d="M3 12c4-7 14-7 18 0-4 7-14 7-18 0z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>`,
  Adjust: `<path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="7" r="2.2" fill="currentColor"/><circle cx="15" cy="12" r="2.2" fill="currentColor"/><circle cx="8" cy="17" r="2.2" fill="currentColor"/>`,
  Sketch: `<path d="m4 20 2-5 9-9 3 3-9 9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m15 6 3 3" stroke="currentColor" stroke-width="1.5"/>`,
  State: `<rect x="3" y="6" width="8" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13" y="12" width="8" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 9h2v6" fill="none" stroke="currentColor" stroke-width="1.2"/>`,
  Piano: `<rect x="3" y="6" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7" y="6" width="2" height="7" fill="currentColor"/><rect x="11.5" y="6" width="2" height="7" fill="currentColor"/><rect x="16" y="6" width="2" height="7" fill="currentColor"/>`,
  Guitar: `<circle cx="10" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="16" r="1.6" fill="currentColor"/><path d="m13.5 12.5 6-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  Faces: `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><circle cx="15" cy="10" r="1.3" fill="currentColor"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
};

/** A neutral glyph, so an effect added later gets a button rather than a blank. */
const FALLBACK = `<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>`;

export function effectIcon(name: string): string {
  return ICONS[name] ?? FALLBACK;
}

/** Whether an effect has a glyph of its own - the palette test uses this to catch new effects. */
export function hasEffectIcon(name: string): boolean {
  return name in ICONS;
}
