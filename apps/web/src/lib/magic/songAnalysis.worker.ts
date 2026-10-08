import { analyzeSong, type SongMap } from "@webxlights/engine";

// Song analysis off the main thread. The engine's analyzeSong is synchronous and takes a few
// seconds on a full-length track; run on the page it would freeze the sequencer for that long,
// so songMapClient.ts hands it the samples here and listens for the result.

export interface SongWorkerRequest {
  samples: Float32Array;
  sampleRate: number;
}

export type SongWorkerMessage =
  | { type: "progress"; fraction: number; step: string }
  | { type: "done"; songMap: SongMap }
  | { type: "error"; message: string };

const post = (message: SongWorkerMessage): void => self.postMessage(message);

self.onmessage = (event: MessageEvent<SongWorkerRequest>) => {
  const { samples, sampleRate } = event.data;
  try {
    const songMap = analyzeSong(samples, sampleRate, (fraction, step) => post({ type: "progress", fraction, step }));
    post({ type: "done", songMap });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : "Song analysis failed" });
  }
};
