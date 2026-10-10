import { api, type MagicPictureRecord } from "../api";
import { MAX_PICTURE_EDGE } from "../pictureImport";
import { encodePictureData } from "../pictureData";

// Drawn pictures for the lyrics (docs/MAGIC-SEQUENCE.md, "Generated pictures"): the subjects the
// sprite library has no drawing of go to the server, which has an image model draw them (or hands
// back a drawing someone already had made), and each comes back shrunk to the matrix and packed
// into the string the Pictures effect keeps (pictureData.ts).

export interface Drawn {
  /** Subject as asked -> the picture string. */
  pictures: Map<string, string>;
  /** Why some were not drawn, for the dialog's notice; empty when all were. */
  problems: string[];
}

/** Draws what it can within the wait; never throws, so a press always finishes. */
export async function drawPictures(subjects: readonly string[], waitMs = 120_000): Promise<Drawn> {
  const pictures = new Map<string, string>();
  const problems: string[] = [];
  const wanted = [...new Set(subjects)].slice(0, 8);
  if (!wanted.length) return { pictures, problems };
  let records: MagicPictureRecord[];
  try {
    records = (await api.magicPictures(wanted)).pictures;
  } catch (err) {
    return { pictures, problems: [err instanceof Error ? err.message : "the picture service could not be reached"] };
  }
  // The server cleans each subject; answers come back in the order asked.
  const asked = new Map<number, string>();
  records.forEach((r, i) => {
    if (r.id !== null && (r.status === "queued" || r.status === "running" || r.status === "done")) asked.set(r.id, wanted[i]!);
    else if (r.error) problems.push(r.error);
  });
  const started = Date.now();
  let pending = records.filter((r) => r.id !== null && asked.has(r.id));
  while (pending.length) {
    for (const r of pending.filter((p) => p.status === "done" && p.url)) {
      try {
        pictures.set(asked.get(r.id!)!, await shrink(await api.fetchMagicPicture(r.url!)));
      } catch {
        problems.push(`couldn't open the drawing of ${r.subject}`);
      }
    }
    for (const r of pending.filter((p) => p.status === "failed")) problems.push(r.error ?? `couldn't draw ${r.subject}`);
    pending = pending.filter((p) => p.status === "queued" || p.status === "running");
    if (!pending.length) break;
    if (Date.now() - started > waitMs) {
      problems.push("some drawings were still being made; press again to use them");
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const fresh = new Map((await api.magicPictureStatus(pending.map((p) => p.id!))).pictures.map((p) => [p.id, p]));
      pending = pending.map((p) => fresh.get(p.id) ?? p);
    } catch {
      // A failed poll is one missed look; the next one tries again.
    }
  }
  return { pictures, problems };
}

/** A drawing shrunk to fit MAX_PICTURE_EDGE, packed for the effect. */
async function shrink(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_PICTURE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return encodePictureData(width, height, ctx.getImageData(0, 0, width, height).data);
  } finally {
    bitmap.close();
  }
}
