import type { GroupRenderSpec, ModelGeometry } from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "./api";
import { transformForModel } from "./modelTransform";
import { toRenderableEffects } from "./renderableEffects";

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
        return {
          modelId: m.id,
          geometry: geometryByModelId.get(m.id),
          placement: model
            ? { x: model.screen.x ?? 0, y: model.screen.y ?? 0, transform: transformForModel(model) }
            : undefined,
        };
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
