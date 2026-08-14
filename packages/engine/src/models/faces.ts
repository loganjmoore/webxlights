// xLights face definitions (manual: Sequencer > Singing Faces, "Face Definition").
//
// A face definition says which of a model's nodes are the mouth in each position, which are the
// eyes open and closed, and which are the outline. The manual lists three types:
//
//   | Single Node | Coro Faces with LED Lights/Dumb RGB Nodes. i.e. 7/8 Channel LOR Faces |
//   | Node Ranges | Coro Faces with Smart RGB Pixels Faces i.e. Boscoyo Singing Faces     |
//   | Matrix      | Smart RGB Pixels/P5/P10 Matrices                                      |
//
// The first two are node ranges - the same notation sub-models and states already use. The third
// is a picture per mouth position, drawn into the matrix either centred or stretched. Both kinds
// live in this one shape, because they are the same idea addressed two ways, and an effect
// pointed at either should just work.
//
// The phoneme *names* are data, not a fixed list. The manual only ever shows them in screenshots,
// so hardcoding a set would be a guess that silently mismatches: a label naming a mouth this
// definition hasn't got renders nothing, exactly as an unknown state does. Instead a definition
// carries whatever names it was built or imported with, and a new one is seeded with the standard
// set below as a starting point the editor lets you change.

import { parseNodeRanges } from "./subModel";
import type { StateEntry } from "./states";
import type { PictureImage } from "../effects/pictures";

/** A mouth position: a phoneme name and the nodes it lights. Same shape as a state entry. */
export type FaceEntry = StateEntry;

/**
 * A mouth position on a matrix face: the picture shown for it.
 *
 * "You can specify different images for the Eyes Closed position or by default, the same image is
 * copied across" - so a closed-eyes picture is optional and falls back to the open one.
 */
export interface FaceImageEntry {
  name: string;
  image?: PictureImage;
  imageClosed?: PictureImage;
}

export type FacePlacement = "Centered" | "Scaled";

export interface FaceSpec {
  /** "Face1" - a model may carry several definitions and an effect names the one it drives. */
  name: string;
  /**
   * Which of the manual's types this is. Absent means node ranges, which is what every definition
   * was before matrix faces existed - so a stored face keeps working without being migrated.
   */
  kind?: "nodes" | "matrix";
  /** Phoneme -> nodes, for the two node-range types. */
  mouths: FaceEntry[];
  /** Phoneme -> picture, for the matrix type. */
  images?: FaceImageEntry[];
  /** "Then select the image placement i.e. Centered or Scaled." */
  placement?: FacePlacement;
  // The parts that aren't the mouth. Each is a node range, and each is optional: plenty of coro
  // faces are a mouth and nothing else.
  eyesOpen?: string;
  eyesClosed?: string;
  eyesOpen2?: string;
  eyesClosed2?: string;
  eyesOpen3?: string;
  eyesClosed3?: string;
  outline?: string;
  outline2?: string;
}

/**
 * The phoneme set xLights and Papagayo share, offered when a definition is created.
 *
 * A starting point rather than a rule - see the note above. "rest" is the closed mouth, and is
 * what the manual means by "the rest phoneme" when it describes automatic blinking.
 */
export const STANDARD_PHONEMES = ["AI", "E", "etc", "FV", "L", "MBP", "O", "rest", "U", "WQ"];

/** The name of the closed/neutral mouth, matched case-insensitively like every other label. */
export const REST_PHONEME = "rest";

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function isMatrixFace(spec: FaceSpec): boolean {
  return spec.kind === "matrix";
}

export function findMouth(spec: FaceSpec, phoneme: string): FaceEntry | undefined {
  const wanted = key(phoneme);
  return spec.mouths.find((m) => key(m.name) === wanted);
}

/** The picture for a mouth position on a matrix face, or undefined if none was chosen. */
export function findMouthImage(spec: FaceSpec, phoneme: string): FaceImageEntry | undefined {
  const wanted = key(phoneme);
  return (spec.images ?? []).find((m) => key(m.name) === wanted);
}

/** Whether a phoneme is one this definition knows, whichever kind it is. */
export function hasMouth(spec: FaceSpec, phoneme: string): boolean {
  return isMatrixFace(spec) ? findMouthImage(spec, phoneme) !== undefined : findMouth(spec, phoneme) !== undefined;
}

/** The mouth positions a definition offers, for the effect's Phoneme list. */
export function mouthNames(spec: FaceSpec): string[] {
  return isMatrixFace(spec) ? (spec.images ?? []).map((m) => m.name) : spec.mouths.map((m) => m.name);
}

/** The nodes one mouth position lights, as zero-based indices. */
export function nodesForPhoneme(spec: FaceSpec, phoneme: string): number[] {
  const mouth = findMouth(spec, phoneme);
  return mouth ? parseNodeRanges(mouth.nodes) : [];
}

/** Whether a definition has anything to draw at all - an empty one renders nothing. */
export function faceHasNodes(spec: FaceSpec): boolean {
  if (isMatrixFace(spec)) return (spec.images ?? []).some((m) => m.image !== undefined);
  return (
    spec.mouths.some((m) => m.nodes.trim() !== "") ||
    [spec.eyesOpen, spec.eyesClosed, spec.outline, spec.outline2].some((r) => (r ?? "").trim() !== "")
  );
}

/** A new definition: the standard phonemes with nothing assigned to them yet. */
export function emptyFaceSpec(name: string, kind: "nodes" | "matrix" = "nodes"): FaceSpec {
  if (kind === "matrix") {
    return { name, kind, mouths: [], images: STANDARD_PHONEMES.map((phoneme) => ({ name: phoneme })), placement: "Centered" };
  }
  return { name, kind, mouths: STANDARD_PHONEMES.map((phoneme) => ({ name: phoneme, nodes: "" })) };
}
