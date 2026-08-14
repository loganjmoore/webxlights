import { XMLParser } from "fast-xml-parser";

// SPEC ch11 §2: xlights_rgbeffects.xml. Model DisplayAs values webXLights can render.
// Everything else imports as `unsupported` so nothing is silently lost.
export const SUPPORTED_DISPLAY_AS = [
  "Matrix",
  "Single Line",
  "Poly Line",
  "Arches",
  "Candy Canes",
  "Circle",
  "Star",
  "Tree",
  "Icicles",
  "Window Frame",
  "Wreath",
  "Custom",
  "Spinner",
  "Cube",
  "Sphere",
  "Channel Block",
  "Image",
] as const;

// xLights writes these legacy DisplayAs strings for style variants of Matrix/Tree and
// normalizes them on load (src: DisplayAsType.h legacy mapping) - a real show export
// uses "Tree 360" far more often than the bare "Tree" string. Without this map those
// models were silently downgraded to unsupported placeholders.
const LEGACY_DISPLAY_AS: Record<string, string> = {
  "Vert Matrix": "Matrix",
  "Horiz Matrix": "Matrix",
  "Tree 360": "Tree",
  "Tree Flat": "Tree",
  "Tree Ribbon": "Tree",
};

// A named subset of a model's nodes, addressable in the sequencer as its own row. xLights
// stores these as <subModel> elements nested inside <model>, not as attributes, which is why
// the lossless raw-attribute bag never carried them.
export interface ParsedSubModel {
  name: string;
  /** "ranges" (per-row node ranges) or "subbuffer" (a rectangle of the parent's buffer). */
  type: "ranges" | "subbuffer";
  /** One entry per sub-model row, each a comma-separated node-range list like "1-5,9,12-14". */
  rows: string[];
  /** For a sub-buffer sub-model: "x1,y1,x2,y2" as percentages of the parent buffer. */
  subBuffer?: string;
  /** Whether the rows run vertically, which flips the sub-model's own buffer. */
  vertical: boolean;
}

export interface ParsedModel {
  name: string;
  displayAs: string;
  supported: boolean;
  subModels: ParsedSubModel[];
  // Every XML attribute verbatim (typed-prefix attribute bag, matches xLights' own
  // SettingsMap approach and the jsonb `params` column it maps to).
  attrs: Record<string, string>;
}

export interface ParsedModelGroup {
  name: string;
  members: string[]; // member model/submodel names, comma-separated in the XML
  layout: string | undefined;
}

// SPEC ch11 §2: a separate <view_objects><view_object> element, not a <model> - previously
// not parsed at all (Gridlines/Mesh/Terrain/Ruler/Image/Controller helpers were silently
// dropped on import). Only "Gridlines" renders today (packages/engine has no OBJ-mesh loader
// or terrain heightmap support); everything else imports supported:false, same "kept, not
// silently lost" convention as unsupported models.
export const SUPPORTED_VIEW_OBJECT_TYPES = ["Gridlines"] as const;

export interface ParsedViewObject {
  name: string;
  displayAs: string;
  supported: boolean;
  attrs: Record<string, string>;
}

export interface ParsedRgbEffects {
  models: ParsedModel[];
  groups: ParsedModelGroup[];
  viewObjects: ParsedViewObject[];
  unsupportedTypes: string[]; // distinct DisplayAs values that were skipped
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// xLights writes a sub-model's rows as numbered attributes - line0, line1, ... - each holding a
// node-range list. A sub-model with no lines at all is skipped rather than imported as an empty
// row that would render nothing and clutter the sequencer.
function parseSubModels(model: Record<string, unknown>): ParsedSubModel[] {
  const raw = asArray<Record<string, string>>(model.subModel as never);
  const out: ParsedSubModel[] = [];
  for (const sm of raw) {
    if (!sm || typeof sm !== "object") continue;
    const rows: string[] = [];
    for (let i = 0; ; i++) {
      const line = sm[`line${i}`];
      if (line === undefined) break;
      rows.push(line);
    }
    const subBuffer = sm.subBuffer;
    const type = sm.type === "subbuffer" || (rows.length === 0 && subBuffer) ? "subbuffer" : "ranges";
    if (type === "ranges" && rows.every((r) => r.trim() === "")) continue;
    out.push({
      name: sm.name ?? "",
      type,
      rows,
      subBuffer,
      vertical: sm.layout === "vertical" || sm.vertical === "1" || sm.vertical === "true",
    });
  }
  return out;
}

export function parseRgbEffectsXml(xml: string): ParsedRgbEffects {
  const doc = parser.parse(xml);
  const root = doc.xrgb;
  if (!root) throw new Error("Not an xlights_rgbeffects.xml file: missing <xrgb> root");

  const rawModels = asArray<Record<string, string>>(root.models?.model);
  const models: ParsedModel[] = [];
  const unsupported = new Set<string>();

  for (const m of rawModels) {
    const rawDisplayAs = m.DisplayAs ?? "";
    const displayAs = LEGACY_DISPLAY_AS[rawDisplayAs] ?? rawDisplayAs;
    const supported = (SUPPORTED_DISPLAY_AS as readonly string[]).includes(displayAs);
    if (!supported) unsupported.add(displayAs);
    models.push({ name: m.name ?? "", displayAs, supported, subModels: parseSubModels(m), attrs: m });
  }

  const rawGroups = asArray<Record<string, string>>(root.modelGroups?.modelGroup);
  const groups: ParsedModelGroup[] = rawGroups.map((g) => ({
    name: g.name ?? "",
    members: (g.models ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    layout: g.layout,
  }));

  const rawViewObjects = asArray<Record<string, string>>(root.view_objects?.view_object);
  const viewObjects: ParsedViewObject[] = rawViewObjects.map((o) => {
    const displayAs = o.DisplayAs ?? "";
    const supported = (SUPPORTED_VIEW_OBJECT_TYPES as readonly string[]).includes(displayAs);
    if (!supported) unsupported.add(displayAs);
    return { name: o.name ?? "", displayAs, supported, attrs: o };
  });

  return { models, groups, viewObjects, unsupportedTypes: [...unsupported] };
}
