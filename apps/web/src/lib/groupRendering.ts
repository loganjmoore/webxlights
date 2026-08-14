import { toRenderPalette, type GroupRenderSpec, type ModelGeometry } from "@webxlights/engine";
import type { ModelGroupRecord, SequenceBody } from "./api";

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
): GroupRenderSpec[] {
  return groups.map((group) => ({
    id: group.id,
    style: group.buffer_style,
    // Member order is the group's own, which xLights treats as meaningful: it decides which prop
    // is on the left under a stacking style.
    members: group.members
      .map((m) => ({ modelId: m.id, geometry: geometryByModelId.get(m.id) }))
      .filter((m): m is { modelId: number; geometry: ModelGeometry } => !!m.geometry),
    effects: body.rows
      .filter((r) => r.elementType === "group" && r.elementId === group.id)
      .flatMap((r) => r.effects)
      .map((e) => ({ ...e, palette: toRenderPalette(e.palette) })),
  }));
}
