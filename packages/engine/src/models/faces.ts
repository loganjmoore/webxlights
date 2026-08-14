// xLights face definitions (manual: Sequencer > Singing Faces, "Face Definition").
//
// A face definition says which of a model's nodes are the mouth in each position, which are the
// eyes open and closed, and which are the outline. The manual lists three types:
//
//   | Single Node | Coro Faces with LED Lights/Dumb RGB Nodes. i.e. 7/8 Channel LOR Faces |
//   | Node Ranges | Coro Faces with Smart RGB Pixels Faces i.e. Boscoyo Singing Faces     |
//   | Matrix      | Smart RGB Pixels/P5/P10 Matrices                                      |
//
// The first two are node ranges - the same notation sub-models and states already use - and are
// what this file covers. The Matrix type is a *picture per mouth position* and needs image storage
// and placement rules, which is a separate piece of work; a Matrix definition is deliberately not
// imported as ranges, because its values are file paths and reading them as node numbers would
// light arbitrary nodes rather than fail.
//
// The phoneme *names* are data, not a fixed list. The manual only ever shows them in screenshots,
// so hardcoding a set would be a guess that silently mismatches: a label naming a mouth this
// definition hasn't got renders nothing, exactly as an unknown state does. Instead a definition
// carries whatever names it was built or imported with, and a new one is seeded with the standard
// set below as a starting point the editor lets you change.

import { parseNodeRanges } from "./subModel";
import type { StateEntry } from "./states";

/** A mouth position: a phoneme name and the nodes it lights. Same shape as a state entry. */
export type FaceEntry = StateEntry;

export interface FaceSpec {
  /** "Face1" - a model may carry several definitions and an effect names the one it drives. */
  name: string;
  /** Phoneme -> nodes. */
  mouths: FaceEntry[];
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

export function findMouth(spec: FaceSpec, phoneme: string): FaceEntry | undefined {
  const wanted = key(phoneme);
  return spec.mouths.find((m) => key(m.name) === wanted);
}

/** The nodes one mouth position lights, as zero-based indices. */
export function nodesForPhoneme(spec: FaceSpec, phoneme: string): number[] {
  const mouth = findMouth(spec, phoneme);
  return mouth ? parseNodeRanges(mouth.nodes) : [];
}

/** Whether a definition has anything to draw at all - an empty one renders nothing. */
export function faceHasNodes(spec: FaceSpec): boolean {
  return (
    spec.mouths.some((m) => m.nodes.trim() !== "") ||
    [spec.eyesOpen, spec.eyesClosed, spec.outline, spec.outline2].some((r) => (r ?? "").trim() !== "")
  );
}

/** A new definition: the standard phonemes with no nodes assigned yet. */
export function emptyFaceSpec(name: string): FaceSpec {
  return { name, mouths: STANDARD_PHONEMES.map((phoneme) => ({ name: phoneme, nodes: "" })) };
}
