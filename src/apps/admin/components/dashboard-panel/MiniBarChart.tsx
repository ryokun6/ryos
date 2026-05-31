import { cn } from "@/lib/utils";
import type { DailyMetrics } from "./types";
import { formatDateLabel, formatNumber } from "./utils";

export function MiniBarChart({
  data,
  valueKey,
  color = "bg-neutral-400",
  height = 64,
}: {
  data: DailyMetrics[];
  valueKey: keyof DailyMetrics;
  color?: string;
  height?: number;
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * height);
        return (
          <div
            key={data[i].date}
            className="flex flex-col items-center flex-1 min-w-0 group relative"
            style={{ height }}
          >
            <div className="flex-1" />
            <div
              className={cn("w-full rounded-t-sm transition-all", color)}
              style={{ height: barH }}
            />
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
              {formatDateLabel(data[i].date)}: {formatNumber(v)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
