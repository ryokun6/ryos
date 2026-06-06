import { cn } from "@/lib/utils";
import { adminCardClass, adminSectionLabelClass } from "../../utils/adminStyles";
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
    <div className={cn("flex flex-col gap-1 p-3", adminCardClass)}>
      <span className={adminSectionLabelClass}>
        {label}
      </span>
      <div className="text-[18px] font-semibold leading-tight text-os-text-primary">
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
                : "text-os-text-disabled"
          )}
        >
          {trend.value > 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </div>
      )}
    </div>
  );
}
