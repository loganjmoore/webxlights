// xLights model States (manual: Effects > State, "Definition"). A state is a *named set of the
// model's nodes*, defined on the model itself and referred to by name from the sequencer.
//
// It is how a prop that isn't a face gets expressions: the manual's own examples are a reindeer
// coro whose eyes look left, right or wink, and a seven-segment "tune to" sign whose digits are
// each a state. "You can define up to 40 different combinations of channels to turn on and off
// (each combination via a state setting)."
//
// The notation is the same node-range notation sub-models use - "From the drop down box, select
// either Single Range or Node ranges" - so a state is parsed by the same parser. Which of the two
// was chosen changes nothing about the result (a single node is a range list of one), so it isn't
// stored: a setting nothing reads is a setting that can silently disagree with what's drawn.

import { parseNodeRanges } from "./subModel";

export interface StateEntry {
  /** The word the timing track has to say to turn this on - "wink", "eyesleft", "7", "Colon". */
  name: string;
  /** Node ranges in xLights' own notation: "1-5,9,12-14". */
  nodes: string;
  /**
   * "Force Custom Colors" - the dialog's Color column. Unset means the colour comes from the
   * effect's palette, which is what the manual describes as the default ("sourced from the model
   * properties").
   */
  color?: string;
}

export interface StateSpec {
  /** "State1" - a model may carry several definitions and an effect names the one it drives. */
  name: string;
  entries: StateEntry[];
}

/** The manual's cap. Enforced where states are edited, not here - loading a file shouldn't lose data. */
export const MAX_STATES_PER_DEFINITION = 40;

/**
 * The state names a seven-segment display needs, in the manual's own scheme: "States 1 through 0
 * control the right most digit, States 00 to 90 control the second last digit from the right, 100
 * to 900 control the 3rd digit from the right and 1000 to 9000 control the first digit", plus
 * "'Colon' and 'Dot' represent the colon and dot respectively".
 *
 * Offered as a starting point in the editor because typing 42 rows by hand to light a clock is
 * the kind of chore that stops people using the feature at all.
 */
export function sevenSegmentStateNames(digits = 4): string[] {
  const out: string[] = [];
  for (let place = 0; place < Math.max(1, digits); place++) {
    const zeros = "0".repeat(place);
    for (let d = 0; d <= 9; d++) out.push(`${d}${zeros}`);
  }
  out.push("Colon", "Dot");
  return out;
}

/** Case- and space-insensitive: a label typed "EyesLeft" should find the state named "eyesleft". */
function key(name: string): string {
  return name.trim().toLowerCase();
}

export function findState(entries: readonly StateEntry[], name: string): StateEntry | undefined {
  const wanted = key(name);
  return entries.find((e) => key(e.name) === wanted);
}

/**
 * The nodes one state turns on, as zero-based indices.
 *
 * Returns an empty list for a name no state defines - a timing track will always have labels that
 * aren't states (a lyric track shared with a Faces effect, a typo), and the manual's own advice is
 * "ensure that the text exactly matches one of the states defined". Rendering nothing is the
 * honest answer to a name the model doesn't know.
 */
export function nodesForState(entries: readonly StateEntry[], name: string): number[] {
  const entry = findState(entries, name);
  return entry ? parseNodeRanges(entry.nodes) : [];
}

/** Index of a state within its definition - what "Allocate" allocates a colour by. */
export function stateIndex(entries: readonly StateEntry[], name: string): number {
  const wanted = key(name);
  return entries.findIndex((e) => key(e.name) === wanted);
}

/**
 * The digit states that spell a number, per the seven-segment scheme above.
 *
 * 123 becomes ["100", "20", "3"] - which is exactly what the manual tells you to type into the
 * label by hand in Default mode, and what the countdown modes have to work out for themselves.
 *
 * Zero digits are named too ("00" for a zero in the tens place), because a sign counting down
 * through 100 has to light the two right-hand zeros or it reads as a bare "1". Leading zeros never
 * appear, so a number is only ever as wide as it needs to be.
 */
export function digitStatesFor(value: number): string[] {
  const digits = String(Math.max(0, Math.floor(value))).split("");
  return digits.map((d, i) => d + "0".repeat(digits.length - 1 - i));
}
