import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "onnxruntime-web/wasm";
import { beatThisGrid, beatThisLogits, beatThisLogMel, beatThisPeaks } from "@webxlights/engine";
import { beatThisSession } from "../src/lib/magic/beatThisModel";
import { beatThisTestSignal } from "../../../packages/engine/test/beatThisSignal";
import fixture from "../../../packages/engine/test/fixtures/beat-this-parity.json";

// The shipped model end to end: this repo's log-mel and chunking, the ONNX file in public/models
// on onnxruntime-web's WASM backend, against what the PyTorch checkpoint gave for the same signal
// (tools/beat-this/export_onnx.py wrote the fixture).

const model = readFileSync(fileURLToPath(new URL("../public/models/beat-this-small0.onnx", import.meta.url)));
env.wasm.numThreads = 1; // Node has no SharedArrayBuffer workers for it; the browser uses threads.

describe("Beat This! model", () => {
  it("matches the PyTorch logits and finds the same beats", { timeout: 120_000 }, async () => {
    const infer = await beatThisSession(model);
    const signal = beatThisTestSignal();
    const { beat, downbeat } = await beatThisLogits(beatThisLogMel(signal), infer);
    expect(beat.length).toBe(fixture.frames);
    let worst = 0;
    for (let t = 0; t < fixture.frames; t++) {
      worst = Math.max(worst, Math.abs(beat[t]! - fixture.beatLogits[t]!), Math.abs(downbeat[t]! - fixture.downbeatLogits[t]!));
    }
    expect(worst).toBeLessThan(1e-3);
    expect(beatThisPeaks(beat, downbeat)).toEqual({ beats: fixture.beats, downbeats: fixture.downbeats });

    // The same through the resampler, from 44.1 kHz.
    const at44 = new Float32Array(signal.length * 2).map((_, i) => signal[i >> 1]!);
    const grid = await beatThisGrid(at44, 44100, infer);
    expect(grid.beats.length).toBe(fixture.beats.length);
    expect(Math.max(...grid.beats.map((b, i) => Math.abs(b - fixture.beats[i]!)))).toBeLessThanOrEqual(0.02);
  });
});
