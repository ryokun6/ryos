import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateLabel, formatNumber } from "./formatters";

/**
 * Shared chart components for the Admin Dashboard and Analytics panels.
 * Pure formatters (`formatNumber`, `formatDateLabel`) live in `./formatters`
 * to keep this file react-refresh friendly.
 */

export interface DailyDatum {
  date: string;
}

export function MiniBarChart<T extends DailyDatum>({
  data,
  valueKey,
  color = "bg-neutral-400",
  height = 64,
}: {
  data: T[];
  valueKey: keyof T;
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

export function StatCard({
  label,
  value,
  trend,
  color = "blue",
}: {
  label: string;
  value: string;
  trend?: { value: number; label: string };
  color?: "blue" | "green" | "yellow" | "red" | "neutral";
}) {
  const accent =
    color === "green"
      ? "border-l-green-300"
      : color === "yellow"
        ? "border-l-yellow-300"
        : color === "red"
          ? "border-l-red-300"
          : color === "neutral"
            ? "border-l-neutral-300"
            : "border-l-blue-300";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-3 bg-white rounded border border-gray-200 border-l-2",
        accent
      )}
    >
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

export interface BreakdownItem {
  name: string;
  count: number;
}

export function BreakdownList({
  items,
  nameClassName,
  emptyMessage = "No data yet",
  limit = 10,
  barColor = "bg-blue-400",
}: {
  items: BreakdownItem[];
  nameClassName?: string;
  emptyMessage?: string;
  limit?: number;
  barColor?: string;
}) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  const max = items[0]?.count || 1;
  return (
    <div className="divide-y divide-gray-100">
      {items.slice(0, limit).map((item) => (
        <div key={item.name} className="flex items-center gap-2 px-3 py-1.5">
          <span
            className={cn(
              "text-[11px] text-neutral-600 flex-1 truncate",
              nameClassName
            )}
          >
            {item.name}
          </span>
          <div className="w-24 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-500 w-8 text-right tabular-nums">
              {formatNumber(item.count)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  count,
  children,
  actions,
}: {
  title: string;
  count?: string | number;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 text-neutral-300 normal-case tracking-normal">
              ({count})
            </span>
          ) : null}
        </span>
        {actions}
      </div>
      {children}
    </div>
  );
}
