import type { ActionItem, LogItem, StatusItem, StateSnapshot } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export const api = {
  getState: () => request<StateSnapshot>("/api/state"),
  addStatus: (payload: Omit<StatusItem, "id" | "updatedAt"> & { value: StatusItem["value"] }) =>
    request<StatusItem>("/api/statuses", { method: "POST", body: JSON.stringify(payload) }),
  deleteStatus: (id: string) => request<{ ok: boolean }>(`/api/statuses/${id}`, { method: "DELETE" }),
  addAction: (payload: Omit<ActionItem, "id">) =>
    request<ActionItem>("/api/actions", { method: "POST", body: JSON.stringify(payload) }),
  deleteAction: (id: string) => request<{ ok: boolean }>(`/api/actions/${id}`, { method: "DELETE" }),
  executeAction: (payload: { action_id?: string; name?: string; command?: string; params?: Record<string, unknown> }) =>
    request<Record<string, unknown>>("/api/actions/execute", { method: "POST", body: JSON.stringify(payload) }),
  addLog: (payload: LogItem) => request<LogItem>("/api/logs", { method: "POST", body: JSON.stringify(payload) }),
};
