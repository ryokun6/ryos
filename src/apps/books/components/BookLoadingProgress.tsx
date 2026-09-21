import { cn } from "@/lib/utils";

/** Unknown length and EPUB layout remain indeterminate; bytes use real progress. */
export function BookLoadingProgress({ label, percentage }: { label: string; percentage?: number }) {
  const value = percentage !== undefined && Number.isFinite(percentage)
    ? Math.max(0, Math.min(99, percentage)) : undefined;
  return (
    <div className="w-40" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: "color-mix(in srgb, currentColor 15%, transparent)" }}>
        <div className={cn("h-full rounded-full bg-current transition-[width]",
          value === undefined && "animate-pulse")}
          style={{ width: value === undefined ? "40%" : `${Math.max(2, value)}%` }} />
      </div>
    </div>
  );
}
