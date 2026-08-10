import { writeFseqV2 } from "@webxlights/formats";
import { computeGeometryFromAttrs, createRowSequencer, nodeColorsToChannelBytes, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord, SequenceBody, SequenceRecord } from "./api";

// ponytail: same fixed default palette as the live preview (HousePreview.vue) - no palette
// editor exists yet (M6/M7).
const DEFAULT_PALETTE = [
  { r: 255, g: 200, b: 120, a: 255 },
  { r: 80, g: 160, b: 255, a: 255 },
];
const SEED = 12345;

function extractRgbOrder(stringType: string | null): string {
  const match = stringType?.match(/^([RGB]{3})/i);
  return match ? match[1]!.toUpperCase() : "RGB";
}

// Concatenates supported models' channel bytes in layout order - a placeholder channel
// layout, not a real controller/universe allocation (SPEC ch3's "channels/universes/
// controllers" is display + export math only in v1 per the goal prompt; a proper per-
// controller channel map is out of scope until that's built).
export function exportSequenceToFseq(models: ModelRecord[], body: SequenceBody, sequence: SequenceRecord): Uint8Array {
  const frameMs = sequence.frame_ms;
  const frameCount = Math.max(1, Math.ceil(sequence.duration_ms / frameMs));

  const supported = models.filter((m) => m.supported);
  const geometries: Array<ModelGeometry | null> = supported.map((m) => {
    try {
      return computeGeometryFromAttrs(m.type, m.raw_attrs);
    } catch {
      return null;
    }
  });

  const rgbOrders = supported.map((m) => extractRgbOrder(m.string_type));
  const channelCount = geometries.reduce((sum, g) => sum + (g ? g.nodes.length * 3 : 0), 0);

  // One sequencer per model, created once and called in strictly increasing atMs order -
  // O(frames) instead of the O(frames^2) a fresh renderRowAtMs-per-frame call would cost for
  // any stateful effect (Fire/Meteors/Snowflakes/Strobe), which replays from the effect's
  // start every call (correct for scrubbing, wrong for a full sequential export). See
  // DECISIONS.md M9 perf note - this is the fix that keeps full-length exports with those
  // effects inside the ROADMAP's 60s budget instead of stalling the tab.
  const sequencers = supported.map((model, i) => {
    const geo = geometries[i];
    if (!geo) return null;
    const rowEffects = body.rows.filter((r) => r.elementType === "model" && r.elementId === model.id).flatMap((r) => r.effects);
    return createRowSequencer({ geometry: geo, effects: rowEffects }, frameMs, SEED, DEFAULT_PALETTE);
  });

  const frames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    const atMs = f * frameMs;
    const frame = new Uint8Array(channelCount);
    let offset = 0;
    supported.forEach((_model, i) => {
      const sequencer = sequencers[i];
      if (!sequencer) return;
      const nodeColors = sequencer.renderFrameAt(atMs);
      const bytes = nodeColorsToChannelBytes(nodeColors, rgbOrders[i]);
      frame.set(bytes, offset);
      offset += bytes.length;
    });
    frames.push(frame);
  }

  return writeFseqV2(frames, { channelCount, frameCount, stepTimeMs: frameMs, producer: "webXLights" });
}

export function downloadFseq(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".fseq") ? filename : `${filename}.fseq`;
  a.click();
  URL.revokeObjectURL(url);
}
