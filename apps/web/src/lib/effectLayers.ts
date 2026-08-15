import type { SequenceEffect } from "./api";

// Effect layers on a model row (manual: Sequencer > Layers).
//
// "Each model may have a up to 200 layers of effects." / "Each layer can be blended with the layer
// below it for a combination of thousands possibilities within a single timing cell." / "To add
// layers to a model right click the model in the sequencer tab and choose Add Layer above or below
// (the current layer)." / "Collapse Layers" "collapses the expanded effect layers back down to a
// single row."
//
// The engine has blended simultaneous effects since the beginning, and the blend modes and the Mix
// slider have been implemented and correct that whole time - against data nothing in the interface
// could create, because the grid refuses to place one effect on top of another. This is the half
// that was missing.
//
// A layer is a number on the effect rather than a row of its own. Layers are a property of the
// effects, not a container holding them: an effect moved between layers is the same effect, and a
// layer with nothing on it is a row to draw, not a thing to store.

/** The manual's own cap. */
export const MAX_LAYERS = 200;

export function layerOf(effect: Pick<SequenceEffect, "layerIndex">): number {
  return effect.layerIndex ?? 0;
}

/**
 * How many layers a row shows.
 *
 * Always at least one, and always enough to show the highest layer in use. A row whose only effect
 * sits on layer 3 still shows layers 0 to 3, because the gap is real - those layers exist and are
 * empty, and hiding them would renumber everything the moment one was filled.
 */
export function layerCount(effects: readonly SequenceEffect[]): number {
  return effects.reduce((max, e) => Math.max(max, layerOf(e) + 1), 1);
}

/** The effects on one layer. */
export function effectsOnLayer(effects: readonly SequenceEffect[], layerIndex: number): SequenceEffect[] {
  return effects.filter((e) => layerOf(e) === layerIndex);
}

export interface LayerEdit {
  /** The effects that changed layer, and what to. */
  moves: { id: string; layerIndex: number }[];
  /** Where the new layer landed, so the caller can select or scroll to it. */
  newLayerIndex: number;
}

/**
 * Inserts a layer above or below an existing one.
 *
 * Everything at or above the insertion point moves up one. Returns only the effects that moved, so
 * the caller can apply them in a single undo entry and so "nothing moved" is distinguishable from
 * "everything was rewritten to the same values".
 */
export function addLayer(effects: readonly SequenceEffect[], atLayer: number, side: "above" | "below"): LayerEdit {
  // "Above" in the manual means on top of the current layer, which is a higher index - the stack
  // composites bottom-up, so a higher number sits nearer the viewer.
  const insertAt = side === "above" ? atLayer + 1 : atLayer;
  const moves = effects
    .filter((e) => layerOf(e) >= insertAt)
    .map((e) => ({ id: e.id, layerIndex: layerOf(e) + 1 }));
  return { moves, newLayerIndex: insertAt };
}

/**
 * Removes a layer, moving everything above it down.
 *
 * The effects *on* that layer are deleted with it - which is why the caller has to be told which
 * they are rather than only which moved. Deleting a layer that still has effects on it silently
 * would lose work.
 */
export function removeLayer(
  effects: readonly SequenceEffect[],
  atLayer: number,
): { deleted: string[]; moves: { id: string; layerIndex: number }[] } {
  return {
    deleted: effectsOnLayer(effects, atLayer).map((e) => e.id),
    moves: effects.filter((e) => layerOf(e) > atLayer).map((e) => ({ id: e.id, layerIndex: layerOf(e) - 1 })),
  };
}

/**
 * Whether a layer can be added.
 *
 * The cap is the manual's, and it is checked rather than assumed: a row at 200 layers that
 * silently ignored the menu item would look broken rather than full.
 */
export function canAddLayer(effects: readonly SequenceEffect[]): boolean {
  return layerCount(effects) < MAX_LAYERS;
}
