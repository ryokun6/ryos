import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  Bug,
  CaretDown,
  Check,
  Copy,
  Trash,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { OS_NATIVE_CHROME_SKIP_CLASS } from "@/lib/themeChrome";
import type { AdminInitialData } from "@/apps/admin/types";
import {
  clearConsoleCapture,
  formatConsoleEntriesForCopy,
  getConsoleCaptureSnapshot,
  subscribeConsoleCapture,
  type ConsoleLogEntry,
  type ConsoleLogLevel,
} from "@/utils/consoleCapture";
import {
  classifyNetworkStatus,
  clearNetworkCapture,
  formatNetworkEntriesForCopy,
  getNetworkCaptureSnapshot,
  subscribeNetworkCapture,
} from "@/utils/networkCapture";
import { osCardClassName } from "@/components/shared/osThemePrimitives";
import { useTranslation } from "react-i18next";
import { DebugLiveDashboard } from "./DebugLiveDashboard";
import { DebugNetworkPanel } from "./DebugNetworkPanel";
import { getRestoredScrollTop } from "./debugLogVirtualization";

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
const LOGGER_TAG_RE = /^\[([^\]]+)\]/;
const ALL_LOGGERS_FILTER = "__all__";
const OTHER_LOGGER_FILTER = "__other__";
const ALL_NETWORK_FILTER = "all";
const NETWORK_FILTER_VALUES = [
  ALL_NETWORK_FILTER,
  "error",
  "warn",
  "ok",
  "pending",
] as const;
type NetworkFilter = (typeof NETWORK_FILTER_VALUES)[number];
type DebugPanelTab = "logs" | "live" | "network";

function extractLoggerTag(text: string): string | null {
  const match = text.match(LOGGER_TAG_RE);
  return match ? match[1] : null;
}

const DEBUG_FIX_PROMPT_HEADER =
  "Investigate these debug console logs and fix any errors in the ryOS codebase.";
const CURSOR_AGENT_PROMPT_MAX = 32_000;

function buildDebugFixPrompt(logText: string): string {
  const wrapperOverhead =
    DEBUG_FIX_PROMPT_HEADER.length + "\n\n```\n\n```".length + 32;
  const maxLogChars = Math.max(0, CURSOR_AGENT_PROMPT_MAX - wrapperOverhead);
  let logs = logText;
  if (logs.length > maxLogChars) {
    logs = `… (truncated — showing last ${maxLogChars} chars)\n${logs.slice(-maxLogChars)}`;
  }
  return `${DEBUG_FIX_PROMPT_HEADER}\n\n\`\`\`\n${logs}\n\`\`\``;
}

function LoggerFilterMenuLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <span className="flex flex-1 min-w-0 items-center justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-os-text-secondary">
        {count}
      </span>
    </span>
  );
}

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
 * (Control Panels → Accounts → Debug). Mirrors captured `console.*` output into an
 * in-app panel with a one-tap copy button so logs can be inspected on devices
 * where the browser dev tools are unavailable.
 */
export function DebugLogOverlay() {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const isRyoAdmin = useIsRyoAdmin();
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);
  const flags = useThemeFlags();
  const { isMacOSTheme, isWindowsTheme, metadata } = flags;
  const debugFabGapPx = 8;
  const debugFabBottom = isWindowsTheme
    ? `calc(env(safe-area-inset-bottom, 0px) + ${metadata.taskbarHeight + debugFabGapPx}px)`
    : `calc(env(safe-area-inset-bottom, 0px) + ${debugFabGapPx}px)`;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DebugPanelTab>("logs");
  const [loggerFilter, setLoggerFilter] = useState(ALL_LOGGERS_FILTER);
  const [networkFilter, setNetworkFilter] =
    useState<NetworkFilter>(ALL_NETWORK_FILTER);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveReportRef = useRef("");

  const entries = useSyncExternalStore(
    subscribeConsoleCapture,
    getConsoleCaptureSnapshot,
    getConsoleCaptureSnapshot
  );

  const networkEntries = useSyncExternalStore(
    subscribeNetworkCapture,
    getNetworkCaptureSnapshot,
    getNetworkCaptureSnapshot
  );

  const networkFilterOptions = useMemo(
    () =>
      NETWORK_FILTER_VALUES.map((value) => ({
        value,
        label:
          value === ALL_NETWORK_FILTER
            ? t("debug.network.filterAll")
            : t(`debug.network.filters.${value}`),
        count:
          value === ALL_NETWORK_FILTER
            ? networkEntries.length
            : networkEntries.reduce(
                (acc, entry) =>
                  classifyNetworkStatus(entry.status, entry.outcome) === value
                    ? acc + 1
                    : acc,
                0
              ),
      })),
    [networkEntries, t]
  );

  const filteredNetworkEntries = useMemo(() => {
    if (networkFilter === ALL_NETWORK_FILTER) return networkEntries;
    return networkEntries.filter(
      (entry) =>
        classifyNetworkStatus(entry.status, entry.outcome) === networkFilter
    );
  }, [networkEntries, networkFilter]);

  const networkFailedCount = useMemo(
    () =>
      filteredNetworkEntries.reduce(
        (acc, entry) =>
          classifyNetworkStatus(entry.status, entry.outcome) === "error"
            ? acc + 1
            : acc,
        0
      ),
    [filteredNetworkEntries]
  );

  const networkFilterTriggerLabel =
    networkFilterOptions.find((option) => option.value === networkFilter)
      ?.label ?? t("debug.network.filterAll");

  const networkCopyText = useMemo(
    () => formatNetworkEntriesForCopy(filteredNetworkEntries),
    [filteredNetworkEntries]
  );

  const loggerStats = useMemo(() => {
    const counts = new Map<string, number>();
    let otherCount = 0;
    for (const entry of entries) {
      const tag = extractLoggerTag(entry.text);
      if (tag) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      } else {
        otherCount += 1;
      }
    }
    const sorted = [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return { counts, sorted, otherCount };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (loggerFilter === ALL_LOGGERS_FILTER) return entries;
    if (loggerFilter === OTHER_LOGGER_FILTER) {
      return entries.filter((entry) => !extractLoggerTag(entry.text));
    }
    return entries.filter(
      (entry) => extractLoggerTag(entry.text) === loggerFilter
    );
  }, [entries, loggerFilter]);

  useEffect(() => {
    if (loggerFilter === ALL_LOGGERS_FILTER) return;
    if (loggerFilter === OTHER_LOGGER_FILTER) {
      if (loggerStats.otherCount === 0) setLoggerFilter(ALL_LOGGERS_FILTER);
      return;
    }
    if (!loggerStats.counts.has(loggerFilter)) {
      setLoggerFilter(ALL_LOGGERS_FILTER);
    }
  }, [loggerFilter, loggerStats]);

  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const pendingStickToBottomRef = useRef(false);
  const scrollTopRef = useRef(0);
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
    scrollTopRef.current = el.scrollTop;
    setIsAtBottom((previous) => (previous === atBottom ? previous : atBottom));
    setScrollTop(el.scrollTop);
  }, []);

  const { offsets, totalHeight } = useMemo(() => {
    let height = 0;
    const nextOffsets = filteredEntries.map((entry) => {
      const offset = height;
      height += rowHeightsRef.current.get(entry.id) ?? ESTIMATED_LOG_ROW_HEIGHT;
      return offset;
    });

    return { offsets: nextOffsets, totalHeight: height };
  }, [filteredEntries, heightRevision]);

  const virtualItems = useMemo(() => {
    if (filteredEntries.length === 0) return [];

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
      filteredEntries.length - 1,
      lastVisibleIndex + VIRTUAL_OVERSCAN
    );
    const items: Array<{
      entry: ConsoleLogEntry;
      index: number;
      start: number;
    }> = [];

    for (let index = startIndex; index <= endIndex; index += 1) {
      items.push({
        entry: filteredEntries[index],
        index,
        start: offsets[index],
      });
    }

    return items;
  }, [filteredEntries, offsets, scrollTop, totalHeight, viewportHeight]);

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
    scrollTopRef.current = el.scrollTop;
    setScrollTop(el.scrollTop);
  }, []);

  const handleClear = useCallback(() => {
    clearConsoleCapture();
    rowHeightsRef.current.clear();
    stickToBottomRef.current = true;
    pendingStickToBottomRef.current = false;
    setIsAtBottom(true);
    scrollTopRef.current = 0;
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
      scrollTopRef.current = 0;
      setScrollTop(0);
    }
  }, [entries]);

  useLayoutEffect(() => {
    if (!open || activeTab !== "logs") return;
    const el = scrollRef.current;
    if (!el) return;

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight);
    };
    const restoreVisibleScroller = () => {
      if (scrollRef.current !== el) return;
      const restoredScrollTop = getRestoredScrollTop({
        previousScrollTop: scrollTopRef.current,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        stickToBottom: stickToBottomRef.current,
      });
      el.scrollTop = restoredScrollTop;
      scrollTopRef.current = el.scrollTop;
      setScrollTop(el.scrollTop);
      updateViewportHeight();
      setHeightRevision((revision) => revision + 1);
    };

    restoreVisibleScroller();
    const animationFrameId = window.requestAnimationFrame(
      restoreVisibleScroller
    );
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeight);
      return () => {
        window.cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", updateViewportHeight);
      };
    }

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [activeTab, open]);

  useLayoutEffect(() => {
    if (!open || activeTab !== "logs") return;
    if (stickToBottomRef.current || pendingStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [activeTab, open, scrollToBottom, totalHeight]);

  const copyText = useMemo(
    () => formatConsoleEntriesForCopy(filteredEntries),
    [filteredEntries]
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
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
  }, []);

  const handleCopy = useCallback(() => {
    void copyToClipboard(copyText);
  }, [copyText, copyToClipboard]);

  const handleCopyLive = useCallback(() => {
    void copyToClipboard(liveReportRef.current);
  }, [copyToClipboard]);

  const handleCopyNetwork = useCallback(() => {
    void copyToClipboard(networkCopyText);
  }, [copyToClipboard, networkCopyText]);

  const handleClearNetwork = useCallback(() => {
    clearNetworkCapture();
  }, []);

  const handleLiveReportChange = useCallback((report: string) => {
    liveReportRef.current = report;
  }, []);

  const handleFix = useCallback(() => {
    const prompt = buildDebugFixPrompt(copyText);
    const initialData: AdminInitialData = {
      section: "cursorAgents",
      cursorAgentPrompt: prompt,
      autoStartCursorAgent: true,
      cursorAgentRequestId: `${Date.now()}-${entries.length}`,
    };
    launchApp("admin", { initialData });
  }, [copyText, entries.length, launchApp]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  if (!debugMode) return null;

  const errorCount = filteredEntries.reduce(
    (acc, e) => (e.level === "error" ? acc + 1 : acc),
    0
  );
  const warnCount = filteredEntries.reduce(
    (acc, e) => (e.level === "warn" ? acc + 1 : acc),
    0
  );
  const fabErrorCount = entries.reduce(
    (acc, e) => (e.level === "error" ? acc + 1 : acc),
    0
  );
  const fabWarnCount = entries.reduce(
    (acc, e) => (e.level === "warn" ? acc + 1 : acc),
    0
  );

  const filterTriggerLabel =
    loggerFilter === ALL_LOGGERS_FILTER
      ? t("debug.console")
      : loggerFilter === OTHER_LOGGER_FILTER
        ? t("debug.filterOther")
        : loggerFilter;

  return (
    <div
      ref={overlayRootRef}
      className={cn(
        "fixed select-none flex flex-col",
        OS_NATIVE_CHROME_SKIP_CLASS,
        isWindowsTheme ? "right-2 items-end" : "left-2 items-start"
      )}
      style={{
        bottom: debugFabBottom,
        zIndex: 2147483000,
      }}
    >
      {open && (
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(
              value === "live"
                ? "live"
                : value === "network"
                  ? "network"
                  : "logs"
            )
          }
          className={cn(
            isMacOSTheme
              ? cn(
                  "window is-foreground flex flex-col overflow-hidden rounded-[0.5rem] font-geneva-12 text-os-text-primary",
                  flags.isAquaGlass && "window-material-glass"
                )
              : osCardClassName(flags, { embed: "panel" }),
            "mb-2 h-[min(60vh,420px)] w-[min(92vw,440px)] shadow-os-window"
          )}
          style={
            isMacOSTheme && !flags.isAquaGlass
              ? {
                  backgroundColor: "var(--os-color-window-bg)",
                  backgroundImage: "var(--os-pinstripe-window)",
                }
              : undefined
          }
        >
          {/* Header */}
          <div
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 border-b px-2 py-1",
              "border-[color:var(--os-color-separator)]",
              isMacOSTheme ? "bg-transparent" : "bg-os-panel-bg"
            )}
          >
            {activeTab === "logs" ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("debug.filterByLogger")}
                      title={t("debug.filterByLogger")}
                      className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-os-ui text-[12px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
                    >
                      <span className="truncate">{filterTriggerLabel}</span>
                      <span className="shrink-0 tabular-nums opacity-60">
                        {filteredEntries.length}
                      </span>
                      <CaretDown
                        size={10}
                        weight="bold"
                        className="shrink-0 opacity-50"
                        aria-hidden
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={4}
                    container={overlayRootRef.current}
                    className="min-w-[12rem]"
                  >
                    <DropdownMenuRadioGroup
                      value={loggerFilter}
                      onValueChange={setLoggerFilter}
                    >
                      <DropdownMenuRadioItem
                        value={ALL_LOGGERS_FILTER}
                        className="font-os-ui text-[12px]"
                      >
                        <LoggerFilterMenuLabel
                          label={t("debug.filterAll")}
                          count={entries.length}
                        />
                      </DropdownMenuRadioItem>
                      {loggerStats.sorted.map(([tag, count]) => (
                        <DropdownMenuRadioItem
                          key={tag}
                          value={tag}
                          className="font-os-ui text-[12px]"
                        >
                          <LoggerFilterMenuLabel label={tag} count={count} />
                        </DropdownMenuRadioItem>
                      ))}
                      {loggerStats.otherCount > 0 ? (
                        <DropdownMenuRadioItem
                          value={OTHER_LOGGER_FILTER}
                          className="font-os-ui text-[12px]"
                        >
                          <LoggerFilterMenuLabel
                            label={t("debug.filterOther")}
                            count={loggerStats.otherCount}
                          />
                        </DropdownMenuRadioItem>
                      ) : null}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {errorCount > 0 && (
                  <span className="shrink-0 font-os-ui text-[12px] text-red-500">
                    {t("debug.errorCount", { count: errorCount })}
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="shrink-0 font-os-ui text-[12px] text-amber-500">
                    {t("debug.warnCount", { count: warnCount })}
                  </span>
                )}
              </>
            ) : activeTab === "network" ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("debug.network.filterRequests")}
                      title={t("debug.network.filterRequests")}
                      className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-os-ui text-[12px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
                    >
                      <span className="truncate">
                        {networkFilterTriggerLabel}
                      </span>
                      <span className="shrink-0 tabular-nums opacity-60">
                        {filteredNetworkEntries.length}
                      </span>
                      <CaretDown
                        size={10}
                        weight="bold"
                        className="shrink-0 opacity-50"
                        aria-hidden
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={4}
                    container={overlayRootRef.current}
                    className="min-w-[12rem]"
                  >
                    <DropdownMenuRadioGroup
                      value={networkFilter}
                      onValueChange={(value) =>
                        setNetworkFilter(value as NetworkFilter)
                      }
                    >
                      {networkFilterOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                          className="font-os-ui text-[12px]"
                        >
                          <LoggerFilterMenuLabel
                            label={option.label}
                            count={option.count}
                          />
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {networkFailedCount > 0 && (
                  <span className="shrink-0 font-os-ui text-[12px] text-red-500">
                    {t("debug.network.failedCount", {
                      count: networkFailedCount,
                    })}
                  </span>
                )}
              </>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {activeTab === "logs" ? (
                isRyoAdmin ? (
                  <button
                    type="button"
                    onClick={handleFix}
                    title={t("debug.fixLogs")}
                    aria-label={t("debug.fixLogs")}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 font-os-ui text-[12px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
                  >
                    <Wrench weight="bold" className="size-3.5" />
                    <span>{t("debug.fix")}</span>
                  </button>
                ) : null
              ) : null}
              <button
                type="button"
                onClick={
                  activeTab === "logs"
                    ? handleCopy
                    : activeTab === "network"
                      ? handleCopyNetwork
                      : handleCopyLive
                }
                title={
                  activeTab === "logs"
                    ? t("debug.copyLogs")
                    : activeTab === "network"
                      ? t("debug.network.copy")
                      : t("debug.live.copySnapshot")
                }
                aria-label={
                  activeTab === "logs"
                    ? t("debug.copyLogs")
                    : activeTab === "network"
                      ? t("debug.network.copy")
                      : t("debug.live.copySnapshot")
                }
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-os-ui text-[12px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                {copied ? (
                  <Check weight="bold" className="size-3.5 text-green-500" />
                ) : (
                  <Copy weight="bold" className="size-3.5" />
                )}
                <span>{copied ? t("debug.copied") : t("debug.copy")}</span>
              </button>
              {activeTab === "logs" || activeTab === "network" ? (
                <button
                  type="button"
                  onClick={
                    activeTab === "logs" ? handleClear : handleClearNetwork
                  }
                  title={
                    activeTab === "logs"
                      ? t("debug.clearLogs")
                      : t("debug.network.clear")
                  }
                  aria-label={
                    activeTab === "logs"
                      ? t("debug.clearLogs")
                      : t("debug.network.clear")
                  }
                  className="flex items-center rounded p-1 hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
                >
                  <Trash weight="bold" className="size-3" />
                </button>
              ) : null}
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
          <TabsContent
            value="logs"
            className={cn(
              "relative mt-0 min-h-0 flex-1 overflow-hidden",
              isMacOSTheme ? "bg-transparent" : "bg-os-window-bg"
            )}
          >
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
              ) : filteredEntries.length === 0 ? (
                <div className="py-4 text-center text-[11px] opacity-50">
                  {t("debug.noLogsForFilter")}
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
                        {entry.styledSegments
                          ? entry.styledSegments.map((segment, segmentIndex) => (
                              <span
                                key={`${entry.id}-${segmentIndex}`}
                                style={segment.style as CSSProperties | undefined}
                              >
                                {segment.text}
                              </span>
                            ))
                          : entry.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {filteredEntries.length > 0 && !isAtBottom && (
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
          </TabsContent>
          <TabsContent
            value="live"
            className={cn(
              "relative mt-0 min-h-0 flex-1 overflow-hidden",
              isMacOSTheme ? "bg-transparent" : "bg-os-window-bg"
            )}
          >
            <DebugLiveDashboard
              active={open && activeTab === "live"}
              entries={entries}
              onReportChange={handleLiveReportChange}
            />
          </TabsContent>
          <TabsContent
            value="network"
            className={cn(
              "relative mt-0 min-h-0 flex-1 overflow-hidden",
              isMacOSTheme ? "bg-transparent" : "bg-os-window-bg"
            )}
          >
            <DebugNetworkPanel
              entries={filteredNetworkEntries}
              totalEntryCount={networkEntries.length}
            />
          </TabsContent>
          <div
            className={cn(
              "flex h-8 shrink-0 items-center justify-center border-t px-2 py-1",
              "border-[color:var(--os-color-separator)]",
              isMacOSTheme ? "bg-transparent" : "bg-os-panel-bg"
            )}
          >
            <TabsList
              aria-label={t("debug.tabs.label")}
              className="h-6 shrink-0 gap-0.5 rounded-none bg-transparent p-0 text-os-text-secondary"
            >
              <TabsTrigger
                value="logs"
                className={cn(
                  "h-5 rounded px-2.5 py-0 font-os-mono text-[10px] shadow-none transition-none",
                  "border border-transparent",
                  "data-[state=active]:bg-os-selection-bg data-[state=active]:text-os-selection-text data-[state=active]:shadow-none",
                  "focus-visible:ring-1 focus-visible:ring-os-selection-bg focus-visible:ring-offset-0",
                  "os-theme-system7:rounded-none os-windows:rounded-none"
                )}
              >
                {t("debug.tabs.logs")}
              </TabsTrigger>
              <TabsTrigger
                value="live"
                className={cn(
                  "h-5 rounded px-2.5 py-0 font-os-mono text-[10px] shadow-none transition-none",
                  "border border-transparent",
                  "data-[state=active]:bg-os-selection-bg data-[state=active]:text-os-selection-text data-[state=active]:shadow-none",
                  "focus-visible:ring-1 focus-visible:ring-os-selection-bg focus-visible:ring-offset-0",
                  "os-theme-system7:rounded-none os-windows:rounded-none"
                )}
              >
                {t("debug.tabs.live")}
              </TabsTrigger>
              <TabsTrigger
                value="network"
                className={cn(
                  "h-5 rounded px-2.5 py-0 font-os-mono text-[10px] shadow-none transition-none",
                  "border border-transparent",
                  "data-[state=active]:bg-os-selection-bg data-[state=active]:text-os-selection-text data-[state=active]:shadow-none",
                  "focus-visible:ring-1 focus-visible:ring-os-selection-bg focus-visible:ring-offset-0",
                  "os-theme-system7:rounded-none os-windows:rounded-none"
                )}
              >
                {t("debug.tabs.network")}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
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
          "bg-os-window-bg text-os-text-secondary font-os-mono text-[10px]",
          "hover:brightness-105 active:brightness-95",
          open && "ring-1 ring-os-selection-bg"
        )}
      >
        <Bug weight="fill" className="size-3.5" />
        <span>{t("debug.toggleLabel")}</span>
        {(fabErrorCount > 0 || fabWarnCount > 0) && (
          <span
            className={cn(
              "min-w-[14px] rounded-full px-1 text-center text-[9px] font-bold text-white",
              fabErrorCount > 0 ? "bg-red-500" : "bg-amber-500"
            )}
          >
            {fabErrorCount > 0 ? fabErrorCount : fabWarnCount}
          </span>
        )}
      </button>
    </div>
  );
}
