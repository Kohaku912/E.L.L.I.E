import { Trash2, Plus } from "lucide-react";
import { Badge } from "./Badge";
import type { StatusItem } from "../types";
import { shortTime } from "../lib/utils";
import { IconButton } from "./IconButton";

export function StatusList({
  items,
  onDelete,
  onAdd,
}: {
  items: StatusItem[];
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          状態がありません
        </div>
      ) : (
        items.map((s) => {
          const displayValue = typeof s.value === "boolean" ? (s.value ? "ON" : "OFF") : `${s.value}${s.unit ?? ""}`;
          const tone = typeof s.value === "boolean" ? (s.value ? "green" : "slate") : "blue";

          return (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{s.name}</h3>
                    <Badge tone={tone}>{displayValue}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {s.source ?? "source: -"} ・ {shortTime(s.updatedAt)}
                  </p>
                  {s.description ? <p className="mt-2 text-sm text-slate-600">{s.description}</p> : null}
                </div>
                <IconButton onClick={() => onDelete(s.id)} title="削除">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          );
        })
      )}

      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" /> 状態を追加
      </button>
    </div>
  );
}
