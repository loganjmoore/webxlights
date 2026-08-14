import type { ModelGeometry, ModelNode } from "./types";

export interface SpinnerParams {
  strings: number;
  armsPerString: number;
  nodesPerArm: number;
  /** Percentage of the radius left empty at the centre - "the gap at the base of the model". */
  hollowPercent: number;
  /** How much of a full turn the arms are spread over. 360 is a full spinner, 180 a fan. */
  arcDegrees: number;
  /** Where the first arm points, -360..360. */
  startAngleDegrees: number;
  /** Wiring runs outwards on one arm and inwards on the next. */
  zigZag: boolean;
}

// Manual "Spinner": arms radiating from a centre - "the Arms/String represents the number of
// Spokes and the Lights/Arm represents the number of nodes on each arm".
//
// The buffer is arms x nodes-per-arm, which is what makes an effect read the way a sequencer
// expects: running across the buffer runs around the spinner, running up it runs outwards along
// every arm at once. Node *order* is separate from that and follows the wiring, which is what
// zig-zag changes.
export function computeSpinner(params: SpinnerParams): ModelGeometry {
  const strings = Math.max(1, Math.trunc(params.strings));
  const armsPerString = Math.max(1, Math.trunc(params.armsPerString));
  const perArm = Math.max(1, Math.trunc(params.nodesPerArm));
  const arms = strings * armsPerString;

  const hollow = Math.min(0.95, Math.max(0, params.hollowPercent / 100));
  const arc = params.arcDegrees === 0 ? 360 : params.arcDegrees;
  // A full turn wraps, so the last arm must not land on top of the first; a partial arc doesn't,
  // so its last arm belongs at the far end of the spread.
  const wraps = Math.abs(arc) >= 360;
  const step = wraps ? arc / arms : arms > 1 ? arc / (arms - 1) : 0;

  // The outer radius is set by the arm length, in the same node-unit convention every other
  // model type uses (units.ts): one unit is the spacing between adjacent nodes.
  const outer = perArm / Math.max(1e-6, 1 - hollow);

  const nodes: ModelNode[] = [];
  for (let a = 0; a < arms; a++) {
    const angle = ((params.startAngleDegrees + a * step) * Math.PI) / 180;
    const outwards = !params.zigZag || a % 2 === 0;
    for (let i = 0; i < perArm; i++) {
      // Buffer position is always outward-along-the-arm, whichever way the wire runs. The wiring
      // is about which node is which channel; the buffer is about where the light is.
      const along = i;
      const wired = outwards ? i : perArm - 1 - i;
      const radius = outer * (hollow + (1 - hollow) * (perArm > 1 ? wired / (perArm - 1) : 0));
      nodes.push({
        bufX: wired,
        bufY: a,
        screenX: Math.cos(angle) * radius,
        screenY: Math.sin(angle) * radius,
        string: Math.floor(a / armsPerString),
        indexInString: (a % armsPerString) * perArm + along,
      });
    }
  }

  return { width: perArm, height: arms, nodes };
}
