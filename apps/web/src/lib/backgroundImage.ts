// The Layout tab's background image: a photo of the house, behind the models, so props can be
// placed where they physically are rather than by eye against an empty grid. It is the thing that
// turns the layout from a diagram into a plan of a particular house.
//
// Stored as a data URL in the layout's `settings` JSON, alongside views and presets. A photo
// straight off a phone is several megabytes, which is far too much to carry in a settings row
// that is read on every page load - so it is downscaled first. The long edge is capped at a size
// that still shows a roofline clearly at any zoom the layout canvas offers, which is all this
// image ever has to do.

export const MAX_BACKGROUND_EDGE = 1600;
/** Rejected before decoding, so a 40MB raw file can't stall the tab on its way to being rejected. */
export const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;

export interface BackgroundImage {
  /** A data URL - `settings` is JSON, so the image has to be text. */
  dataUrl: string;
  width: number;
  height: number;
  /** 0-100. A backdrop competing with the props for attention is worse than none. */
  opacity: number;
}

export const DEFAULT_BACKGROUND_OPACITY = 45;

export interface PreparedBackground {
  image: BackgroundImage | null;
  error: string;
}

/** The scaled size for an image, keeping its shape. */
export function scaledSize(width: number, height: number, maxEdge = MAX_BACKGROUND_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const factor = maxEdge / longest;
  // Floored at one pixel: a very long, very thin image would otherwise scale its short edge to
  // zero and decode to nothing.
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

/**
 * Reads a picked file into a stored background image.
 *
 * Returns an error rather than throwing for anything that isn't a usable image: this is driven by
 * a file input, which is exactly where the wrong file gets chosen, and a throw in that handler
 * reaches the app's error overlay and takes the page down.
 */
export async function prepareBackground(file: File): Promise<PreparedBackground> {
  if (!file.type.startsWith("image/")) return { image: null, error: `"${file.name}" isn't an image.` };
  if (file.size > MAX_BACKGROUND_BYTES) {
    return { image: null, error: `"${file.name}" is too large (${Math.round(file.size / 1024 / 1024)}MB).` };
  }

  let decoded: { source: CanvasImageSource; width: number; height: number; release: () => void } | undefined;
  try {
    // Some browser/image combinations reject createImageBitmap even when <img> can decode
    // the photo. Keep the normal fast path, then use the browser's image-element decoder.
    try {
      const bitmap = await createImageBitmap(file);
      decoded = { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read"));
        reader.onerror = reader.onabort = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      }).catch(() => { throw new Error(`Couldn't open "${file.name}". Download the original photo to this device, then choose it again.`); });
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`This browser couldn't decode "${file.name}". Export the photo as JPEG or PNG and choose the exported file; renaming its extension won't convert it.`));
        image.src = dataUrl;
      });
      decoded = { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ""; } };
    }
    if (!decoded.width || !decoded.height) throw new Error(`"${file.name}" has no readable image dimensions. Export it as JPEG or PNG and try again.`);
    const { width, height } = scaledSize(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't prepare the photo in this browser. Reload the page and try again.");
    ctx.drawImage(decoded.source, 0, 0, width, height);
    // The upload and stored backdrop both use this resized JPEG, never the original file.
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("Couldn't resize the photo. Try exporting a smaller JPEG and choose it again.");
    return { image: { dataUrl, width, height, opacity: DEFAULT_BACKGROUND_OPACITY }, error: "" };
  } catch (error) {
    return { image: null, error: error instanceof Error ? error.message : `Couldn't prepare "${file.name}". Export it as JPEG or PNG and try again.` };
  } finally {
    decoded?.release();
  }
}

/** Reads a layout's stored settings bag, tolerating one that predates backgrounds. */
export function backgroundFrom(settings: Record<string, unknown> | null | undefined): BackgroundImage | null {
  const raw = (settings ?? {})["backgroundImage"] as Partial<BackgroundImage> | undefined;
  if (!raw || typeof raw.dataUrl !== "string" || !raw.dataUrl.startsWith("data:image/")) return null;
  return {
    dataUrl: raw.dataUrl,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    opacity: clampOpacity(raw.opacity),
  };
}

export function clampOpacity(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : DEFAULT_BACKGROUND_OPACITY;
}
