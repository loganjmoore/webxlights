import { appliedPlacementFor, computeGeometryFromAttrs, transformedHalfExtents, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord } from "./api";

// A compact, pasteable dump of how every model in a layout was placed: the raw xLights
// attributes the importer read, and the position/scale/rotation it derived from them.
//
// This exists because the placement work can't be verified from inside the app. The maths is
// unit-tested and the placement systems are confirmed against the xLights manual, but whether
// an *actual* show lands where it does in xLights can only be checked against that show - and
// `raw_attrs` is lossless, so this report carries everything needed to check it without anyone
// having to find and send the original xlights_rgbeffects.xml.
//
// Deliberately only the placement attributes, not the whole attribute bag: channel
// assignments, controller names and start channels are not needed to diagnose a layout and
// shouldn't be pasted into a chat or an issue.
const PLACEMENT_ATTRS = [
  "WorldPosX",
  "WorldPosY",
  "WorldPosZ",
  "ScaleX",
  "ScaleY",
  "ScaleZ",
  "RotateX",
  "RotateY",
  "RotateZ",
  "X2",
  "x2",
  "Y2",
  "y2",
  "Z2",
  "z2",
  "Height",
  "height",
  "Shear",
  "Angle",
  "NumPoints",
];

const NODE_SPACING = 4; // matches the canvases

function geometryOf(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function round(n: number | undefined, places = 2): string {
  if (n === undefined || !Number.isFinite(n)) return "-";
  return String(Math.round(n * 10 ** places) / 10 ** places);
}

export function buildPlacementReport(models: ModelRecord[]): string {
  const counts = { boxed: 0, twoPoint: 0, threePoint: 0 };
  const byType = new Map<string, number>();
  const lines: string[] = [];

  for (const model of models) {
    const applied = appliedPlacementFor(model.type, model.raw_attrs);
    counts[applied]++;
    byType.set(model.type, (byType.get(model.type) ?? 0) + 1);

    const raw = PLACEMENT_ATTRS.filter((k) => model.raw_attrs[k] !== undefined)
      .map((k) => `${k}=${model.raw_attrs[k]}`)
      .join(" ");

    const geo = geometryOf(model);
    const half = geo
      ? transformedHalfExtents(geo, {
          scale: model.screen.scale ?? 1,
          scaleY: model.screen.scaleY,
          scaleZ: model.screen.scaleZ,
          rotateDeg: model.screen.rotate ?? 0,
        })
      : null;
    const size = half ? `${round(half.halfW * 2 * NODE_SPACING)}x${round(half.halfH * 2 * NODE_SPACING)}` : "-";

    lines.push(
      [
        `${model.name} [${model.type}]`,
        `applied=${applied}`,
        `pos=(${round(model.screen.x)},${round(model.screen.y)},${round(model.screen.z)})`,
        `scale=(${round(model.screen.scale, 4)},${round(model.screen.scaleY, 4)})`,
        `rot=${round(model.screen.rotate)}`,
        `rendered=${size}`,
        raw ? `raw: ${raw}` : "raw: (no placement attributes)",
      ].join(" | "),
    );
  }

  const typeSummary = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(", ");

  return [
    `webXLights placement report`,
    `models=${models.length} | applied: boxed=${counts.boxed} twoPoint=${counts.twoPoint} threePoint=${counts.threePoint}`,
    `types: ${typeSummary}`,
    `(pos/scale/rot are what the importer derived; "raw" is what xLights wrote; rendered is the`,
    ` model's on-canvas size in world units)`,
    ``,
    ...lines,
  ].join("\n");
}

// Clipboard first, with a file download as the fallback - navigator.clipboard needs a secure
// context and a user gesture, and silently rejecting would leave the button looking broken.
export async function copyOrDownloadReport(text: string, filename = "webxlights-placement-report.txt"): Promise<"copied" | "downloaded"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return "downloaded";
  }
}
