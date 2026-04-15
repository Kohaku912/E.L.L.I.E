import type { ActionItem, LogItem, StatusItem, StateSnapshot } from "../types";

const KEY = "room-dashboard-v1";

export const loadLocalSnapshot = (): StateSnapshot | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StateSnapshot;
  } catch {
    return null;
  }
};

export const saveLocalSnapshot = (snapshot: StateSnapshot) => {
  localStorage.setItem(KEY, JSON.stringify(snapshot));
};

export const emptySnapshot = (): StateSnapshot => ({
  statuses: [] as StatusItem[],
  actions: [] as ActionItem[],
  logs: [] as LogItem[],
});
