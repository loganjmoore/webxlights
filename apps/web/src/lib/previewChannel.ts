import type { ModelRecord, SequenceBody } from "./api";

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

export type PreviewMessage = PreviewSnapshot | PreviewTransport | PreviewHello | PreviewCommand;

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
