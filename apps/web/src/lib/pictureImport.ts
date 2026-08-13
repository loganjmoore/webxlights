import type { PictureImage } from "@webxlights/engine";

// Pictures effect images live inside the sequence body (there's still no R2-backed asset
// store - see DECISIONS.md M0/M2), so they go through autosave on every edit. A full-size
// photo would blow straight past the ROADMAP's <500KB autosave budget, and no pixel matrix in
// a real layout is anywhere near this resolution anyway, so images are downscaled on import.
export const MAX_PICTURE_EDGE = 64;

export async function decodeImageForEffect(file: File, maxEdge = MAX_PICTURE_EDGE): Promise<PictureImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser wouldn't give us a 2D canvas to read the image with");

    ctx.drawImage(bitmap, 0, 0, width, height);
    // plain number[] rather than the Uint8ClampedArray: the sequence body is JSON, and a typed
    // array round-trips through JSON.stringify as an object of numeric keys
    return { width, height, data: Array.from(ctx.getImageData(0, 0, width, height).data) };
  } finally {
    bitmap.close();
  }
}
