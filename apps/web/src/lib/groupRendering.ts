import { transformedHalfExtents, type GroupRenderSpec, type ModelGeometry } from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";
import { displayY, transformForModel } from "./modelTransform";
import { toRenderableEffects } from "./renderableEffects";
import { NODE_SPACING } from "./worldUnits";

// Turns this app's stored records into what the engine needs to render a group row.
//
// The composing, slicing and scattering all live in the engine (groupRenderStyle.ts), where they
// are under test and where the house preview and the .fseq export reach the same code. This file
// is only the adaptation: which rows belong to which group, and which model records supply the
// member geometry. Keeping the split here is what stops the preview and the export drifting into
// two different ideas of how a group is laid out.

export function groupRenderSpecs(
  groups: ModelGroupRecord[],
  geometryByModelId: Map<number, ModelGeometry>,
  body: SequenceBody,
  // Where each member stands. Without it "Per Preview" has only local coordinates to work from,
  // and every model's are centred on its own origin - so two props twenty feet apart overlap
  // completely, and each ends up showing a whole copy of the effect instead of its own part of
  // one. Optional so a caller that has no layout still gets a buffer rather than an error.
  modelsById?: Map<number, ModelRecord>,
): GroupRenderSpec[] {
  return groups.map((group) => ({
    id: group.id,
    style: group.buffer_style,
    // Member order is the group's own, which xLights treats as meaningful: it decides which prop
    // is on the left under a stacking style.
    members: group.members
      .map((m) => {
        const model = modelsById?.get(m.id);
        const geometry = geometryByModelId.get(m.id);
        return { modelId: m.id, geometry, placement: model && geometry ? placementFor(model, geometry) : undefined };
      })
      .flatMap((m) => (m.geometry ? [{ ...m, geometry: m.geometry }] : [])),
    // A group has no state definitions of its own - states are defined on a model - so a group
    // row gets the timing tracks and nothing else.
    effects: toRenderableEffects(
      body.rows.filter((r) => r.elementType === "group" && r.elementId === group.id).flatMap((r) => r.effects),
      { timingTracks: body.timingTracks },
    ),
  }));
}

/**
 * Where a member stands, in the coordinates the views actually draw it at.
 *
 * This has to be the *drawn* position rather than the stored one, and the two are not always the
 * same: a tree's stored Y is wherever the file put its centre, but every view plants it on the
 * lawn instead (modelTransform.ts). A group buffer built from stored positions would lay an
 * effect out across a yard whose trees are somewhere other than where they appear.
 */
function placementFor(model: ModelRecord, geometry: ModelGeometry): NonNullable<GroupRenderSpec["members"][number]["placement"]> {
  const transform = transformForModel(model);
  const halfHeightWorld = transformedHalfExtents(geometry, transform).halfH * NODE_SPACING;
  return {
    x: model.screen.x ?? 0,
    y: displayY(model, halfHeightWorld, 0, true),
    transform,
    unitScale: NODE_SPACING,
  };
}
