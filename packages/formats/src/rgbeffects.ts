import { XMLParser } from "fast-xml-parser";

// SPEC ch11 §2: xlights_rgbeffects.xml. Model DisplayAs values webXLights can render (M1
// scope, per the goal prompt's 12-type list). Everything else imports as `unsupported`
// so nothing is silently lost.
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

export interface ParsedModel {
  name: string;
  displayAs: string;
  supported: boolean;
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
    models.push({ name: m.name ?? "", displayAs, supported, attrs: m });
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
