import { useEffect, useMemo, useRef, useState } from "react";
import { Cpu, Layers3, ListChecks, Monitor, Plus, Search, Smartphone, Terminal, Trash2, Wifi, Wind } from "lucide-react";
import remoteStateSections from "./data/remoteStateSections.json";
import { PanelCard } from "./components/PanelCard";
import { Badge } from "./components/Badge";
import { ActionList } from "./components/ActionList";
import { LogView } from "./components/LogView";
import phoneStateSections from "./data/phoneStateSections.json";
import { api, type PhoneStateResponse, type RemoteStateResponse } from "./lib/api";
import { emptySnapshot, loadLocalSnapshot, saveLocalSnapshot } from "./lib/storage";
import { now, parseStatusValue, uid } from "./lib/utils";
import type { ActionItem, LogItem, LogLevel, StatusItem, StateSnapshot } from "./types";

type RemoteSectionKey = string;

const defaultOpenSections = Object.fromEntries(
  (remoteStateSections as { sections: Array<{ key: string; defaultOpen?: boolean }> }).sections.map((section) => [
    section.key,
    Boolean(section.defaultOpen),
  ])
) as Record<RemoteSectionKey, boolean>;
const defaultPhoneOpenSections = Object.fromEntries(
  (phoneStateSections as { sections: Array<{ key: string; defaultOpen?: boolean }> }).sections.map((section) => [
    section.key,
    Boolean(section.defaultOpen),
  ])
) as Record<string, boolean>;

const initialSnapshot = (): StateSnapshot => {
  const local = loadLocalSnapshot();
  if (local) return local;

  return {
    statuses: [
      {
        id: uid(),
        name: "部屋在席",
        value: true,
        source: "camera",
        updatedAt: now(),
        description: "カメラ・動き・姿勢の統合結果",
      },
      {
        id: uid(),
        name: "PC使用中",
        value: true,
        source: "pc-agent",
        updatedAt: now(),
        description: "PCの常時アクティビティ報告",
      },
      {
        id: uid(),
        name: "スマホ使用中",
        value: false,
        source: "phone-agent",
        updatedAt: now(),
        description: "スマホの常時アクティビティ報告",
      },
      {
        id: uid(),
        name: "室温",
        value: 24.8,
        unit: "°C",
        source: "sensor",
        updatedAt: now(),
        description: "任意の環境センサー",
      },
    ],
    actions: [
      {
        id: uid(),
        name: "PCのChromeを開く",
        category: "PC",
        target: "pc",
        command: "open_app:chrome",
        description: "PC側のアプリ起動",
      },
      {
        id: uid(),
        name: "スマホ通知を送る",
        category: "スマホ",
        target: "phone",
        command: "send_notification:message",
        description: "スマホ連携",
      },
      {
        id: uid(),
        name: "エアコンをON",
        category: "家電",
        target: "ir",
        command: "ir_send:ac_on",
        description: "赤外線発信",
      },
      {
        id: uid(),
        name: "状態を保存",
        category: "システム",
        target: "server",
        command: "save_snapshot",
        description: "統合状態の保存",
      },
    ],
    logs: [
      { id: uid(), time: now(), level: "info", message: "管理画面を初期化しました" },
      { id: uid(), time: now(), level: "success", message: "統合状態を読み込みました" },
    ],
  };
};

export default function App() {
  const seed = initialSnapshot();

  const [statuses, setStatuses] = useState<StatusItem[]>(seed.statuses);
  const [actions, setActions] = useState<ActionItem[]>(seed.actions);
  const [logs, setLogs] = useState<LogItem[]>(seed.logs);
  const [search, setSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | LogLevel>("all");

  const [remoteState, setRemoteState] = useState<RemoteStateResponse | null>(null);
  const [healthOnline, setHealthOnline] = useState<boolean | null>(null);
  const [healthCheckedAt, setHealthCheckedAt] = useState("");
  const [remoteError, setRemoteError] = useState("");
  const [loadingMap, setLoadingMap] = useState<{ health?: boolean; state?: boolean; phone?: boolean }>({});
  const [openSections, setOpenSections] = useState<Record<RemoteSectionKey, boolean>>(defaultOpenSections);

  const [phoneState, setPhoneState] = useState<PhoneStateResponse | null>(null);
  const [phoneCheckedAt, setPhoneCheckedAt] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [openPhoneSections, setOpenPhoneSections] = useState<Record<string, boolean>>(defaultPhoneOpenSections);

  const [statusName, setStatusName] = useState("");
  const [statusValue, setStatusValue] = useState("");
  const [statusUnit, setStatusUnit] = useState("");
  const [statusSource, setStatusSource] = useState("");
  const [statusDescription, setStatusDescription] = useState("");

  const [actionName, setActionName] = useState("");
  const [actionCategory, setActionCategory] = useState("");
  const [actionTarget, setActionTarget] = useState("");
  const [actionCommand, setActionCommand] = useState("");
  const [actionDescription, setActionDescription] = useState("");

  const pollingRef = useRef(false);

  const toggleSection = (key: RemoteSectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };
  const togglePhoneSection = (key: string) => {
    setOpenPhoneSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };
  const addLog = (level: LogLevel, message: string) => {
    setLogs((prev) => [{ id: uid(), time: now(), level, message }, ...prev].slice(0, 200));
  };

  useEffect(() => {
    saveLocalSnapshot({ statuses, actions, logs });
  }, [statuses, actions, logs]);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      if (!alive || pollingRef.current) return;
      pollingRef.current = true;
      try {
        await Promise.all([loadState(), loadHealth(), loadPhoneState()]);
      } finally {
        pollingRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const loadPhoneState = async () => {
    setLoadingMap((prev) => ({ ...prev, phone: true }));
    setPhoneError("");
    try {
      const state = await api.getPhoneState();
      setPhoneState(state);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "phone stateの取得に失敗しました");
    } finally {
      setPhoneCheckedAt(now());
      setLoadingMap((prev) => ({ ...prev, phone: false }));
    }
  };
  const loadHealth = async () => {
    setLoadingMap((prev) => ({ ...prev, health: true }));
    setRemoteError("");
    try {
      await api.health();
      setHealthOnline(true);
    } catch {
      setHealthOnline(false);
    } finally {
      setHealthCheckedAt(now());
      setLoadingMap((prev) => ({ ...prev, health: false }));
    }
  };

  const loadState = async () => {
    setLoadingMap((prev) => ({ ...prev, state: true }));
    setRemoteError("");
    try {
      const state = await api.getRemoteState();
      setRemoteState(state);
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : "stateの取得に失敗しました");
    } finally {
      setLoadingMap((prev) => ({ ...prev, state: false }));
    }
  };

  const filteredStatuses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) =>
      [s.name, s.source, s.description, String(s.value), s.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [search, statuses]);

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      [a.name, a.category, a.target, a.command, a.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [search, actions]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const matchesQuery = !q || [l.message, l.level, l.time].join(" ").toLowerCase().includes(q);
      const matchesLevel = logFilter === "all" || l.level === logFilter;
      return matchesQuery && matchesLevel;
    });
  }, [search, logs, logFilter]);

  const registerStatus = async () => {
    if (!statusName.trim()) return;

    const payload = {
      name: statusName.trim(),
      value: parseStatusValue(statusValue.trim()),
      unit: statusUnit.trim() || undefined,
      source: statusSource.trim() || undefined,
      description: statusDescription.trim() || undefined,
    };

    try {
      const created = await api.addStatus(payload);
      setStatuses((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      addLog("success", `状態を追加しました: ${created.name}`);
      setStatusName("");
      setStatusValue("");
      setStatusUnit("");
      setStatusSource("");
      setStatusDescription("");
    } catch {
      const created: StatusItem = {
        id: uid(),
        name: payload.name,
        value: payload.value,
        unit: payload.unit,
        source: payload.source,
        description: payload.description,
        updatedAt: now(),
      };
      setStatuses((prev) => [created, ...prev]);
      addLog("warning", `APIに接続できないためローカルで状態を追加しました: ${created.name}`);
    }
  };

  const registerAction = async () => {
    if (!actionName.trim() || !actionCommand.trim()) return;

    const payload = {
      name: actionName.trim(),
      category: actionCategory.trim() || "未分類",
      target: actionTarget.trim() || "system",
      command: actionCommand.trim(),
      description: actionDescription.trim() || undefined,
    };

    try {
      const created = await api.addAction(payload);
      setActions((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
      addLog("success", `関数を追加しました: ${created.name}`);
      setActionName("");
      setActionCategory("");
      setActionTarget("");
      setActionCommand("");
      setActionDescription("");
    } catch {
      const created: ActionItem = { id: uid(), ...payload };
      setActions((prev) => [created, ...prev]);
      addLog("warning", `APIに接続できないためローカルで関数を追加しました: ${created.name}`);
    }
  };

  const executeAction = async (action: ActionItem) => {
    addLog("info", `実行要求: ${action.name} / ${action.command}`);

    try {
      await api.executeAction({ action_id: action.id, command: action.command, name: action.name });
      addLog("success", `実行しました: ${action.name}`);
    } catch {
      addLog("warning", `API実行に失敗しました: ${action.name}`);
    }
  };

  const deleteStatus = async (id: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteStatus(id);
      addLog("warning", "状態を削除しました");
    } catch {
      addLog("warning", "ローカルで状態を削除しました");
    }
  };

  const deleteAction = async (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.deleteAction(id);
      addLog("warning", "関数を削除しました");
    } catch {
      addLog("warning", "ローカルで関数を削除しました");
    }
  };

  const deleteLog = (id: string) => setLogs((prev) => prev.filter((l) => l.id !== id));

  const clearAll = async () => {
    const ok = window.confirm("状態・関数・ログをすべて消去しますか？");
    if (!ok) return;

    const snapshot = emptySnapshot();
    setStatuses(snapshot.statuses);
    setActions(snapshot.actions);
    setLogs(snapshot.logs);
    addLog("warning", "すべてのデータをリセットしました");
  };

  const copyCommand = async (action: ActionItem) => {
    await navigator.clipboard.writeText(action.command);
    addLog("info", `コマンドをコピーしました: ${action.command}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              <Layers3 className="h-3.5 w-3.5" /> ローカル統合管理画面
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ルーム関数・状態・ログの統合ダッシュボード</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              状態ダッシュボード、操作パネル、ログビューをひとつにまとめた、シンプルで直感的な管理UIです。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">Local First</Badge>
            <Badge tone="blue">Web UI</Badge>
            <Badge tone="slate">Simple</Badge>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              <Trash2 className="h-4 w-4" /> 全消去
            </button>
          </div>
        </header>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="状態・関数・ログを検索"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none ring-0 focus:border-slate-400"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="slate">状態 {filteredStatuses.length}</Badge>
              <Badge tone="slate">関数 {filteredActions.length}</Badge>
              <Badge tone="slate">ログ {filteredLogs.length}</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-1">
            <RemotePcPanel
              state={remoteState}
              healthOnline={healthOnline}
              healthCheckedAt={healthCheckedAt}
              loading={Boolean(loadingMap.state || loadingMap.health)}
              remoteError={remoteError}
              openSections={openSections}
              onToggleSection={toggleSection}
            />

            <RemotePhonePanel
              state={phoneState}
              checkedAt={phoneCheckedAt}
              loading={Boolean(loadingMap.phone)}
              remoteError={phoneError}
              openSections={openPhoneSections}
              onToggleSection={togglePhoneSection}
            />
          </div>

          <div className="space-y-5 xl:col-span-1">
            <PanelCard title="操作パネル" icon={<Terminal className="h-4 w-4" />}>
              <ActionList
                items={filteredActions}
                onDelete={deleteAction}
                onExecute={executeAction}
                onCopy={copyCommand}
                onAdd={() => addLog("info", "関数追加フォームを使用してください")}
              />

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Plus className="h-4 w-4" /> 関数を追加
                </div>
                <div className="grid gap-3">
                  <input
                    value={actionName}
                    onChange={(e) => setActionName(e.target.value)}
                    placeholder="例: エアコンをON"
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={actionCategory}
                      onChange={(e) => setActionCategory(e.target.value)}
                      placeholder="カテゴリ"
                      className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                    <input
                      value={actionTarget}
                      onChange={(e) => setActionTarget(e.target.value)}
                      placeholder="target"
                      className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    value={actionCommand}
                    onChange={(e) => setActionCommand(e.target.value)}
                    placeholder="例: ir_send:ac_on"
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={actionDescription}
                    onChange={(e) => setActionDescription(e.target.value)}
                    placeholder="説明"
                    rows={3}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={registerAction}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" /> 追加
                  </button>
                </div>
              </div>
            </PanelCard>
          </div>

          <div className="space-y-5 xl:col-span-1">
            <PanelCard title="ログビュー" icon={<ListChecks className="h-4 w-4" />}>
              <LogView items={filteredLogs} filter={logFilter} onFilterChange={setLogFilter} onDelete={deleteLog} />
            </PanelCard>

            <PanelCard title="接続・サマリー" icon={<Wifi className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Monitor className="h-4 w-4" /> PC
                  </div>
                  <p className="mt-2 text-sm text-slate-600">状態・操作・ログの送受信先として扱う</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Smartphone className="h-4 w-4" /> スマホ
                  </div>
                  <p className="mt-2 text-sm text-slate-600">アクティビティ報告と通知・操作を担当</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Wind className="h-4 w-4" /> ルーム関数
                  </div>
                  <p className="mt-2 text-sm text-slate-600">赤外線発信や外部APIの呼び出しを統一</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Cpu className="h-4 w-4" /> 実行基盤
                  </div>
                  <p className="mt-2 text-sm text-slate-600">FastAPIやWebSocketと接続しやすい構成</p>
                </div>
              </div>
            </PanelCard>
          </div>
        </div>

        <footer className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 shadow-sm">
          実運用では、`src/lib/api.ts` の `VITE_API_BASE` をFastAPIのURLに合わせてください。
        </footer>
      </div>
    </div>
  );
}

function formatBytes(value?: number) {
  if (value === undefined || value === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatNumber(value?: number) {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatPercent(value?: number) {
  if (value === undefined || value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function getValueByPath(obj: unknown, path: string) {
  if (obj === undefined || obj === null) return undefined;
  return path.split(".").reduce<any>((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    if (key === "length" && Array.isArray(acc)) return acc.length;
    return acc[key as keyof typeof acc];
  }, obj as any);
}

function formatWithUnit(value: unknown, unit?: string) {
  if (value === undefined || value === null || value === "") return "—";

  if (unit === "bytes" && typeof value === "number") return formatBytes(value);
  if (unit === "%") return typeof value === "number" ? formatPercent(value) : String(value);
  if (unit === "°C") return typeof value === "number" ? `${value.toFixed(1)} °C` : String(value);
  if (unit === "MHz") return `${formatNumber(typeof value === "number" ? value : Number(value))} MHz`;
  if (unit === "PID") return `PID ${String(value)}`;
  if (unit === "datetime") {
    const date = typeof value === "string" ? new Date(value) : new Date(Number(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ja-JP");
  }
  if (unit === "durationMs" && typeof value === "number") {
    const totalSeconds = Math.max(0, Math.floor(value / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }
  if (unit === "json") {
    try {
      return typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return unit ? `${String(value)} ${unit}` : typeof value === "number" ? formatNumber(value) : String(value);
}
function RemotePhonePanel({
  state,
  checkedAt,
  loading,
  remoteError,
  openSections,
  onToggleSection,
}: {
  state: PhoneStateResponse | null;
  checkedAt: string;
  loading: boolean;
  remoteError: string;
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
}) {
  const sections = (phoneStateSections as {
    sections: Array<{
      key: string;
      title: string;
      kind: "cards" | "progressCards" | "listCards" | "dualList";
      items?: Array<{ label: string; path: string; unit?: string }>;
      progress?: { label: string; path: string; unit?: string; ratioPath?: string };
      list?: {
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
      left?: {
        title: string;
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
      right?: {
        title: string;
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
    }>;
  }).sections;

  const contextState = (state ?? {}) as Record<string, unknown>;
  const deviceLabel = [state?.device?.manufacturer, state?.device?.model].filter(Boolean).join(" ") || "—";
  const batteryLabel =
    state?.battery?.levelPercent !== undefined
      ? `${formatPercent(state.battery.levelPercent)} / ${state.battery.status ?? "—"}`
      : "—";

  return (
    <PanelCard title="スマホ状態ダッシュボード" icon={<Smartphone className="h-4 w-4" />}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="収集時刻" value={formatWithUnit(state?.collectedAt, "datetime")} />
        <MiniStat label="端末" value={deviceLabel} />
        <MiniStat label="バッテリー" value={batteryLabel} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">checked at</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{checkedAt || "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">state</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{loading ? "loading..." : state ? "loaded" : "—"}</div>
        </div>
      </div>

      {remoteError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{remoteError}</div>}

      <div className="grid gap-4">
        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            title={section.title}
            loading={loading}
            isOpen={Boolean(openSections[section.key])}
            onToggle={() => onToggleSection(section.key)}
          >
            <RemoteSectionRenderer section={section} state={contextState} />
          </SectionBlock>
        ))}
      </div>
    </PanelCard>
  );
}
function RemotePcPanel({
  state,
  healthOnline,
  healthCheckedAt,
  loading,
  remoteError,
  openSections,
  onToggleSection,
}: {
  state: RemoteStateResponse | null;
  healthOnline: boolean | null;
  healthCheckedAt: string;
  loading: boolean;
  remoteError: string;
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
}) {
  const sections = (remoteStateSections as {
    sections: Array<{
      key: string;
      title: string;
      kind: "cards" | "progressCards" | "listCards" | "dualList";
      items?: Array<{ label: string; path: string; unit?: string }>;
      progress?: { label: string; path: string; unit?: string; ratioPath?: string };
      list?: {
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
      left?: {
        title: string;
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
      right?: {
        title: string;
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      };
    }>;
  }).sections;

  const summary = state?.summary as Record<string, unknown> | undefined;
  const system = state?.system as Record<string, unknown> | undefined;
  const cpu = state?.cpu as Record<string, unknown> | undefined;
  const memory = state?.memory as Record<string, unknown> | undefined;
  const storage = state?.storage as Record<string, unknown> | undefined;
  const network = state?.network as Record<string, unknown> | undefined;
  const gpu = state?.gpu as Record<string, unknown> | undefined;
  const battery = state?.battery as Record<string, unknown> | undefined;
  const services = state?.services as Record<string, unknown> | undefined;
  const processes = state?.processes as Record<string, unknown> | undefined;
  const sensors = state?.sensors as Record<string, unknown> | undefined;
  const mouse = state?.mouse as Record<string, unknown> | undefined;
  const discord = state?.discord as Record<string, unknown> | undefined;
  const discordVoice = state?.discord_voice as Record<string, unknown> | undefined;

  const contextState = {
    summary,
    system,
    cpu,
    memory,
    storage,
    network,
    gpu,
    battery,
    services,
    processes,
    sensors,
    mouse,
    discord,
    discord_voice: discordVoice,
  };

  return (
    <PanelCard title="PC状態ダッシュボード" icon={<Monitor className="h-4 w-4" />}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">health</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {healthOnline === null ? "未確認" : healthOnline ? "オンライン" : "オフライン"}
              </div>
            </div>
            <Badge tone={healthOnline ? "green" : healthOnline === false ? "red" : "slate"}>
              {healthOnline === null ? "—" : healthOnline ? "UP" : "DOWN"}
            </Badge>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">checked at</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{healthCheckedAt || "—"}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">state</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{loading ? "loading..." : state ? "loaded" : "—"}</div>
        </div>
      </div>

      {remoteError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{remoteError}</div>}

      <div className="grid gap-4">
        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            title={section.title}
            loading={loading}
            isOpen={Boolean(openSections[section.key])}
            onToggle={() => onToggleSection(section.key)}
          >
            <RemoteSectionRenderer section={section} state={contextState} />
          </SectionBlock>
        ))}
      </div>
    </PanelCard>
  );
}

function RemoteSectionRenderer({
  section,
  state,
}: {
  section: {
    key: string;
    title: string;
    kind: "cards" | "progressCards" | "listCards" | "dualList";
    items?: Array<{ label: string; path: string; unit?: string }>;
    progress?: { label: string; path: string; unit?: string; ratioPath?: string };
    list?: {
      path: string;
      emptyText?: string;
      titlePath: string;
      subtitlePaths?: Array<{ path: string; unit?: string }>;
      rightPath?: string;
      rightUnit?: string;
      footerPath?: string;
      footerUnit?: string;
    };
    left?: {
      title: string;
      path: string;
      emptyText?: string;
      titlePath: string;
      subtitlePaths?: Array<{ path: string; unit?: string }>;
      rightPath?: string;
      rightUnit?: string;
      footerPath?: string;
      footerUnit?: string;
    };
    right?: {
      title: string;
      path: string;
      emptyText?: string;
      titlePath: string;
      subtitlePaths?: Array<{ path: string; unit?: string }>;
      rightPath?: string;
      rightUnit?: string;
      footerPath?: string;
      footerUnit?: string;
    };
  };
  state: Record<string, unknown>;
}) {
  if (section.kind === "cards") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(section.items ?? []).map((item) => (
          <MiniStat key={item.label} label={item.label} value={formatWithUnit(getValueByPath(state, item.path), item.unit)} />
        ))}
      </div>
    );
  }

  if (section.kind === "progressCards") {
    const progressValue = getValueByPath(state, section.progress?.path ?? "");
    const ratioValue = section.progress?.ratioPath ? getValueByPath(state, section.progress.ratioPath) : undefined;
    const percent =
      section.progress?.unit === "%" && typeof progressValue === "number"
        ? progressValue
        : typeof progressValue === "number" && typeof ratioValue === "number" && ratioValue > 0
          ? (progressValue / ratioValue) * 100
          : undefined;

    return (
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">{section.progress?.label ?? ""}</div>
          <div className="mt-1 text-3xl font-bold">{percent === undefined ? "—" : formatPercent(percent)}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(section.items ?? []).map((item) => (
              <MiniStat key={item.label} label={item.label} value={formatWithUnit(getValueByPath(state, item.path), item.unit)} />
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">{renderList(section.list, getValueByPath(state, section.list?.path ?? ""))}</div>
        </div>
      </div>
    );
  }

  if (section.kind === "listCards") {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4">{renderList(section.list, getValueByPath(state, section.list?.path ?? ""))}</div>;
  }

  if (section.kind === "dualList") {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">{section.left?.title}</div>
          {renderList(section.left, getValueByPath(state, section.left?.path ?? ""))}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">{section.right?.title}</div>
          {renderList(section.right, getValueByPath(state, section.right?.path ?? ""))}
        </div>
      </div>
    );
  }

  return null;
}

function renderList(
  config:
    | {
        path: string;
        emptyText?: string;
        titlePath: string;
        subtitlePaths?: Array<{ path: string; unit?: string }>;
        rightPath?: string;
        rightUnit?: string;
        footerPath?: string;
        footerUnit?: string;
      }
    | undefined,
  value: unknown
) {
  const items = Array.isArray(value) ? value : [];

  if (!config) return <div className="text-sm text-slate-500">情報がありません</div>;
  if (!items.length) return <div className="text-sm text-slate-500">{config.emptyText ?? "情報がありません"}</div>;

  return (
    <div className="grid gap-2">
      {items.map((item, index) => {
        const rawTitle = getValueByPath(item, config.titlePath);
        const title =
          rawTitle !== undefined && rawTitle !== null
            ? typeof rawTitle === "object"
              ? JSON.stringify(rawTitle)
              : rawTitle
            : typeof item === "string" || typeof item === "number" || typeof item === "boolean"
              ? item
              : JSON.stringify(item);

        const subtitlePaths = config.subtitlePaths ?? [];
        const right = config.rightPath ? getValueByPath(item, config.rightPath) : undefined;
        const footer = config.footerPath ? getValueByPath(item, config.footerPath) : undefined;

        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-900">{String(title)}</div>
              {config.rightPath && <div className="text-slate-600">{formatWithUnit(right, config.rightUnit)}</div>}
            </div>

            <div className="mt-1 text-slate-600">
              {subtitlePaths.map((p, i) => (
                <span key={`${p.path}-${i}`}>
                  {i > 0 ? " / " : ""}
                  {formatWithUnit(getValueByPath(item, p.path), p.unit)}
                </span>
              ))}
            </div>

            {config.footerPath && <div className="mt-1 text-slate-600">{formatWithUnit(footer, config.footerUnit)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function SectionBlock({
  title,
  loading,
  children,
  isOpen,
  onToggle,
}: {
  title: string;
  loading?: boolean;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 p-4">
        <button onClick={onToggle} className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {isOpen ? "▼" : "▶"} {title}
        </button>
        {loading && <div className="text-xs text-slate-500">loading...</div>}
      </div>

      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}