// Per-DisplayAs editable geometry properties, matching real xLights' Layout tab property grid.
// Deliberately scoped to exactly the raw_attrs keys computeGeometryFromAttrs (fromAttrs.ts)
// reads for that type - editing a field here always has a real, visible effect, unlike real
// xLights' fuller property grid (Rotation/Spiral Wraps/Perspective/etc. on Tree, for example),
// which this engine doesn't render and so isn't offered here (see DECISIONS.md).
export interface PropertyField {
  key: string; // raw_attrs key
  label: string;
  type: "number" | "select" | "text";
  default: number | string;
  options?: readonly string[]; // "select" only
  step?: number;
}

export const MODEL_PROPERTY_SCHEMAS: Record<string, PropertyField[]> = {
  Matrix: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 16 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
  ],
  "Single Line": [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
  ],
  "Poly Line": [{ key: "NodesPerString", label: "Total Nodes", type: "number", default: 50 }],
  Arches: [
    { key: "NumArches", label: "# Arches", type: "number", default: 1 },
    { key: "NodesPerArch", label: "Nodes/Arch", type: "number", default: 50 },
    { key: "Arc", label: "Arc (degrees)", type: "number", default: 180 },
  ],
  "Candy Canes": [
    { key: "NumCanes", label: "# Canes", type: "number", default: 3 },
    { key: "NodesPerCane", label: "Nodes/Cane", type: "number", default: 18 },
  ],
  Circle: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
    { key: "centerPercent", label: "Center %", type: "number", default: 0 },
    { key: "LayerSizes", label: "Layer Sizes (comma-separated)", type: "text", default: "" },
  ],
  Star: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
    { key: "StarPoints", label: "# Points", type: "number", default: 5 },
    { key: "starRatio", label: "Outer/Inner Ratio", type: "number", default: 2.618034, step: 0.01 },
  ],
  Tree: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 16 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
    { key: "TreeType", label: "Type", type: "select", default: "0", options: ["0", "1", "2"] },
    { key: "TreeDegrees", label: "Degrees", type: "number", default: 360 },
    { key: "TreeBottomTopRatio", label: "Bottom/Top Ratio", type: "number", default: 6.0, step: 0.5 },
  ],
  Icicles: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 80 },
    { key: "DropPattern", label: "Drop Pattern (comma-separated)", type: "text", default: "2,4,6,4" },
  ],
  "Window Frame": [
    { key: "TopNodes", label: "Top Nodes", type: "number", default: 16 },
    { key: "SideNodes", label: "Left/Right Nodes", type: "number", default: 50 },
    { key: "BottomNodes", label: "Bottom Nodes", type: "number", default: 16 },
    { key: "Rotation", label: "Direction", type: "select", default: "Clockwise", options: ["Clockwise", "Counter Clockwise"] },
  ],
  Wreath: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 50 },
  ],
  Spinner: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "ArmsPerString", label: "Arms/String", type: "number", default: 8 },
    { key: "LightsPerArm", label: "Lights/Arm", type: "number", default: 10 },
    { key: "Hollow", label: "Hollow %", type: "number", default: 20 },
    { key: "Arc", label: "Arc (degrees)", type: "number", default: 360 },
    { key: "StartAngle", label: "Start Angle", type: "number", default: 0 },
    { key: "ZigZag", label: "Zig Zag", type: "select", default: "false", options: ["false", "true"] },
  ],
  Cube: [
    { key: "Width", label: "Width", type: "number", default: 5 },
    { key: "Height", label: "Height", type: "number", default: 5 },
    { key: "Depth", label: "Depth", type: "number", default: 5 },
    { key: "Style", label: "Style", type: "select", default: "Cube", options: ["Cube", "Cylinder"] },
    { key: "NumStrings", label: "# Strings", type: "number", default: 1 },
    { key: "StrandStyle", label: "Strand Style", type: "select", default: "Zig Zag", options: ["Zig Zag", "No Zig Zag"] },
  ],
  Sphere: [
    { key: "NumStrings", label: "# Strings", type: "number", default: 16 },
    { key: "NodesPerString", label: "Nodes/String", type: "number", default: 25 },
    { key: "Degrees", label: "Degrees", type: "number", default: 360 },
    { key: "StartLatitude", label: "Southern Latitude %", type: "number", default: 0 },
    { key: "EndLatitude", label: "Northern Latitude %", type: "number", default: 0 },
  ],
  "Channel Block": [
    { key: "NumChannels", label: "# Channels", type: "number", default: 1 },
    // "What color in the sequencer will 'activate' this channel block channel." White uses all
    // three; a named colour uses only that one.
    { key: "ChannelColor", label: "Channel Color", type: "select", default: "White", options: ["White", "Red", "Green", "Blue"] },
    { key: "ChannelColors", label: "Indiv Colors (comma-separated)", type: "text", default: "" },
  ],
  // Image has no geometry to edit - the whole prop is one channel - so it has no fields rather
  // than fields that would do nothing.
};

export function propertyFieldsFor(displayAs: string): PropertyField[] {
  return MODEL_PROPERTY_SCHEMAS[displayAs] ?? [];
}

// The generic names xLights used for these counts before its 2026.04 release renamed them.
// fromAttrs.ts reads both, so the property grid has to as well: a show saved under the old names
// otherwise showed the *schema default* next to geometry built from the file's real value - "#
// Strings 16" beside a matrix that is visibly 32 wide. Editing the field writes the descriptive
// name, which then wins, so a model heals the moment it is touched either way.
const LEGACY_KEYS: Record<string, string> = {
  NumStrings: "parm1",
  NumArches: "parm1",
  NumCanes: "parm1",
  TopNodes: "parm1",
  ArmsPerString: "parm3",
  LightsPerArm: "parm2",
  NumChannels: "parm1",
  NodesPerString: "parm2",
  NodesPerArch: "parm2",
  NodesPerCane: "parm2",
  SideNodes: "parm2",
  StarPoints: "parm3",
  BottomNodes: "parm3",
};

/** What a property field is actually worth for a model, honouring the legacy attribute names. */
export function propertyValueFor(
  field: PropertyField,
  attrs: Record<string, string>,
): string | number {
  const direct = attrs[field.key];
  if (direct !== undefined) return direct;
  const legacy = LEGACY_KEYS[field.key];
  if (legacy !== undefined && attrs[legacy] !== undefined) return attrs[legacy]!;
  return field.default;
}
