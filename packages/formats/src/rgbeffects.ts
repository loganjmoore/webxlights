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
};

/**
 * The family a `DisplayAs` belongs to, so downstream switches can stay on the plain names.
 *
 * Trees are matched by prefix rather than by a list of three. xLights: "Handle legacy compound
 * tree values: 'Tree 360', 'Tree Flat', 'Tree Ribbon', etc." - the suffix is open-ended, since it
 * carries the tree's degrees, so a spelled-out list silently drops every angle nobody thought to
 * write down. "Tree 270" and "Tree 180" were both being imported as unsupported.
 *
 * What is normalised away here - which kind of matrix, how many degrees of tree - is recoverable
 * from `attrs.DisplayAs`, which keeps xLights' own string verbatim.
 */
function displayAsFamily(raw: string): string {
  if (LEGACY_DISPLAY_AS[raw]) return LEGACY_DISPLAY_AS[raw];
  if (raw.startsWith("Tree ") && raw.length > 5) return "Tree";
  return raw;
}

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

// A named set of a model's nodes that the State effect turns on by name - "wink", "eyesleft",
// the digits of a seven segment sign. Stored as <stateInfo> elements inside <model>, so the
// attribute bag never carried them either.
export interface ParsedStateDefinition {
  name: string;
  entries: { name: string; nodes: string; color?: string }[];
}

// A face definition: which nodes are the mouth in each position, and which are the eyes and
// outline. Stored as <faceInfo> inside <model>, like sub-models and states.
export interface ParsedFaceDefinition {
  name: string;
  /** "matrix" definitions name image *files*, which can't come across; their mouths arrive empty. */
  kind: "nodes" | "matrix";
  /** Phoneme -> node ranges. Empty for a matrix definition. */
  mouths: { name: string; nodes: string; color?: string }[];
  /** Phoneme names only, for a matrix definition - the pictures have to be picked again here. */
  imageNames: string[];
  parts: Record<string, string>;
}

export interface ParsedModel {
  name: string;
  displayAs: string;
  supported: boolean;
  subModels: ParsedSubModel[];
  states: ParsedStateDefinition[];
  faces: ParsedFaceDefinition[];
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

// xLights numbers a state definition's entries: sN-Name is the word the timing track says, sN
// is that state's node ranges, and sN-Color is the forced colour if "Force Custom Colors" was on.
//
// Anything shaped differently yields no entries rather than a guess - a wrongly-read state lights
// the wrong nodes on the night, which is worse than a definition the editor shows as empty.
function parseStates(model: Record<string, unknown>): ParsedStateDefinition[] {
  const raw = asArray<Record<string, string>>(model.stateInfo as never);
  const out: ParsedStateDefinition[] = [];
  for (const info of raw) {
    if (!info || typeof info !== "object") continue;
    const numbered: { index: number; entry: ParsedStateDefinition["entries"][number] }[] = [];
    for (const [key, value] of Object.entries(info)) {
      const match = /^s(\d+)-Name$/.exec(key);
      if (!match || value === undefined || value === null || `${value}` === "") continue;
      const nodes = info[`s${match[1]}`];
      if (nodes === undefined || `${nodes}` === "") continue; // a named state with no nodes turns nothing on
      const color = info[`s${match[1]}-Color`];
      numbered.push({
        index: Number(match[1]),
        entry: { name: `${value}`, nodes: `${nodes}`, ...(color ? { color: `${color}` } : {}) },
      });
    }
    // Ordered by the number xLights gave each state, not by the order the attributes happen to
    // be written in: the State effect's "Allocate" colour mode hands out colours by that order.
    numbered.sort((a, b) => a.index - b.index);
    const entries = numbered.map((n) => n.entry);
    if (entries.length === 0) continue;
    out.push({ name: info.Name ?? info.name ?? "", entries });
  }
  return out;
}

// xLights writes a face definition's mouths as `mouth-<PHONEME>` attributes and its other parts
// as `Eyes-Open`, `Eyes-Closed`, `Outline` and their numbered variants.
//
// A *Matrix* definition's values are image file paths on the machine that made the show. They
// can't be read as node ranges - that would light arbitrary nodes instead of failing - and they
// can't be fetched. What does come across is the definition itself: its name, its placement and
// which mouth positions it had, so the editor shows the rows waiting for their pictures rather
// than losing that a singing face existed at all.
const FACE_PART_KEYS = [
  "Eyes-Open",
  "Eyes-Closed",
  "Eyes-Open2",
  "Eyes-Closed2",
  "Eyes-Open3",
  "Eyes-Closed3",
  "Outline",
  "Outline2",
];

function parseFaces(model: Record<string, unknown>): ParsedFaceDefinition[] {
  const raw = asArray<Record<string, string>>(model.faceInfo as never);
  const out: ParsedFaceDefinition[] = [];
  for (const info of raw) {
    if (!info || typeof info !== "object") continue;
    const isMatrix = `${info.Type ?? info.type ?? ""}`.toLowerCase().includes("matrix");

    const mouths: ParsedFaceDefinition["mouths"] = [];
    const imageNames: string[] = [];
    for (const [key, value] of Object.entries(info)) {
      const match = /^mouth-(.+?)(-Color)?$/.exec(key);
      if (!match || match[2] || value === undefined || `${value}` === "") continue;
      if (isMatrix) {
        imageNames.push(match[1]!);
        continue;
      }
      const color = info[`mouth-${match[1]}-Color`];
      mouths.push({ name: match[1]!, nodes: `${value}`, ...(color ? { color: `${color}` } : {}) });
    }

    const parts: Record<string, string> = {};
    if (!isMatrix) {
      for (const key of FACE_PART_KEYS) {
        const value = info[key];
        if (value !== undefined && `${value}` !== "") parts[key] = `${value}`;
      }
    }

    if (mouths.length === 0 && imageNames.length === 0 && Object.keys(parts).length === 0) continue;
    out.push({
      name: info.Name ?? info.name ?? "",
      kind: isMatrix ? "matrix" : "nodes",
      mouths,
      imageNames,
      parts,
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
    const displayAs = displayAsFamily(rawDisplayAs);
    const supported = (SUPPORTED_DISPLAY_AS as readonly string[]).includes(displayAs);
    if (!supported) unsupported.add(displayAs);
    models.push({
      name: m.name ?? "",
      displayAs,
      supported,
      subModels: parseSubModels(m),
      states: parseStates(m),
      faces: parseFaces(m),
      attrs: m,
    });
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
