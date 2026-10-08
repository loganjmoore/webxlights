import type { SongAnalysisProgress, SongMap } from "@webxlights/engine";
import type { SequenceMetadata } from "../api";
import { toMono } from "../audioAnalysis";
import type { SongWorkerMessage } from "./songAnalysis.worker";

// The page's side of song analysis: down-mix the decoded track, hand it to the worker, and keep
// the result on the sequence so a song is analysed once rather than once per press.

/**
 * Analyses a decoded track in a Worker.
 *
 * The samples are copied before they are transferred: a mono track's channel data is the
 * AudioBuffer's own memory, and transferring that would empty the buffer the player is using.
 */
export function analyzeSongInWorker(buffer: AudioBuffer, onProgress?: SongAnalysisProgress): Promise<SongMap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./songAnalysis.worker.ts", import.meta.url), { type: "module" });
    const settle = (finish: () => void): void => {
      worker.terminate();
      finish();
    };
    worker.onmessage = (event: MessageEvent<SongWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") onProgress?.(message.fraction, message.step);
      else if (message.type === "done") settle(() => resolve(message.songMap));
      else settle(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => settle(() => reject(new Error(event.message || "Song analysis failed")));

    const mono = toMono(buffer);
    const samples = buffer.numberOfChannels === 1 ? mono.slice() : mono;
    worker.postMessage({ samples, sampleRate: buffer.sampleRate }, [samples.buffer]);
  });
}

/** SHA-256 of the audio file's bytes, as hex: what says a cached SongMap is for this song. */
export async function audioHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The SongMap saved on a sequence, if it was made from audio with this hash. A map saved by a
 * different version of the format is treated as missing rather than read wrongly.
 */
export function cachedSongMap(metadata: SequenceMetadata | null | undefined, hash: string): SongMap | null {
  const cached = metadata?.songMap;
  return cached && cached.hash === hash && cached.map?.version === 1 ? cached.map : null;
}

/** The sequence's metadata with the SongMap stored on it, everything else as it was. */
export function withCachedSongMap(metadata: SequenceMetadata | null | undefined, hash: string, songMap: SongMap): SequenceMetadata {
  return { ...metadata, songMap: { hash, map: songMap } };
}
