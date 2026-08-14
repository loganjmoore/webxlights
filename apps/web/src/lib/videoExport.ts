// xLights' Export Model as Video: render one model's frames to a video file.
//
// It answers a question the house preview can't: "what will this prop actually look like?" —
// as something you can send to someone who isn't sitting at the app.
//
// Encoding is `MediaRecorder` over a canvas. The renderer already produces every frame, so this
// is a matter of drawing them at the right rate and letting the browser encode. No frame is
// skipped: frames are drawn on a fixed schedule and the recorder is fed from the canvas' own
// capture stream at exactly the sequence's frame rate, so the video runs at the same speed the
// sequence does rather than at whatever speed the machine managed.

export interface VideoExportOptions {
  frameMs: number;
  frameCount: number;
  /** Draws frame `i` into the canvas. Called once per frame, in order. */
  drawFrame: (index: number) => void;
  /** 0..1, reported as the export proceeds - a long sequence takes a while. */
  onProgress?: (fraction: number) => void;
}

/** Whether this browser can encode at all, so the button can say so rather than failing on click. */
export function canExportVideo(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/** The best container this browser will encode, or null if it won't encode any of them. */
export function pickMimeType(): string | null {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function extensionFor(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

/**
 * Records a canvas while `drawFrame` walks the sequence.
 *
 * Resolves with the encoded file. Rejects only for a browser that can't encode - a draw that
 * throws mid-way is left to the caller, since a half-recorded video of a sequence that errored is
 * more useful than nothing to look at.
 */
export async function recordCanvas(canvas: HTMLCanvasElement, options: VideoExportOptions): Promise<Blob> {
  const mimeType = pickMimeType();
  if (!canExportVideo() || !mimeType) throw new Error("This browser can't encode video.");

  const fps = Math.max(1, Math.round(1000 / Math.max(1, options.frameMs)));
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();
  await drawOnSchedule(options, fps);
  // A last tick before stopping, so the final frame is actually captured rather than being cut
  // off by the stop that follows it.
  await new Promise((r) => setTimeout(r, Math.max(16, options.frameMs)));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return finished;
}

/**
 * Draws every frame, one per real frame interval.
 *
 * Drawn on a timer rather than as fast as possible: `captureStream` samples the canvas in real
 * time, so racing through the frames would produce a video several seconds long of a sequence
 * several minutes long.
 */
function drawOnSchedule(options: VideoExportOptions, fps: number): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const interval = 1000 / fps;
    const tick = (): void => {
      if (index >= options.frameCount) {
        resolve();
        return;
      }
      options.drawFrame(index);
      index++;
      options.onProgress?.(index / options.frameCount);
      setTimeout(tick, interval);
    };
    tick();
  });
}

export function downloadVideo(blob: Blob, name: string, mimeType: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9._ -]/gi, "_") || "model"}.${extensionFor(mimeType)}`;
  a.click();
  URL.revokeObjectURL(url);
}
