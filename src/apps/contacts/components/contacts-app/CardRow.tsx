import { type ReactNode } from "react";

export function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start py-[5px]">
      <div className="w-16 shrink-0 text-right text-[11px] font-bold text-black/50 pr-2 pt-px">{label}</div>
      <div className="flex-1 min-w-0 break-words text-[12px]">{children}</div>
    </div>
  );
}
