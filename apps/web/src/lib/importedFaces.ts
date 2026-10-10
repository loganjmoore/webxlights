import { parseFaces, type ParsedFaceDefinition } from "@webxlights/formats";
import type { FaceSpec } from "@webxlights/engine";
import type { ModelRecord } from "./api";

// Face definitions as they come from an xLights layout, and the repair for layouts imported
// before the importer read xLights' own keys ("Mouth-AI", "FaceOutline"; see formats'
// parseFaces). Those faces came across with their eyes and no mouth or outline, so a singing face
// blinked and never sang. The model's own <faceInfo> is still in its raw attributes, so the
// mouths can be read again from it without importing the layout again.

/** A parsed definition as the app stores it. */
export function faceSpecFromParsed(f: ParsedFaceDefinition): FaceSpec {
  return {
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
  };
}

/**
 * The model with any node-range face that has no mouth filled in from its <faceInfo>. A face
 * with a mouth is left exactly as it is, whoever made it, so nothing drawn in the editor is lost.
 */
export function withImportedFaces(model: ModelRecord): ModelRecord {
  const faces = model.faces ?? [];
  const raw = model.raw_attrs as Record<string, unknown> | null | undefined;
  if (!faces.length || !raw?.faceInfo) return model;
  const parsed = parseFaces(raw);
  let repaired = false;
  const next = faces.map((face) => {
    if (face.kind === "matrix" || face.mouths.some((m) => m.nodes.trim() !== "")) return face;
    const source = parsed.find((p) => p.name === face.name && p.kind === "nodes" && p.mouths.length > 0);
    if (!source) return face;
    repaired = true;
    const spec = faceSpecFromParsed(source);
    return { ...face, mouths: spec.mouths, outline: face.outline || spec.outline, outline2: face.outline2 || spec.outline2 };
  });
  return repaired ? { ...model, faces: next } : model;
}
