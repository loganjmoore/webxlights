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

export interface ParsedRgbEffects {
  models: ParsedModel[];
  groups: ParsedModelGroup[];
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
    const displayAs = m.DisplayAs ?? "";
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

  return { models, groups, unsupportedTypes: [...unsupported] };
}
