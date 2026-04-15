import { CheckCircle2, Plus, ScanSearch, Trash2 } from "lucide-react";
import type { ActionItem } from "../types";
import { Badge } from "./Badge";
import { IconButton } from "./IconButton";

export function ActionList({
  items,
  onDelete,
  onExecute,
  onCopy,
  onAdd,
}: {
  items: ActionItem[];
  onDelete: (id: string) => void;
  onExecute: (item: ActionItem) => void;
  onCopy: (item: ActionItem) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          関数がありません
        </div>
      ) : (
        items.map((a) => (
          <div key={a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{a.name}</h3>
                  <Badge tone="blue">{a.category}</Badge>
                  <Badge tone="slate">{a.target}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{a.command}</p>
                {a.description ? <p className="mt-2 text-sm text-slate-600">{a.description}</p> : null}
              </div>
              <IconButton onClick={() => onDelete(a.id)} title="削除">
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => onExecute(a)}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                <CheckCircle2 className="h-4 w-4" /> 実行
              </button>
              <button
                onClick={() => onCopy(a)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                <ScanSearch className="h-4 w-4" /> コピー
              </button>
            </div>
          </div>
        ))
      )}

      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" /> 関数を追加
      </button>
    </div>
  );
}
