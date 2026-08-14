import type { RGBA } from "../color";
import { hexToRgba, multiColorBlend, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { digitStatesFor, findState, nodesForState, stateIndex, type StateEntry } from "../models/states";
import { labelAt, labelsWithin, splitLabel } from "../timing";
import type { FrameContext } from "./types";

// SPEC/manual "State": the effect that drives a prop's *named node sets* from words on a timing
// track. The manual's framing: "similar to the Faces effect, but enables you to have similar
// functionality for props that are not standard 'Faces' - such as Reindeer Coro faces, a seven
// segment FM 'Tune to sign' with a colon and a dot".
//
// Everything it draws is a state defined on the model (models/states.ts), so this effect lights
// *particular nodes* rather than filling a shape - the one family of effects that addresses the
// model by node number instead of by buffer position. Those nodes arrive on the frame context.
//
// With no state definition it draws nothing at all, which is the honest result: a state effect on
// a model with no states has nothing to say.

export const STATE_MODES = ["Default", "Iterate", "Countdown", "Time Countdown"] as const;
export type StateMode = (typeof STATE_MODES)[number];

// The manual's Color attribute, plus "Default" for its own described default ("the colors to be
// turned on, by default are sourced from the model properties").
export const STATE_COLOR_MODES = ["Default", "Graduate", "Cycle", "Allocate", "Number"] as const;
export type StateColorMode = (typeof STATE_COLOR_MODES)[number];

export interface StateParams {
  /** Which of the model's definitions drives this effect. Resolved to entries by the caller. */
  stateDefinition: string;
  mode: StateMode;
  /** Drive from a timing track's labels, rather than holding one state for the whole effect. */
  useTimingTrack: boolean;
  timingTrack: string;
  /**
   * The state to turn on when no track drives it - "you can also select a specific State to turn
   * on instead of using the Timing track". Also carries the countdown's starting value.
   */
  state: string;
  colorMode: StateColorMode;
}

interface ActiveStates {
  names: string[];
  /** Which timing cell we are in - what "Cycle" changes colour on. */
  cellIndex: number;
}

/**
 * Which states are on at this instant.
 *
 * The two track-driven modes differ in what they do with the cells, and the difference is the
 * manual's: Default follows the track ("ensure that the text exactly matches one of the states
 * defined" - the label at the playhead is the state), while Iterate ignores where the cells fall
 * and "causes it to loop around equally for the timespan duration selected for the effect".
 */
export function activeStates(params: StateParams, ctx: FrameContext): ActiveStates {
  const labels = ctx.data?.timing ?? [];
  const clock = ctx.clock;
  const track = params.useTimingTrack && labels.length > 0 && clock ? labels : null;

  if (params.mode === "Countdown" || params.mode === "Time Countdown") {
    // The starting value is written in the label ("if 123 was used... it would count down from
    // 123 to zero"), or typed into the effect when no track drives it.
    const from = (track && clock ? labelAt(track, clock.atMs)?.label : undefined) ?? params.state;
    return { names: countdownStates(params.mode, from, ctx), cellIndex: 0 };
  }

  if (!track || !clock) return { names: splitLabel(params.state), cellIndex: 0 };

  if (params.mode === "Iterate") {
    // The cells inside the effect are what it loops over; a track whose labels all sit outside
    // the effect still has something to iterate, so it falls back to the whole track rather than
    // rendering nothing.
    const inside = labelsWithin(track, clock.startMs, clock.endMs);
    const list = inside.length > 0 ? inside : track;
    const i = Math.min(list.length - 1, Math.floor(ctx.positionInEffect01 * list.length));
    return { names: splitLabel(list[i]!.label), cellIndex: i };
  }

  const cell = labelAt(track, clock.atMs);
  if (!cell) return { names: [], cellIndex: 0 };
  return { names: splitLabel(cell.label), cellIndex: Math.max(0, track.indexOf(cell)) };
}

/**
 * The digit states of a countdown at this instant.
 *
 * "Countdown" spreads the count across the effect - it reaches zero as the effect ends. "Time
 * Countdown" counts real seconds from a time written as minutes.seconds, "until the effect
 * duration runs out", and shows the colon a clock needs.
 */
function countdownStates(mode: StateMode, from: string, ctx: FrameContext): string[] {
  if (mode === "Time Countdown") {
    const [minutes = "0", seconds = "0"] = from.trim().split(/[.:]/);
    const total = Math.max(0, (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0));
    const elapsed = ctx.clock ? Math.floor((ctx.clock.atMs - ctx.clock.startMs) / 1000) : 0;
    const left = Math.max(0, total - elapsed);
    // mm ss as one number, so the digit places line up with the sign's own: 90 seconds is 130.
    return [...digitStatesFor(Math.floor(left / 60) * 100 + (left % 60)), "Colon"];
  }

  const start = Math.max(0, parseInt(from.trim(), 10) || 0);
  // +1 so every value including zero gets an equal share of the effect, rather than zero being
  // the single instant at the very end.
  const step = Math.floor(ctx.positionInEffect01 * (start + 1));
  return digitStatesFor(Math.max(0, start - step));
}

/** The leading digit of a numeric state name, or null for a word like "wink". */
function leadingDigit(name: string): number | null {
  const first = name.trim()[0];
  if (!first || first < "0" || first > "9") return null;
  return Number(first);
}

function colorForState(
  name: string,
  entries: readonly StateEntry[],
  params: StateParams,
  palette: RGBA[],
  ctx: FrameContext,
  cellIndex: number,
): RGBA {
  // "Force Custom Colors" beats every colour mode - it is the per-state override the dialog's
  // Color column writes.
  const forced = findState(entries, name)?.color;
  if (forced) return hexToRgba(forced);
  if (palette.length === 0) return rgba(255, 255, 255);

  switch (params.colorMode) {
    case "Graduate":
      // "will start from the first color selected and then transition to the next color"
      return multiColorBlend(palette, ctx.positionInEffect01);
    case "Cycle":
      // "will change color at the end of each timing mark"
      return palette[cellIndex % palette.length]!;
    case "Allocate": {
      // "will allocate a color to each state... the allocation depends on how many colors you
      // have selected and how many states are defined"
      const index = stateIndex(entries, name);
      return palette[(index < 0 ? 0 : index) % palette.length]!;
    }
    case "Number": {
      // "used (for number states), to turn the matching number on to that color"
      const digit = leadingDigit(name);
      return palette[(digit ?? 0) % palette.length]!;
    }
    default:
      return palette[0]!;
  }
}

export function renderState(buffer: RenderBuffer, palette: RGBA[], params: StateParams, ctx: FrameContext): void {
  const entries = ctx.data?.states ?? [];
  const nodes = ctx.nodes;
  if (entries.length === 0 || !nodes || nodes.length === 0) return;

  const { names, cellIndex } = activeStates(params, ctx);
  for (const name of names) {
    const color = colorForState(name, entries, params, palette, ctx, cellIndex);
    for (const index of nodesForState(entries, name)) {
      const node = nodes[index];
      if (!node) continue; // a range naming nodes the model doesn't have: skip, don't throw
      buffer.setPixel(node.bufX, node.bufY, color);
    }
  }
}
