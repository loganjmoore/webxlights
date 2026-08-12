import type { ModelGeometry } from "./types";
import { computeVerticalMatrixTopLeft } from "./matrix";
import { computeSingleLine, computePolyLine } from "./line";
import { computeArches } from "./arches";
import { computeCandyCanes } from "./candyCanes";
import { computeCircle } from "./circle";
import { computeStar } from "./star";
import { computeTree } from "./tree";
import { computeIcicles } from "./icicles";
import { computeWindowFrame } from "./windowFrame";
import { computeWreath } from "./wreath";
import { parseCustomModelGrid } from "./custom";

const int = (v: string | undefined, fallback: number): number => {
  const n = v === undefined ? NaN : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const float = (v: string | undefined, fallback: number): number => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const csvInts = (v: string | undefined): number[] | undefined =>
  v ? v.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite) : undefined;

// SPEC ch11 §2.1 attribute table -> the engine's own geometry params. One bag of raw
// XML attributes in (xLights' own "typed-prefix attribute bag" convention), one
// ModelGeometry out. Returns null for a DisplayAs this engine doesn't render (M1 scope
// is the goal prompt's 12-type list; everything else stays imported-but-inert).
export function computeGeometryFromAttrs(displayAs: string, attrs: Record<string, string>): ModelGeometry | null {
  switch (displayAs) {
    case "Matrix":
      return computeVerticalMatrixTopLeft({
        strings: int(attrs.NumStrings, 16),
        nodesPerString: int(attrs.NodesPerString, 50),
      });
    case "Single Line":
      return computeSingleLine({
        strings: int(attrs.NumStrings, 1),
        nodesPerString: int(attrs.NodesPerString, 50),
      });
    case "Poly Line":
      return computePolyLine({ totalNodes: int(attrs.NodesPerString, 50) });
    case "Arches":
      return computeArches({
        archCount: int(attrs.NumArches, 1),
        nodesPerArch: int(attrs.NodesPerArch, 50),
        arcDegrees: float(attrs.Arc, 180),
      });
    case "Candy Canes":
      return computeCandyCanes({
        caneCount: int(attrs.NumCanes, 3),
        nodesPerCane: int(attrs.NodesPerCane, 18),
      });
    case "Circle":
      return computeCircle({
        strings: int(attrs.NumStrings, 1),
        nodesPerString: int(attrs.NodesPerString, 50),
        centerPercent: float(attrs.centerPercent, 0),
        layerSizes: csvInts(attrs.LayerSizes),
      });
    case "Star":
      return computeStar({
        strings: int(attrs.NumStrings, 1),
        nodesPerString: int(attrs.NodesPerString, 50),
        points: int(attrs.StarPoints, 5),
        outerToInnerRatio: float(attrs.starRatio, 2.618034),
      });
    case "Tree": {
      const treeType = int(attrs.TreeType, 0);
      const style = treeType === 1 ? "Flat" : treeType === 2 ? "Ribbon" : "Round";
      return computeTree({
        strings: int(attrs.NumStrings, 16),
        nodesPerString: int(attrs.NodesPerString, 50),
        style,
        degrees: float(attrs.TreeDegrees, 360),
        bottomTopRatio: float(attrs.TreeBottomTopRatio, 6.0),
      });
    }
    case "Icicles":
      // computeIcicles's own no-pattern default is one drop spanning the entire node budget -
      // correct as a library default (least assumption possible), but a single straight line
      // is the one shape "icicles" can't look like. A model actually imported with a real
      // DropPattern attribute is unaffected (csvInts(attrs.DropPattern) wins); this fallback
      // only fires for a drag-created model or an import that genuinely omits the attribute.
      return computeIcicles({
        strings: int(attrs.NumStrings, 1),
        nodesPerString: int(attrs.NodesPerString, 80),
        dropPattern: csvInts(attrs.DropPattern) ?? [2, 4, 6, 4],
      });
    case "Window Frame":
      return computeWindowFrame({
        top: int(attrs.TopNodes, 16),
        leftRight: int(attrs.SideNodes, 50),
        bottom: int(attrs.BottomNodes, 16),
        direction: attrs.Rotation === "Counter Clockwise" ? "Counter Clockwise" : "Clockwise",
      });
    case "Wreath":
      return computeWreath({
        strings: int(attrs.NumStrings, 1),
        nodesPerString: int(attrs.NodesPerString, 50),
      });
    case "Custom":
      return attrs.CustomModel ? parseCustomModelGrid(attrs.CustomModel) : null;
    default:
      return null;
  }
}
