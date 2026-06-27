import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Bug, Check, Copy, Trash, X } from "@phosphor-icons/react";
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

const LEVEL_TEXT_CLASS: Record<ConsoleLogLevel, string> = {
  log: "text-os-text-primary",
  info: "text-blue-500",
  debug: "text-purple-500",
  warn: "text-amber-500",
  error: "text-red-500",
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Floating, togglable console overlay shown only while Debug Mode is enabled
 * (Control Panels → System). Mirrors captured `console.*` output into an
 * in-app panel with a one-tap copy button so logs can be inspected on devices
 * where the browser dev tools are unavailable.
 */
export function DebugLogOverlay() {
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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 24;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [open, entries]);

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
              "flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0",
              "border-[color:var(--os-color-separator)]"
            )}
          >
            <Bug weight="fill" className="size-3.5 shrink-0 opacity-70" />
            <span className="text-[11px] font-semibold">Console</span>
            <span className="text-[10px] opacity-60">{entries.length}</span>
            {errorCount > 0 && (
              <span className="text-[10px] text-red-500">
                {errorCount} err
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-[10px] text-amber-500">
                {warnCount} warn
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleCopy}
                title="Copy logs"
                aria-label="Copy logs"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                {copied ? (
                  <Check weight="bold" className="size-3 text-green-500" />
                ) : (
                  <Copy weight="bold" className="size-3" />
                )}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                type="button"
                onClick={() => clearConsoleCapture()}
                title="Clear logs"
                aria-label="Clear logs"
                className="flex items-center rounded p-1 hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                <Trash weight="bold" className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close console"
                className="flex items-center rounded p-1 hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
              >
                <X weight="bold" className="size-3" />
              </button>
            </div>
          </div>

          {/* Log list */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]"
          >
            {entries.length === 0 ? (
              <div className="py-4 text-center text-[11px] opacity-50">
                No logs captured yet.
              </div>
            ) : (
              entries.map((entry: ConsoleLogEntry) => (
                <div
                  key={entry.id}
                  className="flex gap-1.5 border-b border-black/5 py-0.5 os-mac-aqua-dark:border-white/5"
                >
                  <span className="shrink-0 tabular-nums opacity-40">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre-wrap break-words",
                      LEVEL_TEXT_CLASS[entry.level]
                    )}
                  >
                    {entry.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide console" : "Show console"}
        aria-label={open ? "Hide console" : "Show console"}
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
        <span>Debug</span>
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
