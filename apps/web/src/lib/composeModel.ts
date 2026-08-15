import { applyGroupBase, computeSubModel, strandSpecs, type ModelGeometry, type RGBA, type RenderableEffect, type SubModelSpec } from "@webxlights/engine";

// How one model's lights are arrived at, from everything that has something to say about them.
//
// Four things can address the same node, and the order they are applied in *is* the feature:
//
//   group  - the least specific statement, what a whole set of props is doing
//   model  - the prop's own rows, on top of that
//   strand - "the strands blend onto the model level effects"
//   sub-model - on top of everything, being the thing somebody drew deliberately
//
// This lived inline in HousePreview.vue, which meant the screen's copy of these rules could not be
// tested at all: nothing in the suite mounts a Vue component. The .fseq export has its own copy
// and is tested. Two implementations of one rule, one of them unobserved, is the exact shape of
// the failure this codebase guards hardest against - a show that looks right on screen and plays
// wrong in the yard, discovered when it is dark outside.
//
// Rendering is a callback rather than a dependency, so the order and the writeback can be checked
// without an engine, a canvas or a clock. What is being asserted is not what an effect looks like;
// it is which of four sources wins on a given node.

/** Renders a set of effects onto a geometry. The real one is the engine's; tests pass a fake. */
export type RenderRow = (geometry: ModelGeometry, effects: RenderableEffect[]) => RGBA[];

export interface ComposeInput {
  geometry: ModelGeometry;
  /** The model's own rows. */
  own: RenderableEffect[];
  /** Effects on each strand, by strand name. Absent or empty means that strand draws nothing. */
  strands?: Map<string, RenderableEffect[]>;
  /** The model's sub-models, with the effects on each. */
  subModels?: { spec: SubModelSpec; effects: RenderableEffect[] }[];
  /** What the model's groups are doing, already scattered onto this model's nodes. */
  groupBase?: RGBA[];
  /** xLights' "Allow Blending Between Models" (Sequence Settings). */
  blendGroup?: boolean;
  render: RenderRow;
}

/**
 * The colour of every node of one model.
 *
 * A borrowed set of lights - a strand or a sub-model - writes back only where it actually drew:
 * a transparent pixel means "nothing to say here", not "turn this off", so the layer underneath
 * shows through rather than being cleared by something that rendered nothing.
 */
export function composeModel(input: ComposeInput): RGBA[] {
  const nodeColors = input.render(input.geometry, input.own);

  applyGroupBase(nodeColors, input.groupBase, input.blendGroup === true);

  // Strands before sub-models. Both borrow the parent's lights; the sub-model is the more
  // deliberate statement, so it goes on last.
  for (const spec of strandSpecs(input.geometry)) {
    const effects = input.strands?.get(spec.name) ?? [];
    if (effects.length === 0) continue;
    writeBack(nodeColors, input.geometry, spec, effects, input.render);
  }

  for (const { spec, effects } of input.subModels ?? []) {
    if (effects.length === 0) continue;
    writeBack(nodeColors, input.geometry, spec, effects, input.render);
  }

  return nodeColors;
}

function writeBack(
  nodeColors: RGBA[],
  parent: ModelGeometry,
  spec: SubModelSpec,
  effects: RenderableEffect[],
  render: RenderRow,
): void {
  const resolved = computeSubModel(parent, spec);
  if (!resolved) return;
  const colors = render(resolved.geometry, effects);
  colors.forEach((color, i) => {
    const parentIndex = resolved.parentIndices[i];
    if (parentIndex !== undefined && color.a > 0) nodeColors[parentIndex] = color;
  });
}
