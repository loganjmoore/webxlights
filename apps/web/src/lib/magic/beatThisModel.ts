import type { BeatThisInfer } from "@webxlights/engine";

// The Beat This! network (small0 checkpoint, MIT, exported by tools/beat-this/export_onnx.py) on
// onnxruntime-web's WASM backend, for the analysis worker. Loaded only when someone asks for pro
// analysis: the runtime is a separate chunk and its 14 MB of WASM plus the 10 MB model are
// fetched on that first use, the model kept in Cache Storage after it.

const MODEL_URL = "/models/beat-this-small0.onnx";
const CACHE = "pixl-models";

async function modelBytes(): Promise<Uint8Array> {
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(MODEL_URL);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(MODEL_URL);
  // A missing file comes back as the app's index.html with a 200; never cache that as the model.
  if (!res.ok || res.headers.get("content-type")?.includes("text/html")) throw new Error(`couldn't download the beat model (${res.status})`);
  await cache?.put(MODEL_URL, res.clone()).catch(() => undefined);
  return new Uint8Array(await res.arrayBuffer());
}

/** Runs one chunk of log-mel frames through the model: input "spect" [1, T, 128], two [1, T] logit outputs. */
export async function beatThisSession(model: Uint8Array): Promise<BeatThisInfer> {
  const ort = await import("onnxruntime-web/wasm");
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return async (spect, frames) => {
    const out = await session.run({ spect: new ort.Tensor("float32", spect, [1, frames, 128]) });
    return { beat: out.beat!.data as Float32Array, downbeat: out.downbeat!.data as Float32Array };
  };
}

export async function beatThisModel(): Promise<BeatThisInfer> {
  return beatThisSession(await modelBytes());
}
