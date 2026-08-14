import JSZip from "jszip";
import {
  api,
  type ControllerUpsertPayload,
  type GroupUpsertPayload,
  type ModelRecord,
  type ModelUpsertPayload,
  type SequencerView,
  type ViewObjectUpsertPayload,
} from "./api";
import type { BackgroundImage } from "./backgroundImage";
import type { EffectPreset } from "./effectPresets";

// "Package show": a portable webXLights-native zip, and this app's answer to xLights' show-folder
// backup. Not xLights' own rgbeffects/xsq XML - those round-trip through the real importer and
// exporter; this is everything a *project* is, in one file you can keep.
//
// The rule it has to meet is the one any backup has to meet: what comes back is what went in.
// Earlier versions carried the models, the groups and the sequence bodies, and quietly dropped
// sub-models, states, faces, every controller and every controller assignment, the view objects,
// the sequencer's views and the effect presets. A backup that loses things is worse than no
// backup, because you find out when you need it. Version 2 carries all of them.
//
// One thing it still doesn't carry, and says so rather than pretending: the audio. There is no
// asset store behind this app yet, so a sequence keeps its audio *filename* and the track is
// re-picked after importing, exactly as it is when a sequence is reloaded today.

const PACKAGE_VERSION = 2;

interface PackagedSequence {
  file: string;
  name: string;
  frame_ms: number;
  duration_ms: number;
  audio_filename: string | null;
}

interface PackageManifest {
  version?: number;
  projectName: string;
  models: ModelUpsertPayload[];
  groups: GroupUpsertPayload[];
  sequences: PackagedSequence[];
  // Everything below arrived with version 2. All optional, so a version 1 package still imports -
  // it simply has less in it, which is true of the show it came from as far as this file knew.
  controllers?: ControllerUpsertPayload[];
  /** Controller assignments, by name rather than id: ids differ between projects. */
  assignments?: Array<{ model: string; controller: string; offset: number | null; channels: number | null }>;
  viewObjects?: ViewObjectUpsertPayload[];
  views?: SequencerView[];
  effectPresets?: EffectPreset[];
  background?: BackgroundImage | null;
}

function toUpsert(m: ModelRecord): ModelUpsertPayload {
  return {
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
    // The three things that live inside a model and were being lost.
    sub_models: m.sub_models ?? [],
    states: m.states ?? [],
    faces: m.faces ?? [],
  };
}

export async function exportPackage(projectId: number, projectName: string): Promise<Blob> {
  const layouts = await api.listLayouts(projectId);
  const layout = layouts[0];
  const [models, groups, sequenceSummaries, controllers, viewObjects, views, presets] = await Promise.all([
    layout ? api.listModels(layout.id) : Promise.resolve([]),
    layout ? api.listModelGroups(layout.id) : Promise.resolve([]),
    api.listSequences(projectId),
    api.listControllers(projectId),
    layout ? api.listViewObjects(layout.id) : Promise.resolve([]),
    layout ? api.listViews(layout.id).then((r) => r.views) : Promise.resolve([]),
    layout ? api.listEffectPresets(layout.id).then((r) => r.presets) : Promise.resolve([]),
  ]);

  const controllerNameById = new Map(controllers.map((c) => [c.id, c.name]));

  const zip = new JSZip();
  const manifest: PackageManifest = {
    version: PACKAGE_VERSION,
    projectName,
    models: models.map(toUpsert),
    groups: groups.map((g) => ({ name: g.name, bufferStyle: g.buffer_style, memberNames: g.members.map((m) => m.name) })),
    sequences: [],
    controllers: controllers.map((c) => ({
      name: c.name,
      protocol: c.protocol,
      ip_address: c.ip_address,
      start_channel: c.start_channel,
      channel_count: c.channel_count,
      vendor: c.vendor,
      model: c.model,
      active: c.active,
    })),
    // Which model sits where on which controller. Carried separately from the models because it
    // points at a controller, and a controller's id is only meaningful in the project it came
    // from - the name is what survives the trip.
    assignments: models
      .filter((m) => m.controller_id != null && controllerNameById.has(m.controller_id))
      .map((m) => ({
        model: m.name,
        controller: controllerNameById.get(m.controller_id!)!,
        offset: m.controller_offset,
        channels: m.channel_count,
      })),
    viewObjects: viewObjects.map((o) => ({ name: o.name, type: o.type, supported: o.supported, raw_attrs: o.raw_attrs })),
    views,
    effectPresets: presets,
    background: (layout?.settings?.background as BackgroundImage | null | undefined) ?? null,
  };

  for (const summary of sequenceSummaries) {
    const record = await api.getSequence(summary.id);
    const file = `sequences/${record.id}.json`;
    manifest.sequences.push({
      file,
      name: record.name,
      frame_ms: record.frame_ms,
      duration_ms: record.duration_ms,
      audio_filename: record.audio_filename,
    });
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

export interface PackageImportResult {
  projectId: number;
  sequenceCount: number;
  /** What came back, so a restore can be checked rather than assumed. */
  restored: {
    models: number;
    groups: number;
    controllers: number;
    assignments: number;
    viewObjects: number;
    views: number;
    presets: number;
  };
}

export async function importPackage(file: File): Promise<PackageImportResult> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("Not a webXLights package (no manifest.json)");
  const manifest = JSON.parse(await manifestFile.async("text")) as PackageManifest;

  const project = await api.createProject(manifest.projectName);
  const layouts = await api.listLayouts(project.id);
  const layout = layouts[0];

  let assignmentCount = 0;
  const controllerIdByName = new Map<string, number>();

  if (layout) {
    if (manifest.models.length) await api.bulkUpsertModels(layout.id, manifest.models);
    if (manifest.groups.length) await api.bulkUpsertModelGroups(layout.id, manifest.groups);
    if (manifest.viewObjects?.length) await api.bulkUpsertViewObjects(layout.id, manifest.viewObjects);
    if (manifest.views?.length) await api.replaceViews(layout.id, manifest.views);
    if (manifest.effectPresets?.length) await api.replaceEffectPresets(layout.id, manifest.effectPresets);
    if (manifest.background) await api.replaceBackground(layout.id, manifest.background);
  }

  for (const controller of manifest.controllers ?? []) {
    const created = await api.createController(project.id, controller);
    controllerIdByName.set(created.name, created.id);
  }

  // Assignments come after both sides exist, and are matched by name for the same reason they
  // were written by name.
  if (layout && manifest.assignments?.length) {
    const created = await api.listModels(layout.id);
    const modelIdByName = new Map(created.map((m) => [m.name, m.id]));
    for (const assignment of manifest.assignments) {
      const modelId = modelIdByName.get(assignment.model);
      const controllerId = controllerIdByName.get(assignment.controller);
      if (modelId === undefined || controllerId === undefined) continue;
      await api.updateModel(layout.id, modelId, {
        controller_id: controllerId,
        controller_offset: assignment.offset,
        channel_count: assignment.channels ?? 0,
      });
      assignmentCount++;
    }
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

  return {
    projectId: project.id,
    sequenceCount: manifest.sequences.length,
    restored: {
      models: manifest.models.length,
      groups: manifest.groups.length,
      controllers: manifest.controllers?.length ?? 0,
      assignments: assignmentCount,
      viewObjects: manifest.viewObjects?.length ?? 0,
      views: manifest.views?.length ?? 0,
      presets: manifest.effectPresets?.length ?? 0,
    },
  };
}

/** A one-line account of a restore, so it can be checked rather than assumed. */
export function describeRestore(result: PackageImportResult): string {
  const r = result.restored;
  const parts = [`${r.models} models`, `${result.sequenceCount} sequences`];
  if (r.groups) parts.push(`${r.groups} groups`);
  if (r.controllers) parts.push(`${r.controllers} controllers`);
  if (r.assignments) parts.push(`${r.assignments} channel assignments`);
  if (r.viewObjects) parts.push(`${r.viewObjects} view objects`);
  if (r.views) parts.push(`${r.views} views`);
  if (r.presets) parts.push(`${r.presets} presets`);
  // Audio is the one thing a package never carries, and a restore is exactly when someone needs
  // to be told that rather than discovering it at the sequencer.
  return `${parts.join(", ")} — audio tracks need re-picking, as packages don't carry them`;
}
