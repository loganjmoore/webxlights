import { parseRgbEffectsXml } from "@webxlights/formats";
import { api, type GroupUpsertPayload, type ModelUpsertPayload, type ViewObjectUpsertPayload } from "./api";

export interface ImportSummary {
  imported: number;
  unsupported: string[];
  groups: number;
}

// SPEC ch11 §2.1: WorldPosX/Y/Z is written for every model regardless of screen-location
// system (Boxed/2pt/3pt/Poly/Multi) as the model's *center* point, with RotateZ pivoting
// around that same center (confirmed against the xLights manual/community docs). ScaleX/
// ScaleY/RotateZ are now actually rendered (LayoutCanvas.vue/LayoutCanvas3D.vue via
// packages/engine's nodeWorldOffset), not just parsed and stored inertly - M13 shipped the
// toolbar/palette but not this; M14 is the fidelity pass this comment used to defer to.
// Per-type shear (Angle/Shear/Height for the 3-point line placement system, X2/Y2 endpoints
// for 2-point) is still not applied - those are placement-system-specific attributes on top
// of the universal Pos/Scale/RotateZ trio every model has, a real remaining gap, not silent
// (see DECISIONS.md).
function extractScreenPosition(attrs: Record<string, string>) {
  return {
    x: attrs.WorldPosX ? parseFloat(attrs.WorldPosX) : 0,
    y: attrs.WorldPosY ? parseFloat(attrs.WorldPosY) : 0,
    z: attrs.WorldPosZ ? parseFloat(attrs.WorldPosZ) : 0,
    scale: attrs.ScaleX ? parseFloat(attrs.ScaleX) : 1,
    scaleY: attrs.ScaleY ? parseFloat(attrs.ScaleY) : undefined,
    rotate: attrs.RotateZ ? parseFloat(attrs.RotateZ) : 0,
  };
}

export async function importRgbEffects(layoutId: number, xmlText: string): Promise<ImportSummary> {
  const parsed = parseRgbEffectsXml(xmlText);

  const models: ModelUpsertPayload[] = parsed.models.map((m, i) => ({
    name: m.name,
    type: m.displayAs,
    supported: m.supported,
    raw_attrs: m.attrs,
    screen: extractScreenPosition(m.attrs),
    strings: m.attrs.NumStrings ? parseInt(m.attrs.NumStrings, 10) : null,
    nodes_per_string: m.attrs.NodesPerString ? parseInt(m.attrs.NodesPerString, 10) : null,
    string_type: m.attrs.StringType ?? null,
    start_channel: m.attrs.StartChannel ?? null,
    order: i,
  }));

  await api.bulkUpsertModels(layoutId, models);

  const groups: GroupUpsertPayload[] = parsed.groups
    .filter((g) => g.members.length > 0)
    .map((g) => ({ name: g.name, bufferStyle: g.layout, memberNames: g.members }));
  if (groups.length > 0) await api.bulkUpsertModelGroups(layoutId, groups);

  const viewObjects: ViewObjectUpsertPayload[] = parsed.viewObjects.map((o) => ({
    name: o.name,
    type: o.displayAs,
    supported: o.supported,
    raw_attrs: o.attrs,
  }));
  if (viewObjects.length > 0) await api.bulkUpsertViewObjects(layoutId, viewObjects);

  return { imported: models.length, unsupported: parsed.unsupportedTypes, groups: groups.length };
}
