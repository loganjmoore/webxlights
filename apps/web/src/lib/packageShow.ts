import JSZip from "jszip";
import { api, type GroupUpsertPayload, type ModelUpsertPayload } from "./api";

// "Package show": a portable webXLights-native zip (not xLights' own rgbeffects/xsq XML -
// those round-trip through the real importer/exporter in M1/M5). manifest.json + one JSON
// file per sequence is enough to satisfy the M7 accept criterion ("packaged zip re-imports
// cleanly into a fresh project"). Audio bytes aren't included (not R2-backed yet - same
// ceiling as M2/M5); the manifest keeps each sequence's audio_filename so it can be
// re-selected after import, same as reloading a sequence today.
interface PackageManifest {
  projectName: string;
  models: ModelUpsertPayload[];
  groups: GroupUpsertPayload[];
  sequences: Array<{ file: string; name: string; frame_ms: number; duration_ms: number; audio_filename: string | null }>;
}

export async function exportPackage(projectId: number, projectName: string): Promise<Blob> {
  const layouts = await api.listLayouts(projectId);
  const layout = layouts[0];
  const [models, groups, sequenceSummaries] = await Promise.all([
    layout ? api.listModels(layout.id) : Promise.resolve([]),
    layout ? api.listModelGroups(layout.id) : Promise.resolve([]),
    api.listSequences(projectId),
  ]);

  const zip = new JSZip();
  const manifest: PackageManifest = {
    projectName,
    models: models.map((m) => ({
      name: m.name,
      type: m.type,
      supported: m.supported,
      params: m.params,
      raw_attrs: m.raw_attrs,
      screen: m.screen,
      strings: m.strings,
      nodes_per_string: m.nodes_per_string,
      string_type: m.string_type,
      start_channel: m.start_channel,
      order: m.order,
    })),
    groups: groups.map((g) => ({ name: g.name, bufferStyle: g.buffer_style, memberNames: g.members.map((m) => m.name) })),
    sequences: [],
  };

  for (const summary of sequenceSummaries) {
    const record = await api.getSequence(summary.id);
    const file = `sequences/${record.id}.json`;
    manifest.sequences.push({ file, name: record.name, frame_ms: record.frame_ms, duration_ms: record.duration_ms, audio_filename: record.audio_filename });
    zip.file(file, JSON.stringify(record.body));
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export function downloadPackage(blob: Blob, projectName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.replace(/[^\w.-]+/g, "_")}.webxlights.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importPackage(file: File): Promise<{ projectId: number; sequenceCount: number }> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("Not a webXLights package (no manifest.json)");
  const manifest = JSON.parse(await manifestFile.async("text")) as PackageManifest;

  const project = await api.createProject(manifest.projectName);
  const layouts = await api.listLayouts(project.id);
  const layout = layouts[0];
  if (layout) {
    if (manifest.models.length) await api.bulkUpsertModels(layout.id, manifest.models);
    if (manifest.groups.length) await api.bulkUpsertModelGroups(layout.id, manifest.groups);
  }

  for (const seq of manifest.sequences) {
    const record = await api.createSequence(project.id, {
      name: seq.name,
      frame_ms: seq.frame_ms,
      duration_ms: seq.duration_ms,
      audio_filename: seq.audio_filename ?? undefined,
    });
    const bodyFile = zip.file(seq.file);
    if (bodyFile) {
      const body = JSON.parse(await bodyFile.async("text"));
      await api.saveSequenceBody(record.id, body);
    }
  }

  return { projectId: project.id, sequenceCount: manifest.sequences.length };
}
