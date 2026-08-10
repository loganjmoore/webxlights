import { parseRgbEffectsXml } from "@webxlights/formats";
import { api, type GroupUpsertPayload, type ModelUpsertPayload } from "./api";

export interface ImportSummary {
  imported: number;
  unsupported: string[];
  groups: number;
}

// SPEC ch11 §2.1: WorldPosX/Y/Z is written for every model regardless of screen-location
// system (Boxed/2pt/3pt/Poly/Multi). Using it alone (plus ScaleX for Boxed types) gives
// correct *relative* placement between models on first import; per-type rotation/shear
// (Angle/Shear/Height for 3pt, X2/Y2 endpoints for 2pt) is a later fidelity pass.
function extractScreenPosition(attrs: Record<string, string>) {
  return {
    x: attrs.WorldPosX ? parseFloat(attrs.WorldPosX) : 0,
    y: attrs.WorldPosY ? parseFloat(attrs.WorldPosY) : 0,
    scale: attrs.ScaleX ? parseFloat(attrs.ScaleX) : 1,
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

  return { imported: models.length, unsupported: parsed.unsupportedTypes, groups: groups.length };
}
