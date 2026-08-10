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
};
