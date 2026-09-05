import type { ModelRecord } from "./api";

// Chaining models on a controller, the way xLights' visualiser does it: a controller's models
// sit in a row, and each one starts on the channel after the previous one ends. Drag a model
// onto a controller and it joins the end of the chain; drop it between two others and everything
// after it shuffles along. The arithmetic lives here so it can be tested without a page.

export interface ChainPatch {
  modelId: number;
  controller_id: number | null;
  controller_offset: number | null;
  channel_count: number | null;
}

/** The models on a controller, in channel order. */
export function chainOn(models: readonly ModelRecord[], controllerId: number): ModelRecord[] {
  return models
    .filter((m) => m.controller_id === controllerId && m.controller_offset != null)
    .sort((a, b) => (a.controller_offset ?? 0) - (b.controller_offset ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Packs a chain from channel 0 with no gaps, and says which models actually changed.
 *
 * Only the ones that moved are returned, so a drop that lands a model back where it was costs
 * no writes at all.
 */
function repack(chain: readonly ModelRecord[], controllerId: number, channelCountFor: (m: ModelRecord) => number): ChainPatch[] {
  const patches: ChainPatch[] = [];
  let offset = 0;
  for (const model of chain) {
    const count = Math.max(1, model.channel_count ?? channelCountFor(model));
    if (model.controller_id !== controllerId || model.controller_offset !== offset || model.channel_count !== count) {
      patches.push({ modelId: model.id, controller_id: controllerId, controller_offset: offset, channel_count: count });
    }
    offset += count;
  }
  return patches;
}

/**
 * Puts a model into a controller's chain at `index` (the end when omitted or past the end),
 * moving it off whichever controller it was on, and re-chains both.
 */
export function placeInChain(
  models: readonly ModelRecord[],
  modelId: number,
  controllerId: number,
  index: number | undefined,
  channelCountFor: (m: ModelRecord) => number,
): ChainPatch[] {
  const model = models.find((m) => m.id === modelId);
  if (!model) return [];
  const from = model.controller_id;
  const target = chainOn(models, controllerId).filter((m) => m.id !== modelId);
  const at = index === undefined ? target.length : Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, model);
  const patches = repack(target, controllerId, channelCountFor);
  // The chain it left closes its gap, if it left one.
  if (from != null && from !== controllerId) {
    patches.push(...repack(chainOn(models, from).filter((m) => m.id !== modelId), from, channelCountFor));
  }
  return patches;
}

/** Takes a model off its controller and closes the gap it leaves. */
export function removeFromChain(models: readonly ModelRecord[], modelId: number, channelCountFor: (m: ModelRecord) => number): ChainPatch[] {
  const model = models.find((m) => m.id === modelId);
  if (!model || model.controller_id == null) return [];
  const from = model.controller_id;
  return [
    { modelId, controller_id: null, controller_offset: null, channel_count: null },
    ...repack(chainOn(models, from).filter((m) => m.id !== modelId), from, channelCountFor),
  ];
}

/** The models as they will be once the patches are applied - so the page can show the result at once. */
export function applyChainPatches(models: readonly ModelRecord[], patches: readonly ChainPatch[]): ModelRecord[] {
  const byId = new Map(patches.map((p) => [p.modelId, p]));
  return models.map((m) => {
    const p = byId.get(m.id);
    return p ? { ...m, controller_id: p.controller_id, controller_offset: p.controller_offset, channel_count: p.channel_count } : m;
  });
}
