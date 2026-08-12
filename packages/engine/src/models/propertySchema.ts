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
};

export function propertyFieldsFor(displayAs: string): PropertyField[] {
  return MODEL_PROPERTY_SCHEMAS[displayAs] ?? [];
}
