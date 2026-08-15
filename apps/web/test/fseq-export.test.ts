import { describe, expect, it } from "vitest";
import { parseFseqV2Header, readFseqV2Frame } from "@webxlights/formats";
import { strandSpecs, computeGeometryFromAttrs } from "@webxlights/engine";
import type { ModelRecord, SequenceBody, SequenceEffect, SequenceRecord } from "../src/lib/api";
import { exportSequenceToFseq } from "../src/lib/fseqExport";

// What ends up in the file, rather than what ends up on screen.
//
// This path had no test at the web level, and three changes in a row have now landed on it: the
// layer cap and its drop order, the layer *ordering* that decides which effect wins, and strand
// rows. All three are cases where the export and the preview are separate implementations of the
// same rule - and a show that looks right on screen and plays wrong in the yard is the failure
// this codebase guards hardest, because nobody finds out until it is dark outside.

const MATRIX: ModelRecord = {
  id: 1,
  name: "Tree",
  type: "Matrix",
  supported: true,
  params: {},
  // Three strings of four nodes: small enough to read channel by channel, big enough to have
  // strands worth telling apart.
  raw_attrs: { StringType: "RGB Nodes", parm1: "3", parm2: "4", Dir: "L", StartSide: "T" },
  screen: {},
} as ModelRecord;

const SEQUENCE: SequenceRecord = {
  id: 1,
  name: "Test",
  frame_ms: 50,
  duration_ms: 200,
  audio_filename: null,
  audio_path: null,
  body: { timingTracks: [], rows: [] },
  revision: 1,
};

const ON = { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false };

function on(id: string, palette: string[], extra: Partial<SequenceEffect> = {}): SequenceEffect {
  return { id, name: "On", startMs: 0, endMs: 200, params: { ...ON }, palette, ...extra };
}

function exportFrame(body: SequenceBody): Uint8Array {
  const bytes = exportSequenceToFseq([MATRIX], body, SEQUENCE, []);
  const header = parseFseqV2Header(bytes);
  return readFseqV2Frame(bytes, header, 0);
}

/** The channel offsets belonging to one strand, in node order. */
function strandChannels(strandIndex: number): number[] {
  const geometry = computeGeometryFromAttrs(MATRIX.type, MATRIX.raw_attrs)!;
  const spec = strandSpecs(geometry)[strandIndex]!;
  // The spec's ranges are one-based node indices; each RGB node is three channels.
  return spec.rows[0]!
    .split(",")
    .flatMap((part) => {
      const [from, to] = part.includes("-") ? part.split("-").map(Number) : [Number(part), Number(part)];
      const out: number[] = [];
      for (let n = from!; n <= (to ?? from!); n++) out.push(n - 1);
      return out;
    })
    .map((nodeIndex) => nodeIndex * 3);
}

describe("a model row", () => {
  it("lights every one of the model's channels", () => {
    const frame = exportFrame({ timingTracks: [], rows: [{ elementType: "model", elementId: 1, effects: [on("a", ["#ff0000"])] }] });
    // 3 strings x 4 nodes x 3 channels.
    expect(frame.length).toBeGreaterThanOrEqual(36);
    for (let node = 0; node < 12; node++) expect(frame[node * 3], `node ${node} red`).toBe(255);
  });
});

describe("a strand row", () => {
  it("lights that strand and nothing else", () => {
    // The property that makes strand rows safe: no light in two strands, none left out.
    const strandName = strandSpecs(computeGeometryFromAttrs(MATRIX.type, MATRIX.raw_attrs)!)[1]!.name;
    const frame = exportFrame({
      timingTracks: [],
      rows: [{ elementType: "strand", elementId: 1, subName: strandName, effects: [on("s", ["#00ff00"])] }],
    });

    const lit = new Set(strandChannels(1));
    for (let node = 0; node < 12; node++) {
      const green = frame[node * 3 + 1] ?? 0;
      if (lit.has(node * 3)) expect(green, `node ${node} should be lit`).toBe(255);
      else expect(green, `node ${node} should be dark`).toBe(0);
    }
  });

  it("sits on top of the model's own effects", () => {
    // "The strands blend onto the model level effects."
    const strandName = strandSpecs(computeGeometryFromAttrs(MATRIX.type, MATRIX.raw_attrs)!)[0]!.name;
    const frame = exportFrame({
      timingTracks: [],
      rows: [
        { elementType: "model", elementId: 1, effects: [on("m", ["#ff0000"])] },
        { elementType: "strand", elementId: 1, subName: strandName, effects: [on("s", ["#0000ff"])] },
      ],
    });

    const lit = new Set(strandChannels(0));
    for (let node = 0; node < 12; node++) {
      const isStrand = lit.has(node * 3);
      // The strand's blue wins on its own nodes; the model's red is left everywhere else.
      expect(frame[node * 3 + 2], `node ${node} blue`).toBe(isStrand ? 255 : 0);
      expect(frame[node * 3], `node ${node} red`).toBe(isStrand ? 0 : 255);
    }
  });
});

describe("layers in the exported file", () => {
  it("let the higher layer win, whatever order the effects are stored in", () => {
    // The scrubbing path was fixed to composite by layer rather than by array position; this is
    // the same rule holding in the file, which is a separate implementation of it.
    const frame = exportFrame({
      timingTracks: [],
      rows: [
        {
          elementType: "model",
          elementId: 1,
          effects: [on("top", ["#00ff00"], { layerIndex: 1 }), on("bottom", ["#ff0000"], { layerIndex: 0 })],
        },
      ],
    });
    expect(frame[1]).toBe(255); // green, from the higher layer
    expect(frame[0]).toBe(0);
  });
});
