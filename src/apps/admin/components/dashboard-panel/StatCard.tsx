import { cn } from "@/lib/utils";
import type { TrendInfo } from "./types";

export function StatCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: TrendInfo;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 bg-white rounded border border-neutral-200">
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <div className="text-[18px] font-semibold leading-tight text-neutral-800">
        {value}
      </div>
      {trend && (
        <div
          className={cn(
            "text-[10px]",
            trend.value > 0
              ? "text-green-600"
              : trend.value < 0
                ? "text-red-500"
                : "text-neutral-400"
          )}
        >
          {trend.value > 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </div>
      )}
    </div>
  );
}
