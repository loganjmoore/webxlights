import { toRaw } from "vue";
import type { AudioSeries } from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";

// Links the sequencer to a popped-out preview window (real xLights has the same idea: the
// house preview lives on a second monitor while you sequence on the first).
//
// The sequencer stays the single source of truth. It owns the <audio> element, so the preview
// never plays audio of its own - two elements playing the same track would drift apart within
// seconds and you'd hear both. The preview mirrors the playhead and sends transport *commands*
// back, which makes its Play/Stop a remote control rather than a second, competing transport.
//
// BroadcastChannel rather than postMessage-to-opener: it survives the preview being reloaded
// or opened from a bookmark, and doesn't need a window handle on either side.

export interface PreviewSnapshot {
  type: "snapshot";
  models: ModelRecord[];
  // Groups travel with the models because a group row renders across several of them, and a
  // preview window that had the models but not the groups would silently drop those rows - the
  // exact bug the main window had before groups rendered at all.
  groups: ModelGroupRecord[];
  body: SequenceBody;
  frameMs: number;
  durationMs: number;
  name: string;
  audioLoaded: boolean;
}

export interface PreviewTransport {
  type: "transport";
  playheadMs: number;
  playing: boolean;
}

// Sent by a preview window when it opens (or reloads) to ask for a full snapshot - otherwise
// it would sit blank until the next edit happened to broadcast one.
export interface PreviewHello {
  type: "hello";
}

export interface PreviewCommand {
  type: "command";
  action: "play" | "pause" | "stop" | "seek";
  ms?: number;
}

// The analysed track, so audio-reactive effects light up in the popped-out window too. Sent on
// its own rather than inside the snapshot: a snapshot goes out on every edit, and a series is
// thousands of frames - re-cloning it each time a slider moves would be the most expensive
// thing either window does. This one goes out when a track is analysed, and on hello.
export interface PreviewAudio {
  type: "audio";
  audio: AudioSeries | null;
}

export type PreviewMessage = PreviewSnapshot | PreviewTransport | PreviewHello | PreviewCommand | PreviewAudio;

// Every message on this channel goes through here, because BroadcastChannel structured-clones
// its payload and a Vue reactive object is a Proxy, which structured clone refuses. Passing a
// ref's `.value` straight in throws "could not be cloned" - and because the throw happens
// synchronously inside an event handler, it reached the app's global error overlay and took
// down the whole sequencer tab over a preview window that failed to sync.
//
// So: unwrap to plain data first, and treat a send that still fails as a preview that didn't
// update rather than as a fatal error. `toRaw` handles the common case cheaply (it returns the
// underlying object a ref/reactive wraps); the JSON round trip is the fallback for anything
// still holding a nested proxy, and it is only paid when the cheap path wasn't enough.
export function postPreviewMessage(channel: BroadcastChannel | null, message: PreviewMessage): boolean {
  if (!channel) return false;
  const plain = toRaw(message);
  try {
    channel.postMessage(plain);
    return true;
  } catch {
    try {
      channel.postMessage(JSON.parse(JSON.stringify(plain)) as PreviewMessage);
      return true;
    } catch (err) {
      // A preview window that misses one update is a cosmetic problem; it asks for a fresh
      // snapshot when it reloads. Crashing the tab that owns the audio is not.
      console.warn("preview sync skipped a message", err);
      return false;
    }
  }
}

export function previewChannelName(sequenceId: number): string {
  return `webxlights-preview-${sequenceId}`;
}

export function openPreviewChannel(sequenceId: number): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null; // no sync available; the tab still renders
  return new BroadcastChannel(previewChannelName(sequenceId));
}

export function previewUrlFor(projectId: number | string, sequenceId: number | string): string {
  return `/projects/${projectId}/sequences/${sequenceId}/preview`;
}
