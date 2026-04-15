import React from "react";
import { cx } from "../lib/utils";

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
    red: "bg-rose-100 text-rose-700 ring-rose-200",
    blue: "bg-sky-100 text-sky-700 ring-sky-200",
  };

  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1", map[tone])}>
      {children}
    </span>
  );
}
