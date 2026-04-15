export type StatusValue = boolean | string | number;
export type LogLevel = "info" | "success" | "warning" | "error";

export type StatusItem = {
  id: string;
  name: string;
  value: StatusValue;
  unit?: string;
  source?: string;
  updatedAt: string;
  description?: string;
};

export type ActionItem = {
  id: string;
  name: string;
  category: string;
  target: string;
  description?: string;
  command: string;
};

export type LogItem = {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
};

export type StateSnapshot = {
  statuses: StatusItem[];
  actions: ActionItem[];
  logs: LogItem[];
};
