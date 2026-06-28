import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowDown, Bug, Check, Copy, Trash, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import {
  clearConsoleCapture,
  formatConsoleEntriesForCopy,
  getConsoleCaptureSnapshot,
  installConsoleCapture,
  subscribeConsoleCapture,
  type ConsoleLogEntry,
  type ConsoleLogLevel,
} from "@/utils/consoleCapture";
import { osCardClassName } from "@/components/shared/osThemePrimitives";
import { useTranslation } from "react-i18next";

const LEVEL_TEXT_CLASS: Record<ConsoleLogLevel, string> = {
  log: "text-os-text-primary",
  info: "text-blue-500",
  debug: "text-purple-500",
  warn: "text-amber-500",
  error: "text-red-500",
};

const ESTIMATED_LOG_ROW_HEIGHT = 22;
const VIRTUAL_OVERSCAN = 8;
const STICK_TO_BOTTOM_THRESHOLD = 24;

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}.${pad(d.getMilliseconds(), 3)}`;
}

function findFirstVisibleIndex(
  offsets: number[],
  totalHeight: number,
  scrollTop: number
): number {
  let low = 0;
  let high = offsets.length - 1;
  let result = offsets.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const rowBottom = mid === offsets.length - 1 ? totalHeight : offsets[mid + 1];

    if (rowBottom > scrollTop) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return Math.min(result, Math.max(0, offsets.length - 1));
}

/**
 * Floating, togglable console overlay shown only while Debug Mode is enabled
 * (Control Panels → System). Mirrors captured `console.*` output into an
 * in-app panel with a one-tap copy button so logs can be inspected on devices
 * where the browser dev tools are unavailable.
 */
export function DebugLogOverlay() {
  const { t } = useTranslation();
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);
  const flags = useThemeFlags();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure capture is running whenever the overlay is mounted (debug on).
  useEffect(() => {
    installConsoleCapture();
  }, []);

  const entries = useSyncExternalStore(
    subscribeConsoleCapture,
    getConsoleCaptureSnapshot,
    getConsoleCaptureSnapshot
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const pendingStickToBottomRef = useRef(false);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const [heightRevision, setHeightRevision] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    stickToBottomRef.current = atBottom;
    setIsAtBottom((previous) => (previous === atBottom ? previous : atBottom));
    setScrollTop(el.scrollTop);
  }, []);

  const { offsets, totalHeight } = useMemo(() => {
    let height = 0;
    const nextOffsets = entries.map((entry) => {
      const offset = height;
      height += rowHeightsRef.current.get(entry.id) ?? ESTIMATED_LOG_ROW_HEIGHT;
      return offset;
    });

    return { offsets: nextOffsets, totalHeight: height };
  }, [entries, heightRevision]);

  const virtualItems = useMemo(() => {
    if (entries.length === 0) return [];

    const visibleHeight = viewportHeight || ESTIMATED_LOG_ROW_HEIGHT;
    const firstVisibleIndex = findFirstVisibleIndex(
      offsets,
      totalHeight,
      scrollTop
    );
    const lastVisibleIndex = findFirstVisibleIndex(
      offsets,
      totalHeight,
      scrollTop + visibleHeight
    );
    const startIndex = Math.max(0, firstVisibleIndex - VIRTUAL_OVERSCAN);
    const endIndex = Math.min(
      entries.length - 1,
      lastVisibleIndex + VIRTUAL_OVERSCAN
    );
    const items: Array<{
      entry: ConsoleLogEntry;
      index: number;
      start: number;
    }> = [];

    for (let index = startIndex; index <= endIndex; index += 1) {
      items.push({ entry: entries[index], index, start: offsets[index] });
    }

    return items;
  }, [entries, offsets, scrollTop, totalHeight, viewportHeight]);

  const measureRow = useCallback(
    (entryId: number, node: HTMLDivElement | null) => {
      if (!node) return;
      const height = node.getBoundingClientRect().height;
      if (height <= 0) return;

      const previous = rowHeightsRef.current.get(entryId);
      if (previous === undefined || Math.abs(previous - height) > 0.5) {
        if (stickToBottomRef.current) pendingStickToBottomRef.current = true;
        rowHeightsRef.current.set(entryId, height);
        setHeightRevision((revision) => revision + 1);
      }
    },
    []
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    stickToBottomRef.current = true;
    pendingStickToBottomRef.current = false;
    setIsAtBottom(true);
    setScrollTop(el.scrollTop);
  }, []);

  const handleClear = useCallback(() => {
    clearConsoleCapture();
    rowHeightsRef.current.clear();
    stickToBottomRef.current = true;
    pendingStickToBottomRef.current = false;
    setIsAtBottom(true);
    setScrollTop(0);
  }, []);

  useEffect(() => {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const id of rowHeightsRef.current.keys()) {
      if (!ids.has(id)) rowHeightsRef.current.delete(id);
    }
    if (entries.length === 0) {
      stickToBottomRef.current = true;
      pendingStickToBottomRef.current = false;
      setIsAtBottom(true);
      setScrollTop(0);
    }
  }, [entries]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight);
    };

    updateViewportHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeight);
      return () => window.removeEventListener("resize", updateViewportHeight);
    }

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (stickToBottomRef.current || pendingStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [open, scrollToBottom, totalHeight]);

  const copyText = useMemo(
    () => formatConsoleEntriesForCopy(entries),
    [entries]
  );

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = copyText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can reject (permissions, insecure context) — ignore silently.
    }
  }, [copyText]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  if (!debugMode) return null;

  const errorCount = entries.reduce(
    (acc, e) => (e.level === "error" ? acc + 1 : acc),
    0
  );
  const warnCount = entries.reduce(
    (acc, e) => (e.level === "warn" ? acc + 1 : acc),
    0
  );

  return (
    <div
      className="fixed left-2 select-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        zIndex: 2147483000,
      }}
    >
      {open && (
        <div
          className={cn(
            osCardClassName(flags, {
              embed: "panel",
              className:
                "mb-2 w-[min(92vw,440px)] h-[min(60vh,420px)] shadow-os-window",
            })
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "flex items-center gap-1.5 pl-3 pr-2 py-1.5 border-b shrink-0",
              "border-[color:var(--os-color-separator)]"
            )}
          >
            <span className="font-os-ui text-[12px] font-semibold">
              {t("debug.console")}
            </span>
            <span className="font-os-ui text-[12px] opacity-60">
              {entries.length}
            </span>
            {errorCount > 0 && (
              <span className="font-os-ui text-[12px] text-red-500">
                {t("debug.errorCount", { count: errorCount })}
              </span>
            )}
            {warnCount > 0 && (
              <span className="font-os-ui text-[12px] text-amber-500">
                {t("debug.warnCount", { count: warnCount })}
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleCopy}
                title={t("debug.copyLogs")}
                aria-label={t("debug.copyLogs")}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-os-ui text-[12px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                {copied ? (
                  <Check weight="bold" className="size-3.5 text-green-500" />
                ) : (
                  <Copy weight="bold" className="size-3.5" />
                )}
                <span>{copied ? t("debug.copied") : t("debug.copy")}</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                title={t("debug.clearLogs")}
                aria-label={t("debug.clearLogs")}
                className="flex items-center rounded p-1 hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                <Trash weight="bold" className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title={t("common.window.close")}
                aria-label={t("debug.closeConsole")}
                className="flex items-center rounded p-1 hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                <X weight="bold" className="size-3" />
              </button>
            </div>
          </div>

          {/* Log list */}
          <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              data-debug-console-scroll
              className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]"
            >
              {entries.length === 0 ? (
                <div className="py-4 text-center text-[11px] opacity-50">
                  {t("debug.noLogsYet")}
                </div>
              ) : (
                <div
                  className="relative w-full"
                  style={{ height: `${totalHeight}px` }}
                >
                  {virtualItems.map(({ entry, index, start }) => (
                    <div
                      key={entry.id}
                      ref={(node) => measureRow(entry.id, node)}
                      className="absolute left-0 right-0 flex gap-1.5 border-b border-black/5 py-0.5 os-mac-aqua-dark:border-white/5"
                      style={{ transform: `translateY(${start}px)` }}
                      data-console-row-index={index}
                    >
                      <span className="shrink-0 tabular-nums opacity-40">
                        {formatTime(entry.timestamp)}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 whitespace-pre-wrap break-words",
                          LEVEL_TEXT_CLASS[entry.level]
                        )}
                      >
                        {entry.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {entries.length > 0 && !isAtBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                data-debug-console-scroll-bottom
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
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? t("debug.hideConsole") : t("debug.showConsole")}
        aria-label={open ? t("debug.hideConsole") : t("debug.showConsole")}
        aria-pressed={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 shadow-os-window",
          "border-[length:var(--os-metrics-border-width)] border-os-window",
          "bg-os-window-bg text-os-text-primary font-os-ui text-[11px] font-medium",
          "hover:brightness-105 active:brightness-95",
          open && "ring-1 ring-os-selection-bg"
        )}
      >
        <Bug weight="fill" className="size-3.5" />
        <span>{t("debug.toggleLabel")}</span>
        {(errorCount > 0 || warnCount > 0) && (
          <span
            className={cn(
              "min-w-[14px] rounded-full px-1 text-center text-[9px] font-bold text-white",
              errorCount > 0 ? "bg-red-500" : "bg-amber-500"
            )}
          >
            {errorCount > 0 ? errorCount : warnCount}
          </span>
        )}
      </button>
    </div>
  );
}
