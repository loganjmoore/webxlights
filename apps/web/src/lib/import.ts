import { parseRgbEffectsXml } from "@webxlights/formats";
import {
  appliedPlacementFor,
  chooseBoxedScaleReading,
  computeGeometryFromAttrs,
  negativeScaleAttrs,
  screenFromAttrs,
  type BoxedScaleChoice,
  type ModelGeometry,
} from "@webxlights/engine";
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
  subModels: number;
  /** How many state definitions came across, so an import can say whether it found any. */
  states: number;
  faces: number;
  // Which reading of ScaleX the boxed models were placed with, and what it was decided from.
  boxedScale: BoxedScaleChoice;
  // How many models stored a negative scale. The importer reads those as magnitudes, because in
  // xLights a negative scale is how a model whose local Y runs the other way is drawn upright,
  // not a mirror - taking it literally stood trees on their points. Reported because it is a
  // real decision about someone's show: a file where this is 0 but models still import upside
  // down is saying the cause is something else.
  negativeScales: number;
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

  // How to read a boxed model's ScaleX isn't knowable in the abstract, but it is knowable for
  // this file - see engine/models/boxedScale.ts. Decided once, up front, so every model in the
  // show is placed by the same rule.
  const boxedScale = chooseBoxedScaleReading(
    parsed.models.filter((m) => m.supported).map((m) => ({ displayAs: m.displayAs, attrs: m.attrs })),
    NODE_SPACING,
  );

  const models: ModelUpsertPayload[] = parsed.models.map((m, i) => ({
    name: m.name,
    type: m.displayAs,
    supported: m.supported,
    raw_attrs: m.attrs,
    screen: {
      ...screenFromAttrs(m.displayAs, m.attrs, geometryOf(m.displayAs, m.attrs, m.supported), NODE_SPACING, boxedScale.reading),
    },
    strings: m.attrs.NumStrings ? parseInt(m.attrs.NumStrings, 10) : null,
    nodes_per_string: m.attrs.NodesPerString ? parseInt(m.attrs.NodesPerString, 10) : null,
    // Sub-models are nested elements rather than attributes, so they arrive alongside the
    // attribute bag instead of inside it (formats/rgbeffects.ts).
    sub_models: m.subModels,
    // State definitions arrive the same way and for the same reason.
    states: m.states,
    // Face definitions arrive the same way. The parser has already dropped Matrix ones, which
    // hold image paths rather than node ranges.
    faces: m.faces.map((f) => ({
      name: f.name,
      kind: f.kind,
      mouths: f.mouths,
      // A matrix face arrives as a shell: the mouth positions it had, with no pictures, because
      // the file names paths on the machine that made the show.
      ...(f.kind === "matrix" ? { images: f.imageNames.map((name) => ({ name })), placement: "Centered" as const } : {}),
      eyesOpen: f.parts["Eyes-Open"],
      eyesClosed: f.parts["Eyes-Closed"],
      eyesOpen2: f.parts["Eyes-Open2"],
      eyesClosed2: f.parts["Eyes-Closed2"],
      eyesOpen3: f.parts["Eyes-Open3"],
      eyesClosed3: f.parts["Eyes-Closed3"],
      outline: f.parts.Outline,
      outline2: f.parts.Outline2,
    })),
    string_type: m.attrs.StringType ?? null,
    start_channel: m.attrs.StartChannel ?? null,
    order: i,
  }));

  const placement = { boxed: 0, twoPoint: 0, threePoint: 0, polyLine: 0 };
  let negativeScales = 0;
  for (const m of parsed.models) {
    if (negativeScaleAttrs(m.attrs).length > 0) negativeScales++;
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

  const subModels = parsed.models.reduce((n, m) => n + m.subModels.length, 0);
  const states = parsed.models.reduce((n, m) => n + m.states.length, 0);
  const faces = parsed.models.reduce((n, m) => n + m.faces.length, 0);
  return { imported: models.length, unsupported: parsed.unsupportedTypes, groups: groups.length, placement, boxedScale, negativeScales, subModels, states, faces };
}
