import type { ActionItem, LogItem, StatusItem, StateSnapshot } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://192.168.50.195:3000";
const PHONE_API_BASE = import.meta.env.VITE_PHONE_API_BASE ?? "http://192.168.50.235:8080";

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });

  if (!res.ok) {
    const body = await readBody(res);
    const message =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && "message" in body
          ? String((body as { message?: unknown }).message ?? "")
          : "";
    throw new Error(message || `Request failed: ${res.status}`);
  }

  return (await readBody(res)) as T;
}

export type RemoteStateResponse = {
  summary?: Record<string, unknown>;
  system?: Record<string, unknown>;
  cpu?: {
    physical_cores?: number;
    logical_cores?: number;
    global_usage?: number;
    cores?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  memory?: {
    total_memory?: number;
    used_memory?: number;
    free_memory?: number;
    available_memory?: number;
    modules?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  storage?: Record<string, unknown>;
  network?: Record<string, unknown>;
  gpu?: Record<string, unknown>;
  battery?: Record<string, unknown>;
  services?: Record<string, unknown>;
  processes?: Record<string, unknown>;
  sensors?: Record<string, unknown>;
  mouse?: {
    x?: number;
    y?: number;
    [key: string]: unknown;
  };
  discord?: Record<string, unknown>;
  discord_voice?: Record<string, unknown>;
};

export type PhoneStateResponse = {
  collectedAt?: string;

  device?: {
    brand?: string;
    model?: string;
    manufacturer?: string;
    device?: string;
    product?: string;
    board?: string;
    hardware?: string;
    bootloader?: string;
    fingerprint?: string;
  };

  os?: {
    sdkInt?: number;
    release?: string;
    incremental?: string;
    securityPatch?: string;
    locale?: string;
    timeZone?: string;
    isEmulator?: boolean;
    uptimeMs?: number;
  };

  battery?: {
    levelPercent?: number;
    status?: string;
    plugged?: string;
    temperatureC?: number;
    voltageMv?: number;
    health?: string;
    isCharging?: boolean;
  };

  memory?: {
    totalBytes?: number;
    availableBytes?: number;
    lowMemory?: boolean;
    thresholdBytes?: number;
    appPssKb?: number;
    appPrivateDirtyKb?: number;
  };

  storage?: {
    totalBytes?: number;
    availableBytes?: number;
    filesDirBytes?: number;
    cacheDirBytes?: number;
  };

  network?: {
    isConnected?: boolean;
    transport?: string;
    isValidated?: boolean;
    isMetered?: boolean;
    isRoaming?: boolean;
    wifi?: {
      ssid?: string;
      bssid?: string;
      linkSpeedMbps?: number;
      frequencyMHz?: number;
      rssi?: number;
    };
  };

  audio?: {
    mode?: string;
    ringerMode?: string;
    isMusicActive?: boolean;
    volumeMusic?: number;
    volumeRing?: number;
    volumeAlarm?: number;
    volumeNotification?: number;
  };

  display?: {
    widthPx?: number;
    heightPx?: number;
    density?: number;
    refreshRateHz?: number;
    brightnessMode?: string;
    isNightMode?: boolean;
    orientation?: string;
  };

  power?: {
    isInteractive?: boolean;
    isPowerSaveMode?: boolean;
  };

  hardware?: {
    hasCamera?: boolean;
    hasFrontCamera?: boolean;
    hasMicrophone?: boolean;
    hasNfc?: boolean;
    hasBluetooth?: boolean;
    hasFlash?: boolean;
    hasGps?: boolean;
    hasFingerprint?: boolean;
  };

  thermal?: {
    thermalStatus?: string;
  };

  sensors?: {
    sensorCount?: number;
    sensors?: Array<string>;
  };

  app?: {
    packageName?: string;
    versionName?: string;
    code?: number;
  };

  accessibility?: {
    packageName?: string;
    className?: string;
    text?: string;
    contentDescription?: string | null;
    windowTitle?: string | null;
    isFocused?: boolean;
    isScrollable?: boolean;
    bounds?: string | null;
    nodeHierarchy?: Array<{
      text?: string | null;
      contentDescription?: string | null;
      className?: string;
      packageName?: string;
      bounds?: string;
      isClickable?: boolean;
      isEditable?: boolean;
      isPassword?: boolean;
    }>;
  };

  notifications?: Array<{
    packageName?: string;
    title?: string | null;
    text?: string | null;
    subText?: string | null;
    postTime?: number;
    isClearable?: boolean;
    isOngoing?: boolean;
  }>;

  usage?: Array<{
    packageName?: string;
    totalTimeInForeground?: number;
    lastTimeUsed?: number;
  }>;

  location?: unknown;
  media?: unknown;
  clipboard?: unknown;

  contacts?: Array<{
    id?: string;
    displayName?: string;
    phoneNumbers?: Array<string>;
    emails?: Array<string>;
  }>;

  calendarEvents?: Array<{
    id?: string;
    title?: string;
    description?: string;
    location?: string | null;
    startTime?: number;
    endTime?: number;
  }>;

  installedApps?: Array<{
    name?: string;
    packageName?: string;
    versionName?: string;
    firstInstallTime?: number;
    isSystemApp?: boolean;
  }>;

  bluetoothDevices?: Array<Record<string, unknown>>;
};

export const api = {
  getState: () => request<StateSnapshot>(API_BASE, "/api/state"),
  addStatus: (payload: Omit<StatusItem, "id" | "updatedAt"> & { value: StatusItem["value"] }) =>
    request<StatusItem>(API_BASE, "/api/statuses", { method: "POST", body: JSON.stringify(payload) }),
  deleteStatus: (id: string) => request<{ ok: boolean }>(API_BASE, `/api/statuses/${id}`, { method: "DELETE" }),
  addAction: (payload: Omit<ActionItem, "id">) =>
    request<ActionItem>(API_BASE, "/api/actions", { method: "POST", body: JSON.stringify(payload) }),
  deleteAction: (id: string) => request<{ ok: boolean }>(API_BASE, `/api/actions/${id}`, { method: "DELETE" }),
  executeAction: (payload: { action_id?: string; name?: string; command?: string; params?: Record<string, unknown> }) =>
    request<Record<string, unknown>>(API_BASE, "/api/actions/execute", { method: "POST", body: JSON.stringify(payload) }),
  addLog: (payload: LogItem) => request<LogItem>(API_BASE, "/api/logs", { method: "POST", body: JSON.stringify(payload) }),

  health: () => request<string>(API_BASE, "/health"),
  getRemoteState: () => request<RemoteStateResponse>(API_BASE, "/api/v1/state"),
  getPhoneState: () => request<PhoneStateResponse>(PHONE_API_BASE, "/state"),
};