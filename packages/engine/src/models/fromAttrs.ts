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
import { parsePolyPointPath } from "./polyPoints";
import { computeSpinner } from "./spinner";
import { computeCube } from "./cube";
import { computeSphere } from "./sphere";
import { computeChannelBlock, computeImageModel } from "./channelBlock";

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

// xLights' model XML used generic `parm1`/`parm2`/`parm3` for a model's counts until the
// 2026.04 release renamed them to descriptive fields (`NumStrings`, `NodesPerString`, ...),
// keeping the old names readable. Every show saved before that release - which is most of the
// shows that exist - therefore stores its counts under the old names, and reading only the new
// ones meant silently falling back to library defaults for every model in the file: a 32x100
// matrix imported as 16x50, a 24-string tree as 16. The sizes were then wrong for reasons no
// amount of placement work could fix.
//
// parm1/2/3 map onto whichever descriptive fields a type has, in the order xLights lists them,
// because the rename replaced them in place.
function count(attrs: Record<string, string>, names: string[], fallback: number): number {
  for (const name of names) {
    const parsed = parseInt(attrs[name] ?? "", 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// SPEC ch11 §2.1 attribute table -> the engine's own geometry params. One bag of raw
// XML attributes in (xLights' own "typed-prefix attribute bag" convention), one
// ModelGeometry out. Returns null for a DisplayAs this engine doesn't render (M1 scope
// is the goal prompt's 12-type list; everything else stays imported-but-inert).
export function computeGeometryFromAttrs(displayAs: string, attrs: Record<string, string>): ModelGeometry | null {
  switch (displayAs) {
    case "Matrix":
      return computeVerticalMatrixTopLeft({
        strings: count(attrs, ["NumStrings", "parm1"], 16),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
      });
    case "Single Line":
      return computeSingleLine({
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
      });
    case "Poly Line": {
      // Poly Line is the one type whose shape is stored in its placement attributes: without
      // PointData it really is a straight run; with it, the vertices are the model
      // (models/polyPoints.ts).
      const totalNodes = count(attrs, ["NodesPerString", "parm2"], 50);
      return computePolyLine({ totalNodes, points: parsePolyPointPath(attrs, totalNodes)?.local });
    }
    case "Arches":
      return computeArches({
        archCount: count(attrs, ["NumArches", "parm1"], 1),
        nodesPerArch: count(attrs, ["NodesPerArch", "parm2"], 50),
        arcDegrees: float(attrs.Arc, 180),
      });
    case "Candy Canes":
      return computeCandyCanes({
        caneCount: count(attrs, ["NumCanes", "parm1"], 3),
        nodesPerCane: count(attrs, ["NodesPerCane", "parm2"], 18),
      });
    case "Circle":
      return computeCircle({
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
        centerPercent: float(attrs.centerPercent, 0),
        layerSizes: csvInts(attrs.LayerSizes),
      });
    case "Star":
      return computeStar({
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
        points: count(attrs, ["StarPoints", "parm3"], 5),
        outerToInnerRatio: float(attrs.starRatio, 2.618034),
      });
    case "Tree": {
      const treeType = int(attrs.TreeType, 0);
      const style = treeType === 1 ? "Flat" : treeType === 2 ? "Ribbon" : "Round";
      return computeTree({
        strings: count(attrs, ["NumStrings", "parm1"], 16),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
        strandsPerString: count(attrs, ["StrandsPerString", "parm3"], 1),
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
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 80),
        dropPattern: csvInts(attrs.DropPattern) ?? [2, 4, 6, 4],
      });
    case "Window Frame":
      return computeWindowFrame({
        top: count(attrs, ["TopNodes", "parm1"], 16),
        leftRight: count(attrs, ["SideNodes", "parm2"], 50),
        bottom: count(attrs, ["BottomNodes", "parm3"], 16),
        direction: attrs.Rotation === "Counter Clockwise" ? "Counter Clockwise" : "Clockwise",
      });
    case "Wreath":
      return computeWreath({
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 50),
      });
    case "Spinner":
      return computeSpinner({
        strings: count(attrs, ["NumStrings", "parm1"], 1),
        nodesPerArm: count(attrs, ["LightsPerArm", "NodesPerArm", "parm2"], 10),
        armsPerString: count(attrs, ["ArmsPerString", "NumArms", "parm3"], 8),
        hollowPercent: float(attrs.Hollow, 20),
        arcDegrees: float(attrs.Arc, 360),
        startAngleDegrees: float(attrs.StartAngle, 0),
        zigZag: attrs.ZigZag === "true" || attrs.ZigZag === "1",
      });
    case "Cube":
      return computeCube({
        // xLights names these on the model directly rather than through parm1/2/3, because a cube
        // has three counts and the old scheme only had room for the two most types use.
        width: count(attrs, ["Width", "parm1"], 5),
        height: count(attrs, ["Height", "parm2"], 5),
        depth: count(attrs, ["Depth", "parm3"], 5),
        style: attrs.Style === "Cylinder" ? "Cylinder" : "Cube",
        strings: count(attrs, ["NumStrings", "Strings"], 1),
        // "Zig Zag: wiring winds back and forth" is xLights' own default for a cube.
        zigZag: attrs.StrandStyle !== "No Zig Zag",
      });
    case "Sphere":
      return computeSphere({
        strings: count(attrs, ["NumStrings", "parm1"], 16),
        nodesPerString: count(attrs, ["NodesPerString", "parm2"], 25),
        degrees: float(attrs.Degrees, 360),
        southernLatitude: float(attrs.StartLatitude, 0),
        northernLatitude: float(attrs.EndLatitude, 0),
      });
    case "Channel Block":
      return computeChannelBlock({ channels: count(attrs, ["NumChannels", "parm1"], 1) });
    case "Image":
      // A single-channel prop: the picture is how it is drawn in the layout, not something this
      // engine lights per pixel.
      return computeImageModel();
    case "Custom":
      return attrs.CustomModel ? parseCustomModelGrid(attrs.CustomModel) : null;
    default:
      return null;
  }
}
