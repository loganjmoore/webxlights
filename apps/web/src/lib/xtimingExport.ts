// xLights' timing-track file: one <timing> with an <EffectLayer> per level, each <Effect> a
// labelled span in milliseconds. This is what "Import Timing Track" in xLights reads, and what
// autolyrics-style tools hand back, so a lyric timing made here can go straight into the desktop
// app's sequence.

import type { Cell } from "./lyricBreakdown";

function attr(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function xtimingXml(name: string, layers: Cell[][], sourceVersion = "2024.20"): string {
  const body = layers
    .map((cells) => {
      const effects = cells.map((c) => `    <Effect label="${attr(c.label)}" starttime="${Math.round(c.startMs)}" endtime="${Math.round(c.endMs)}" />`);
      return `  <EffectLayer>\n${effects.join("\n")}\n  </EffectLayer>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<timing name="${attr(name)}" SourceVersion="${attr(sourceVersion)}">\n${body}\n</timing>\n`;
}

export function downloadXtiming(name: string, layers: Cell[][]): void {
  const blob = new Blob([xtimingXml(name, layers)], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9._ -]/gi, "_") || "timing"}.xtiming`;
  a.click();
  URL.revokeObjectURL(url);
}
