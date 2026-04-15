import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  Layers3,
  ListChecks,
  Monitor,
  Plus,
  Search,
  Smartphone,
  Terminal,
  Trash2,
  Wifi,
  Wind,
  ScanSearch,
} from "lucide-react";
import { PanelCard } from "./components/PanelCard";
import { Badge } from "./components/Badge";
import { StatusList } from "./components/StatusList";
import { ActionList } from "./components/ActionList";
import { LogView } from "./components/LogView";
import { api } from "./lib/api";
import { emptySnapshot, loadLocalSnapshot, saveLocalSnapshot } from "./lib/storage";
import { now, parseStatusValue, uid } from "./lib/utils";
import type { ActionItem, LogItem, LogLevel, StatusItem, StateSnapshot } from "./types";

const initialSnapshot = (): StateSnapshot => {
  const local = loadLocalSnapshot();
  if (local) return local;

  return {
    statuses: [
      { id: uid(), name: "部屋在席", value: true, source: "camera", updatedAt: now(), description: "カメラ・動き・姿勢の統合結果" },
      { id: uid(), name: "PC使用中", value: true, source: "pc-agent", updatedAt: now(), description: "PCの常時アクティビティ報告" },
      { id: uid(), name: "スマホ使用中", value: false, source: "phone-agent", updatedAt: now(), description: "スマホの常時アクティビティ報告" },
      { id: uid(), name: "室温", value: 24.8, unit: "°C", source: "sensor", updatedAt: now(), description: "任意の環境センサー" },
    ],
    actions: [
      { id: uid(), name: "PCのChromeを開く", category: "PC", target: "pc", command: "open_app:chrome", description: "PC側のアプリ起動" },
      { id: uid(), name: "スマホ通知を送る", category: "スマホ", target: "phone", command: "send_notification:message", description: "スマホ連携" },
      { id: uid(), name: "エアコンをON", category: "家電", target: "ir", command: "ir_send:ac_on", description: "赤外線発信" },
      { id: uid(), name: "状態を保存", category: "システム", target: "server", command: "save_snapshot", description: "統合状態の保存" },
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

  const addLog = (level: LogLevel, message: string) => {
    setLogs((prev) => [{ id: uid(), time: now(), level, message }, ...prev].slice(0, 200));
  };

  useEffect(() => {
    saveLocalSnapshot({ statuses, actions, logs });
  }, [statuses, actions, logs]);

  useEffect(() => {
    const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://127.0.0.1:8000/ws";
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;

    const connect = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => addLog("success", "WebSocketに接続しました");
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown };
          if (msg.type === "hello") return;
          if (msg.type === "status_added" || msg.type === "status_updated") {
            const item = msg.payload as StatusItem;
            setStatuses((prev) => {
              const without = prev.filter((s) => s.id !== item.id);
              return [item, ...without];
            });
          }
          if (msg.type === "status_deleted") {
            const payload = msg.payload as { id: string };
            setStatuses((prev) => prev.filter((s) => s.id !== payload.id));
          }
          if (msg.type === "action_added") {
            const item = msg.payload as ActionItem;
            setActions((prev) => {
              const without = prev.filter((a) => a.id !== item.id);
              return [item, ...without];
            });
          }
          if (msg.type === "action_deleted") {
            const payload = msg.payload as { id: string };
            setActions((prev) => prev.filter((a) => a.id !== payload.id));
          }
          if (msg.type === "log_added") {
            const item = msg.payload as LogItem;
            setLogs((prev) => [item, ...prev].slice(0, 200));
          }
          if (msg.type === "action_executed") {
            addLog("info", "アクションが実行されました");
          }
        } catch {
          // ignore malformed messages
        }
      };
      socket.onclose = () => {
        retryTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  const filteredStatuses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) =>
      [s.name, s.source, s.description, String(s.value), s.unit].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [search, statuses]);

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      [a.name, a.category, a.target, a.command, a.description].filter(Boolean).join(" ").toLowerCase().includes(q)
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
            <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
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
              <Badge tone="slate">状態 {statuses.length}</Badge>
              <Badge tone="slate">関数 {actions.length}</Badge>
              <Badge tone="slate">ログ {logs.length}</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-1">
            <PanelCard title="状態ダッシュボード" icon={<Activity className="h-4 w-4" />}>
              <StatusList
                items={filteredStatuses}
                onDelete={deleteStatus}
                onAdd={() => addLog("info", "状態追加フォームを使用してください")}
              />

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Plus className="h-4 w-4" /> 状態を追加
                </div>
                <div className="grid gap-3">
                  <input value={statusName} onChange={(e) => setStatusName(e.target.value)} placeholder="例: エアコン状態" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <input value={statusValue} onChange={(e) => setStatusValue(e.target.value)} placeholder="例: true / 24.5 / idle" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={statusUnit} onChange={(e) => setStatusUnit(e.target.value)} placeholder="単位" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                    <input value={statusSource} onChange={(e) => setStatusSource(e.target.value)} placeholder="source" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                  <textarea value={statusDescription} onChange={(e) => setStatusDescription(e.target.value)} placeholder="説明" rows={3} className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <button onClick={registerStatus} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    <Plus className="h-4 w-4" /> 追加
                  </button>
                </div>
              </div>
            </PanelCard>
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
                  <input value={actionName} onChange={(e) => setActionName(e.target.value)} placeholder="例: エアコンをON" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={actionCategory} onChange={(e) => setActionCategory(e.target.value)} placeholder="カテゴリ" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                    <input value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} placeholder="target" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  </div>
                  <input value={actionCommand} onChange={(e) => setActionCommand(e.target.value)} placeholder="例: ir_send:ac_on" className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <textarea value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} placeholder="説明" rows={3} className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                  <button onClick={registerAction} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
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
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Monitor className="h-4 w-4" /> PC</div>
                  <p className="mt-2 text-sm text-slate-600">状態・操作・ログの送受信先として扱う</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Smartphone className="h-4 w-4" /> スマホ</div>
                  <p className="mt-2 text-sm text-slate-600">アクティビティ報告と通知・操作を担当</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Wind className="h-4 w-4" /> ルーム関数</div>
                  <p className="mt-2 text-sm text-slate-600">赤外線発信や外部APIの呼び出しを統一</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Cpu className="h-4 w-4" /> 実行基盤</div>
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
