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
}

export interface ModelRecord {
  id: number;
  name: string;
  type: string;
  supported: boolean;
  params: Record<string, unknown>;
  raw_attrs: Record<string, string>;
  screen: { x?: number; y?: number; scale?: number; rotate?: number };
  strings: number | null;
  nodes_per_string: number | null;
  string_type: string | null;
  start_channel: string | null;
  order: number;
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
  string_type?: string | null;
  start_channel?: string | null;
  order?: number;
}

export interface GroupUpsertPayload {
  name: string;
  bufferStyle?: string;
  memberNames: string[];
}

export interface SequenceEffect {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  params: Record<string, number | boolean | string>;
}

export interface SequenceRow {
  elementType: "model" | "group";
  elementId: number;
  effects: SequenceEffect[];
}

export interface TimingTrack {
  name: string;
  marks: number[];
}

export interface SequenceBody {
  timingTracks: TimingTrack[];
  rows: SequenceRow[];
}

export interface SequenceRecord {
  id: number;
  name: string;
  frame_ms: number;
  duration_ms: number;
  audio_filename: string | null;
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
  listModelGroups: (layoutId: number) => request<ModelGroupRecord[]>(`/v1/layouts/${layoutId}/model-groups`),
  bulkUpsertModelGroups: (layoutId: number, groups: GroupUpsertPayload[]) =>
    request<ModelGroupRecord[]>(`/v1/layouts/${layoutId}/model-groups/bulk`, { method: "POST", body: JSON.stringify({ groups }) }),
  listSequences: (projectId: number) => request<SequenceSummary[]>(`/v1/projects/${projectId}/sequences`),
  createSequence: (projectId: number, data: { name: string; frame_ms: number; duration_ms: number; audio_filename?: string }) =>
    request<SequenceRecord>(`/v1/projects/${projectId}/sequences`, { method: "POST", body: JSON.stringify(data) }),
  getSequence: (sequenceId: number) => request<SequenceRecord>(`/v1/sequences/${sequenceId}`),
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
