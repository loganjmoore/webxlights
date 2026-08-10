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
};
