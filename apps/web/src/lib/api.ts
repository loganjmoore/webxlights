import type { EffectPreset } from "./effectPresets";
import type { BackgroundImage } from "./backgroundImage";
import type { SongBoundary } from "./songRegions";
import type { BlendMode, LayerSettings, PictureImage, StoredSwatch, SubModelSpec, TransitionSpec, ValueCurve } from "@webxlights/engine";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Project {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Layout {
  id: number;
  name: string;
  /**
   * A free-form bag the layout carries alongside its models: the sequencer's views, effect
   * presets and the background image all live here rather than in tables of their own, because
   * each is only ever read and written whole and nothing joins against one.
   */
  settings?: Record<string, unknown> | null;
}

export interface ModelRecord {
  id: number;
  name: string;
  type: string;
  supported: boolean;
  params: Record<string, unknown>;
  raw_attrs: Record<string, string>;
  screen: { x?: number; y?: number; z?: number; scale?: number; scaleY?: number; scaleZ?: number; rotate?: number };
  strings: number | null;
  nodes_per_string: number | null;
  // xLights SubModels: named subsets of this model's nodes, each addressable as its own
  // sequencer row (engine/models/subModel.ts).
  sub_models?: SubModelSpec[] | null;
  string_type: string | null;
  start_channel: string | null;
  channel_count: number | null;
  controller_id: number | null;
  controller_offset: number | null;
  order: number;
}

export type ControllerProtocol = "ddp" | "ethernet" | "null" | "usb";

export interface ControllerRecord {
  id: number;
  project_id: number;
  name: string;
  protocol: ControllerProtocol;
  ip_address: string | null;
  start_channel: number;
  channel_count: number;
  vendor: string | null;
  model: string | null;
  active: boolean;
}

export interface ControllerUpsertPayload {
  name: string;
  protocol: ControllerProtocol;
  ip_address?: string | null;
  start_channel?: number;
  channel_count?: number;
  vendor?: string | null;
  model?: string | null;
  active?: boolean;
}

/** A named, ordered subset of the sequencer's rows. `rowKeys` are opaque to the server. */
export interface SequencerView {
  name: string;
  rowKeys: string[];
}

export interface ModelGroupRecord {
  id: number;
  name: string;
  buffer_style: string;
  members: Array<{ id: number; name: string }>;
}

export interface ModelUpsertPayload {
  name: string;
  type: string;
  supported?: boolean;
  params?: Record<string, unknown>;
  raw_attrs?: Record<string, string>;
  screen?: Record<string, unknown>;
  strings?: number | null;
  nodes_per_string?: number | null;
  sub_models?: SubModelSpec[];
  string_type?: string | null;
  start_channel?: string | null;
  channel_count?: number;
  controller_id?: number | null;
  controller_offset?: number | null;
  order?: number;
}

export interface GroupUpsertPayload {
  name: string;
  bufferStyle?: string;
  memberNames: string[];
}

export interface ViewObjectRecord {
  id: number;
  name: string;
  type: string;
  supported: boolean;
  raw_attrs: Record<string, string>;
}

export interface ViewObjectUpsertPayload {
  name: string;
  type: string;
  supported?: boolean;
  raw_attrs?: Record<string, string>;
}

// A param is a flat value, a ValueCurve that animates it across the effect (valueCurve.ts),
// or - for Pictures - a decoded image. All JSON-safe, so they survive autosave, snapshots and
// the package-show export like any other param.
export type EffectParamValue = number | boolean | string | ValueCurve | PictureImage;

export interface SequenceEffect {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, EffectParamValue>;
  // Per-effect color override (real xLights' Color tab), hex strings. Unset = inherit the
  // row's default palette.
  // A swatch is a hex colour, or a colour curve that changes over the effect or across the
  // model (engine/colorCurve.ts).
  palette?: StoredSwatch[];
  // Real xLights' Layer Blending panel.
  blendMode?: BlendMode;
  mix?: number; // 0..1, the "Mix" slider
  // In/out reveals - now the full transition system (engine/transition.ts), not just fades.
  transition?: TransitionSpec;
  // Real xLights' Layer Settings panel - transformation, blur and sub-buffer. Applies between
  // the effect and the model, so it works on every effect (engine/layerSettings.ts).
  layer?: LayerSettings;
}

export interface SequenceRow {
  // "submodel" rows carry their parent model's id in elementId and name the sub-model in
  // subName, because a sub-model has no id of its own - it lives on its parent's record.
  elementType: "model" | "group" | "submodel";
  subName?: string;
  elementId: number;
  effects: SequenceEffect[];
}

export interface TimingTrack {
  name: string;
  marks: number[];
  /**
   * Optional label per mark, positionally. xLights' lyric and phrase tracks carry these, and
   * "Create Song Regions from Timing Track" uses them as the region names.
   */
  labels?: string[];
}

export interface SequenceBody {
  timingTracks: TimingTrack[];
  rows: SequenceRow[];
  /**
   * Song structure boundaries (lib/songRegions.ts). Stored as boundaries rather than start/end
   * pairs: a region ends where the next begins, so keeping both would let the two disagree, and
   * a gap or overlap between regions isn't a state the timeline can be in.
   */
  songBoundaries?: SongBoundary[];
}

export interface SequenceRecord {
  id: number;
  name: string;
  frame_ms: number;
  duration_ms: number;
  audio_filename: string | null;
  audio_path: string | null;
  body: SequenceBody;
  revision: number;
  etag?: string;
}

export interface SequenceSummary {
  id: number;
  name: string;
  frame_ms: number;
  duration_ms: number;
}

export interface SequenceVersion {
  id: number;
  number: number;
  body: SequenceBody;
  created_by: number;
  created_at: string;
  creator?: { id: number; name: string };
}

export type AccessLevel = "owner" | "editor" | "viewer";

export interface ProjectMember {
  id: number;
  role: Exclude<AccessLevel, "owner">;
  user: User;
}

export type SaveBodyResult = { ok: true; data: SequenceRecord } | { ok: false; current: SequenceRecord };

export const api = {
  async csrf(): Promise<void> {
    await fetch("/sanctum/csrf-cookie", { credentials: "include" });
  },
  register: (name: string, email: string, password: string, password_confirmation: string) =>
    request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, password_confirmation }),
    }),
  login: (email: string, password: string) =>
    request<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),
  listProjects: () => request<Project[]>("/v1/projects"),
  createProject: (name: string) => request<Project>("/v1/projects", { method: "POST", body: JSON.stringify({ name }) }),
  listLayouts: (projectId: number) => request<Layout[]>(`/v1/projects/${projectId}/layouts`),
  listModels: (layoutId: number) => request<ModelRecord[]>(`/v1/layouts/${layoutId}/models`),
  bulkUpsertModels: (layoutId: number, models: ModelUpsertPayload[]) =>
    request<ModelRecord[]>(`/v1/layouts/${layoutId}/models/bulk`, { method: "POST", body: JSON.stringify({ models }) }),
  updateModel: (layoutId: number, modelId: number, patch: Partial<ModelUpsertPayload>) =>
    request<ModelRecord>(`/v1/layouts/${layoutId}/models/${modelId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteModel: (layoutId: number, modelId: number) =>
    request<void>(`/v1/layouts/${layoutId}/models/${modelId}`, { method: "DELETE" }),
  listControllers: (projectId: number) => request<ControllerRecord[]>(`/v1/projects/${projectId}/controllers`),
  createController: (projectId: number, data: ControllerUpsertPayload) =>
    request<ControllerRecord>(`/v1/projects/${projectId}/controllers`, { method: "POST", body: JSON.stringify(data) }),
  updateController: (controllerId: number, patch: Partial<ControllerUpsertPayload>) =>
    request<ControllerRecord>(`/v1/controllers/${controllerId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteController: (controllerId: number) => request<void>(`/v1/controllers/${controllerId}`, { method: "DELETE" }),
  listModelGroups: (layoutId: number) => request<ModelGroupRecord[]>(`/v1/layouts/${layoutId}/model-groups`),
  bulkUpsertModelGroups: (layoutId: number, groups: GroupUpsertPayload[]) =>
    request<ModelGroupRecord[]>(`/v1/layouts/${layoutId}/model-groups/bulk`, { method: "POST", body: JSON.stringify({ groups }) }),
  deleteModelGroup: (layoutId: number, groupId: number) =>
    request<void>(`/v1/layouts/${layoutId}/model-groups/${groupId}`, { method: "DELETE" }),
  // xLights' sequencer Views: named, ordered subsets of the sequencer's rows. Stored on the
  // layout because the manual says they "work across sequences".
  listViews: (layoutId: number) => request<{ views: SequencerView[] }>(`/v1/layouts/${layoutId}/views`),
  replaceViews: (layoutId: number, views: SequencerView[]) =>
    request<{ views: SequencerView[] }>(`/v1/layouts/${layoutId}/views`, { method: "PUT", body: JSON.stringify({ views }) }),
  listEffectPresets: (layoutId: number) => request<{ presets: EffectPreset[] }>(`/v1/layouts/${layoutId}/effect-presets`),
  replaceEffectPresets: (layoutId: number, presets: EffectPreset[]) =>
    request<{ presets: EffectPreset[] }>(`/v1/layouts/${layoutId}/effect-presets`, { method: "PUT", body: JSON.stringify({ presets }) }),
  replaceBackground: (layoutId: number, background: BackgroundImage | null) =>
    request<{ background: BackgroundImage | null }>(`/v1/layouts/${layoutId}/background`, {
      method: "PUT",
      body: JSON.stringify({ background }),
    }),
  listViewObjects: (layoutId: number) => request<ViewObjectRecord[]>(`/v1/layouts/${layoutId}/view-objects`),
  bulkUpsertViewObjects: (layoutId: number, objects: ViewObjectUpsertPayload[]) =>
    request<ViewObjectRecord[]>(`/v1/layouts/${layoutId}/view-objects/bulk`, { method: "POST", body: JSON.stringify({ objects }) }),
  listSequences: (projectId: number) => request<SequenceSummary[]>(`/v1/projects/${projectId}/sequences`),
  createSequence: (projectId: number, data: { name: string; frame_ms: number; duration_ms: number; audio_filename?: string }) =>
    request<SequenceRecord>(`/v1/projects/${projectId}/sequences`, { method: "POST", body: JSON.stringify(data) }),
  getSequence: (sequenceId: number) => request<SequenceRecord>(`/v1/sequences/${sequenceId}`),
  sequenceAudioUrl: (sequenceId: number) => `/api/v1/sequences/${sequenceId}/audio`,
  async uploadSequenceAudio(sequenceId: number, file: File): Promise<SequenceRecord> {
    const form = new FormData();
    form.append("audio", file);
    const res = await fetch(`/api/v1/sequences/${sequenceId}/audio`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" }, // no Content-Type: fetch sets the multipart boundary itself
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  // Returns { ok:false, current } on a 409 (someone else saved since this etag was read)
  // instead of throwing, so the sequencer store can offer "keep mine" / "take theirs" rather
  // than silently clobbering or crashing.
  async saveSequenceBody(sequenceId: number, body: SequenceBody, ifMatch?: string): Promise<SaveBodyResult> {
    const res = await fetch(`/api/v1/sequences/${sequenceId}/body`, {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ body, if_match: ifMatch }),
    });
    const json = await res.json();
    if (res.status === 409) return { ok: false, current: json.current };
    if (!res.ok) throw new ApiError(res.status, JSON.stringify(json));
    return { ok: true, data: json };
  },
  listVersions: (sequenceId: number) => request<SequenceVersion[]>(`/v1/sequences/${sequenceId}/versions`),
  snapshotVersion: (sequenceId: number) => request<SequenceVersion>(`/v1/sequences/${sequenceId}/versions`, { method: "POST" }),
  restoreVersion: (sequenceId: number, versionId: number) =>
    request<SequenceRecord>(`/v1/sequences/${sequenceId}/versions/${versionId}/restore`, { method: "POST" }),
  listMembers: (projectId: number) => request<ProjectMember[]>(`/v1/projects/${projectId}/members`),
  addMember: (projectId: number, email: string, role: "viewer" | "editor") =>
    request<ProjectMember>(`/v1/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  removeMember: (projectId: number, userId: number) =>
    request<void>(`/v1/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
};
