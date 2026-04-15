import React from "react";
import { cx } from "../lib/utils";

export function IconButton({
  onClick,
  children,
  className,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cx("rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700", className)}
    >
      {children}
    </button>
  );
}
