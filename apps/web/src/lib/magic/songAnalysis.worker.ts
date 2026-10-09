import { analyzeSong, beatThisGrid, type SongMap } from "@webxlights/engine";
import { beatThisModel } from "./beatThisModel";

// Song analysis off the main thread. The engine's analyzeSong is synchronous and takes a few
// seconds on a full-length track; run on the page it would freeze the sequencer for that long,
// so songMapClient.ts hands it the samples here and listens for the result. With `pro`, the beats
// and downbeats come from Beat This! (beatThisModel.ts) and the rest of the analysis builds on them.

export interface SongWorkerRequest {
  samples: Float32Array;
  sampleRate: number;
  pro?: boolean;
}

export type SongWorkerMessage =
  | { type: "progress"; fraction: number; step: string }
  | { type: "done"; songMap: SongMap }
  | { type: "error"; message: string };

const post = (message: SongWorkerMessage): void => self.postMessage(message);

self.onmessage = async (event: MessageEvent<SongWorkerRequest>) => {
  const { samples, sampleRate, pro } = event.data;
  try {
    let grid: { beats: number[]; downbeats: number[] } | undefined;
    if (pro) {
      post({ type: "progress", fraction: 0, step: "Loading the beat model" });
      const infer = await beatThisModel();
      post({ type: "progress", fraction: 0, step: "Tracking beats" });
      grid = await beatThisGrid(samples, sampleRate, infer, (done, total) => post({ type: "progress", fraction: done / total, step: `Tracking beats, part ${done} of ${total}` }));
    }
    const songMap = analyzeSong(samples, sampleRate, (fraction, step) => post({ type: "progress", fraction, step }), { grid });
    post({ type: "done", songMap });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : "Song analysis failed" });
  }
};
