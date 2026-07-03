import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  classifyNetworkStatus,
  type NetworkRequestEntry,
} from "@/utils/networkCapture";

interface DebugNetworkPanelProps {
  entries: readonly NetworkRequestEntry[];
  totalEntryCount: number;
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

const STICK_TO_BOTTOM_THRESHOLD = 24;

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
 * Network tab body. Renders recently captured `fetch` requests oldest-first so
 * the newest traffic appears at the bottom, sticking to the bottom as new
 * requests arrive and surfacing a "scroll to bottom" affordance once the user
 * scrolls up — matching the Logs tab. Method, status, and duration are shown so
 * API failures (especially 429 rate limits and 5xx errors) are visible without
 * browser dev tools.
 */
export function DebugNetworkPanel({
  entries,
  totalEntryCount,
}: DebugNetworkPanelProps) {
  const { t } = useTranslation();
  const pendingLabel = t("debug.network.pending");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    stickToBottomRef.current = atBottom;
    setIsAtBottom((previous) => (previous === atBottom ? previous : atBottom));
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    stickToBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  // Keep the view pinned to the newest request while the user is at the bottom,
  // and snap to the bottom on (re)mount so the latest traffic is visible.
  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]">
        <div className="py-4 text-center text-[11px] opacity-50">
          {totalEntryCount === 0
            ? t("debug.network.empty")
            : t("debug.network.emptyForFilter")}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-debug-network-scroll
        className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]"
      >
        {entries.map((entry) => {
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
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          data-debug-network-scroll-bottom
          title={t("debug.scrollToBottom")}
          aria-label={t("debug.scrollToBottom")}
          className={cn(
            "absolute bottom-2 right-3 flex items-center gap-1 rounded-full px-2 py-1",
            "border-[length:var(--os-metrics-border-width)] border-os-window",
            "bg-os-window-bg text-os-text-primary shadow-os-window",
            "font-os-ui text-[11px] hover:brightness-105 active:brightness-95"
          )}
        >
          <ArrowDown weight="bold" className="size-3" />
          <span>{t("debug.scrollToBottom")}</span>
        </button>
      )}
    </div>
  );
}
