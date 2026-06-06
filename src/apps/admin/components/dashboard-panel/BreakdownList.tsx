import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ProductBreakdown } from "./types";
import { formatNumber } from "./utils";
import { adminListDividerClass, adminTrackBgClass } from "../../utils/adminStyles";

export function BreakdownList({
  items,
  nameClassName,
  barClassName = "bg-neutral-400",
  emptyMessage = "No data yet",
  renderName,
}: {
  items: ProductBreakdown[];
  nameClassName?: string;
  barClassName?: string;
  emptyMessage?: string;
  renderName?: (name: string) => ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  const max = items[0]?.count || 1;
  return (
    <div className={adminListDividerClass}>
      {items.slice(0, 10).map((item) => (
        <div key={item.name} className="flex items-center gap-2 px-3 py-1.5">
          <span
            className={cn(
              "text-[11px] text-os-text-secondary flex-1 truncate",
              nameClassName
            )}
          >
            {renderName ? renderName(item.name) : item.name}
          </span>
          <div className="w-24 flex items-center gap-1.5">
            <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", adminTrackBgClass)}>
              <div
                className={cn("h-full rounded-full", barClassName)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-os-text-secondary w-8 text-right tabular-nums">
              {formatNumber(item.count)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
