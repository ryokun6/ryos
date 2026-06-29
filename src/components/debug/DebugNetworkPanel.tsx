import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  classifyNetworkStatus,
  type NetworkRequestEntry,
} from "@/utils/networkCapture";

interface DebugNetworkPanelProps {
  entries: readonly NetworkRequestEntry[];
}

const STATUS_TEXT_CLASS: Record<
  ReturnType<typeof classifyNetworkStatus>,
  string
> = {
  ok: "text-green-600",
  warn: "text-amber-500",
  error: "text-red-500",
  pending: "text-os-text-secondary",
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusText(entry: NetworkRequestEntry, pendingLabel: string): string {
  if (entry.outcome === "pending") return pendingLabel;
  if (entry.status !== null) return String(entry.status);
  return "ERR";
}

/**
 * Network tab body. Renders recently captured `fetch` requests (newest first)
 * with method, status, and duration so API failures — especially 429 rate
 * limits and 5xx errors — are visible without browser dev tools.
 */
export function DebugNetworkPanel({ entries }: DebugNetworkPanelProps) {
  const { t } = useTranslation();
  const pendingLabel = t("debug.network.pending");

  if (entries.length === 0) {
    return (
      <div className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]">
        <div className="py-4 text-center text-[11px] opacity-50">
          {t("debug.network.empty")}
        </div>
      </div>
    );
  }

  // Newest first so the most recent traffic is visible without scrolling.
  const ordered = [...entries].reverse();

  return (
    <div className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]">
      {ordered.map((entry) => {
        const severity = classifyNetworkStatus(entry.status, entry.outcome);
        return (
          <div
            key={entry.id}
            className="flex items-center gap-1.5 border-b border-black/5 py-0.5 os-mac-aqua-dark:border-white/5"
            title={entry.error ?? entry.url}
          >
            <span className="shrink-0 tabular-nums opacity-40">
              {formatTime(entry.startedAt)}
            </span>
            <span className="w-10 shrink-0 font-semibold uppercase opacity-70">
              {entry.method}
            </span>
            <span
              className={cn(
                "w-8 shrink-0 text-right tabular-nums font-semibold",
                STATUS_TEXT_CLASS[severity]
              )}
            >
              {statusText(entry, pendingLabel)}
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums opacity-50">
              {entry.durationMs !== null ? `${entry.durationMs}ms` : "—"}
            </span>
            <span className="min-w-0 flex-1 truncate text-os-text-primary">
              {entry.url}
            </span>
          </div>
        );
      })}
    </div>
  );
}
