import { Trash2 } from "lucide-react";
import type { LogItem, LogLevel } from "../types";
import { shortTime } from "../lib/utils";
import { Badge } from "./Badge";
import { IconButton } from "./IconButton";

export function LogView({
  items,
  filter,
  onFilterChange,
  onDelete,
}: {
  items: LogItem[];
  filter: "all" | LogLevel;
  onFilterChange: (value: "all" | LogLevel) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "info", "success", "warning", "error"] as const).map((lv) => (
          <button
            key={lv}
            onClick={() => onFilterChange(lv)}
            className={
              filter === lv
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-slate-900"
                : "rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            }
          >
            {lv === "all" ? "全て" : lv}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            ログがありません
          </div>
        ) : (
          items.map((log) => (
            <div key={log.id} className="group rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      tone={log.level === "success" ? "green" : log.level === "warning" ? "amber" : log.level === "error" ? "red" : "slate"}
                    >
                      {log.level}
                    </Badge>
                    <span className="text-xs text-slate-500">{shortTime(log.time)}</span>
                  </div>
                  <p className="break-words text-sm text-slate-700">{log.message}</p>
                </div>
                <IconButton onClick={() => onDelete(log.id)} title="削除">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
