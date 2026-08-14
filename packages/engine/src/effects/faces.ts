import type { RGBA } from "../color";
import { hexToRgba, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { REST_PHONEME, findMouth, findMouthImage, hasMouth, isMatrixFace, type FaceSpec } from "../models/faces";
import { drawImageInto, facePlacement } from "./imageDraw";
import { parseNodeRanges } from "../models/subModel";
import { labelAt, splitLabel } from "../timing";
import type { FrameContext } from "./types";

// SPEC/manual "Faces": "used by xLights to generate singing and talking face effects".
//
// It renders all three of the manual's face types. The two node-range ones - "Single Node" and
// "Node Ranges", the coro faces - light named sets of the model's nodes. The "Matrix" type draws a
// picture per mouth position instead, centred or stretched to the matrix.
//
// The mechanism is the one the State effect established: a timing track's labels name what the
// prop does, and named sets of the model's nodes light up. A phoneme track is a lyric track that
// has been broken down twice - phrases into words, words into phonemes - and each phoneme cell's
// label is a mouth position.

// One setting from the manual's table is absent: "Suppress Shimmer" skips a `-shimmer` tag whose
// shimmer isn't rendered here, so the face already behaves as if it were always checked. (This
// comment used to say the same of "Transparent Black" - true while only node-range faces existed,
// since they never write a pixel they weren't asked to, and wrong as soon as a face could draw a
// picture. It is a real setting again, and it is below.)

export const FACE_EYE_MODES = ["Open", "Close", "Automatic", "(off)"] as const;
export type FaceEyeMode = (typeof FACE_EYE_MODES)[number];

export interface FacesParams {
  /** Which of the model's definitions drives this effect. Resolved to a spec by the caller. */
  faceDefinition: string;
  /** "Sets Timing Track to use for Lyrics/Phonemes". */
  timingTrack: string;
  /** "Sets Face to specific mouth position" - used when no track drives the effect. */
  phoneme: string;
  useTimingTrack: boolean;
  eyes: FaceEyeMode;
  /** "Set the speed of Automatic Eye Blinking", in seconds between blinks. */
  eyeBlinkSeconds: number;
  /** "Sets how long each automatic eye blink lasts". */
  eyeBlinkLengthMs: number;
  /** "Show outline if defined in the Face Definition". */
  showOutline: boolean;
  /** "If set, the Face will disappear if no lyrics are present, in the timing track". */
  suppressWhenNotSinging: boolean;
  /** "Number of frames the face will appear before the lyrics start/end". */
  leadInFrames: number;
  leadOutFrames: number;
  fadeDuringLeadInOut: boolean;
  /**
   * "Sets the black pixels transparent to show effects on lower layers."
   *
   * Only a matrix face draws pixels it wasn't asked to - a photograph's background is black, and
   * without this it covers whatever the layer below drew.
   */
  transparentBlack: boolean;
}

// The manual's palette table, verbatim:
//   1st Mouth Nodes / 2nd Eyes Open/Close Nodes / 3rd Outline Nodes / 4th Outline2 Nodes /
//   5th Eyes Open2/Close2 Nodes / 6th Eyes Open3/Close3 Nodes
const MOUTH_COLOR = 0;
const EYES_COLOR = 1;
const OUTLINE_COLOR = 2;
const OUTLINE2_COLOR = 3;
const EYES2_COLOR = 4;
const EYES3_COLOR = 5;

/**
 * How visible the face is at this moment.
 *
 * 1 normally. With "suppress when not singing" the face is hidden between lyrics, except for the
 * lead-in and lead-out frames either side, which can fade rather than cut - the manual's own pair
 * of settings. Returns 0 for hidden.
 */
export function faceVisibility(params: FacesParams, ctx: FrameContext): number {
  if (!params.suppressWhenNotSinging) return 1;
  const labels = ctx.data?.timing ?? [];
  const clock = ctx.clock;
  if (!clock || labels.length === 0) return 1;
  if (labelAt(labels, clock.atMs)) return 1;

  const frame = clock.frameMs || 50;
  const leadIn = Math.max(0, params.leadInFrames) * frame;
  const leadOut = Math.max(0, params.leadOutFrames) * frame;

  // How far the playhead is from the singing either side of this silence.
  const next = labels.filter((l) => l.startMs > clock.atMs).reduce<number | null>((best, l) => (best === null || l.startMs < best ? l.startMs : best), null);
  const previous = labels.filter((l) => l.endMs <= clock.atMs).reduce<number | null>((best, l) => (best === null || l.endMs > best ? l.endMs : best), null);

  const untilNext = next === null ? Infinity : next - clock.atMs;
  const sincePrevious = previous === null ? Infinity : clock.atMs - previous;

  if (leadIn > 0 && untilNext <= leadIn) {
    return params.fadeDuringLeadInOut ? 1 - untilNext / leadIn : 1;
  }
  if (leadOut > 0 && sincePrevious <= leadOut) {
    return params.fadeDuringLeadInOut ? 1 - sincePrevious / leadOut : 1;
  }
  return 0;
}

/**
 * The mouth position at this moment.
 *
 * A phoneme cell's label is the mouth position, and a lyric track that hasn't been broken down
 * yet holds whole phrases - words that name no mouth. Those fall back to the rest position rather
 * than to nothing, so a face driven by an un-broken-down track closes its mouth instead of
 * disappearing.
 */
export function activePhoneme(params: FacesParams, spec: FaceSpec, ctx: FrameContext): string {
  if (!params.useTimingTrack) return params.phoneme || REST_PHONEME;
  const clock = ctx.clock;
  const cell = clock ? labelAt(ctx.data?.timing ?? [], clock.atMs) : undefined;
  if (!cell) return REST_PHONEME;

  // A label can carry a tag after the phoneme; the first token that names a mouth is the mouth.
  for (const token of splitLabel(cell.label)) {
    if (hasMouth(spec, token)) return token;
  }
  return REST_PHONEME;
}

/**
 * Whether the eyes are closed at this moment.
 *
 * "Automatic blinks the eye based on frequency", and the manual adds that it does so "when the
 * rest phenome is on" - so a face blinks between words rather than mid-syllable. Driven by
 * absolute time, so a scrub and a sequential render agree.
 */
export function eyesClosedAt(params: FacesParams, phoneme: string, ctx: FrameContext): boolean {
  if (params.eyes === "Close") return true;
  if (params.eyes !== "Automatic") return false;
  if (phoneme.toLowerCase() !== REST_PHONEME) return false;

  const period = Math.max(1, params.eyeBlinkSeconds) * 1000;
  const length = Math.max(1, params.eyeBlinkLengthMs);
  const atMs = ctx.clock?.atMs ?? 0;
  return atMs % period < length;
}

export function renderFaces(buffer: RenderBuffer, palette: RGBA[], params: FacesParams, ctx: FrameContext): void {
  const spec = ctx.data?.face;
  const nodes = ctx.nodes;
  if (!spec || !nodes || nodes.length === 0) return;

  const visibility = faceVisibility(params, ctx);
  if (visibility <= 0) return;

  const phonemeNow = activePhoneme(params, spec, ctx);
  if (isMatrixFace(spec)) {
    renderMatrixFace(buffer, spec, params, phonemeNow, visibility, ctx);
    return;
  }

  const swatch = (index: number): RGBA => palette[index] ?? palette[0] ?? rgba(255, 255, 255);
  const paint = (ranges: string | undefined, color: RGBA): void => {
    if (!ranges || ranges.trim() === "") return;
    for (const index of parseNodeRanges(ranges)) {
      const node = nodes[index];
      if (!node) continue; // a range naming nodes this model hasn't got
      buffer.setPixel(node.bufX, node.bufY, color);
    }
  };

  // Outline first: it is the shape the face sits inside, and the mouth wins where they overlap.
  if (params.showOutline) {
    paint(spec.outline, dim(swatch(OUTLINE_COLOR), visibility));
    paint(spec.outline2, dim(swatch(OUTLINE2_COLOR), visibility));
  }

  const phoneme = phonemeNow;
  const closed = eyesClosedAt(params, phoneme, ctx);
  if (params.eyes !== "(off)") {
    paint(closed ? spec.eyesClosed : spec.eyesOpen, dim(swatch(EYES_COLOR), visibility));
    paint(closed ? spec.eyesClosed2 : spec.eyesOpen2, dim(swatch(EYES2_COLOR), visibility));
    paint(closed ? spec.eyesClosed3 : spec.eyesOpen3, dim(swatch(EYES3_COLOR), visibility));
  }

  const mouth = findMouth(spec, phoneme);
  if (mouth) {
    // "If force custom colors is enabled in the model's face definition, the custom colors takes
    // precedence and the color pallet will not change the effects color."
    const color = mouth.color ? hexToRgba(mouth.color) : swatch(MOUTH_COLOR);
    paint(mouth.nodes, dim(color, visibility));
  }
}

/**
 * A matrix face: one picture, placed.
 *
 * The eyes aren't separate nodes here - they are part of the picture - so the eye setting chooses
 * between the two images a mouth position can carry, and "(off)" simply means never use the
 * closed one. A mouth with no picture draws nothing rather than falling back to another mouth's,
 * which would be a face that mouths the wrong shape without ever looking broken.
 */
function renderMatrixFace(
  buffer: RenderBuffer,
  spec: FaceSpec,
  params: FacesParams,
  phoneme: string,
  visibility: number,
  ctx: FrameContext,
): void {
  const entry = findMouthImage(spec, phoneme) ?? findMouthImage(spec, REST_PHONEME);
  if (!entry) return;

  const closed = params.eyes !== "(off)" && eyesClosedAt(params, phoneme, ctx);
  // "You can specify different images for the Eyes Closed position or by default, the same image
  // is copied across."
  const image = (closed ? entry.imageClosed : entry.image) ?? entry.image;
  if (!image) return;

  drawImageInto(buffer, image, {
    ...facePlacement(spec.placement ?? "Centered", image, buffer.width, buffer.height),
    transparentBlack: params.transparentBlack,
    opacity: visibility,
  });
}

function dim(color: RGBA, amount: number): RGBA {
  return amount >= 1 ? color : rgba(color.r, color.g, color.b, Math.round(color.a * amount));
}
