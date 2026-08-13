import { parseRgbEffectsXml } from "@webxlights/formats";
import { appliedPlacementFor, computeGeometryFromAttrs, screenFromAttrs, type ModelGeometry } from "@webxlights/engine";
import { api, type GroupUpsertPayload, type ModelUpsertPayload, type ViewObjectUpsertPayload } from "./api";

// The canvases' local-unit-to-world factor (LayoutCanvas/LayoutCanvas3D's NODE_SPACING).
// Placement needs it to turn xLights' world-unit endpoint vectors into our local-unit scales.
const NODE_SPACING = 4;

function geometryOf(displayAs: string, attrs: Record<string, string>, supported: boolean): ModelGeometry | null {
  if (!supported) return null;
  try {
    return computeGeometryFromAttrs(displayAs, attrs);
  } catch {
    return null;
  }
}

export interface ImportSummary {
  imported: number;
  unsupported: string[];
  groups: number;
  // How many models each of xLights' placement systems actually accounted for. Surfaced in the
  // import banner because it's the one thing that says, against a real show, whether the
  // two/three-point path fired at all - a yard full of arches and rooflines reporting zero
  // two/three-point models means those attributes aren't named what we expect in that file.
  placement: { boxed: number; twoPoint: number; threePoint: number; polyLine: number };
}

// SPEC ch11 §2.1. Which attributes mean what depends on the model's placement system, which
// differs per DisplayAs - see packages/engine/src/models/placement.ts. Boxed models really do
// store WorldPos as a centre with ScaleX/RotateZ; two- and three-point models store one
// endpoint plus an X2/Y2/Z2 offset to the other, and their size and angle come from that
// vector. Reading every model as boxed (what this did before) put every arch, candy cane,
// roofline and icicle run half its own length off-position, at default size and unrotated.
//
// Poly Line goes further still: its PointData vertex list is the model's shape, so it decides
// the geometry as well as the position.
//
// Still not applied: cPointData's curved Poly Line segments and the three-point Shear/Angle
// attributes - real remaining gaps, recorded in PARITY.md, not silently mis-placed.

export async function importRgbEffects(layoutId: number, xmlText: string): Promise<ImportSummary> {
  const parsed = parseRgbEffectsXml(xmlText);

  const models: ModelUpsertPayload[] = parsed.models.map((m, i) => ({
    name: m.name,
    type: m.displayAs,
    supported: m.supported,
    raw_attrs: m.attrs,
    screen: { ...screenFromAttrs(m.displayAs, m.attrs, geometryOf(m.displayAs, m.attrs, m.supported), NODE_SPACING) },
    strings: m.attrs.NumStrings ? parseInt(m.attrs.NumStrings, 10) : null,
    nodes_per_string: m.attrs.NodesPerString ? parseInt(m.attrs.NodesPerString, 10) : null,
    string_type: m.attrs.StringType ?? null,
    start_channel: m.attrs.StartChannel ?? null,
    order: i,
  }));

  const placement = { boxed: 0, twoPoint: 0, threePoint: 0, polyLine: 0 };
  for (const m of parsed.models) {
    const applied = appliedPlacementFor(m.displayAs, m.attrs);
    if (applied === "twoPoint") placement.twoPoint++;
    else if (applied === "threePoint") placement.threePoint++;
    else if (applied === "polyLine") placement.polyLine++;
    else placement.boxed++;
  }

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

  return { imported: models.length, unsupported: parsed.unsupportedTypes, groups: groups.length, placement };
}
