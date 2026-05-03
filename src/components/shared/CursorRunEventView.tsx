import type { ReactNode } from "react";
import { useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const LazyMarkdown = lazy(() =>
  Promise.all([import("react-markdown"), import("remark-gfm")]).then(
    ([{ default: ReactMarkdown }, { default: remarkGfm }]) => ({
      default: ({ children }: { children: string }) => (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      ),
    })
  )
);
import type { AssistantStreamSegment } from "@/lib/cursorSdkRunCoalesce";
import {
  mergeAssistantStream,
  mergeStatusParts,
  mergeThinkingText,
  mergeUserText,
} from "@/lib/cursorSdkRunCoalesce";

function safeJson(value: unknown, maxChars = 900): string {
  try {
    const s = JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
    return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const markdownStreamClass =
  "cursor-stream-md px-1 py-0.5 font-geneva-12 text-[12px] leading-snug text-gray-700 break-words dark:text-neutral-200";

const toolDisplayNameOverrides: Record<string, string> = {
  run_terminal_cmd: "Run terminal command",
  read_file: "Read file",
  edit_file: "Edit file",
  list_dir: "List directory",
  file_search: "Search files",
  grep_search: "Search text",
  web_search: "Search web",
};

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Tool";
  const override = toolDisplayNameOverrides[trimmed];
  if (override) return override;

  const words = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => (word.toLowerCase() === "cmd" ? "command" : word.toLowerCase()));

  if (words.length === 0) return "Tool";
  return words
    .map((word, idx) => (idx === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function truncateDetail(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return isRecord(candidate) ? candidate : null;
}

function pickString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function toolPayload(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) return null;
  return (
    getNestedRecord(input, "args") ??
    getNestedRecord(input, "input") ??
    getNestedRecord(input, "parameters") ??
    input
  );
}

function toolSecondaryInfo(input: unknown): string {
  if (typeof input === "string") return truncateDetail(input);
  const payload = toolPayload(input);
  if (!payload) return "";
  return pickString(payload, [
    "command",
    "cmd",
    "shell_command",
    "path",
    "filePath",
    "file_path",
    "target_file",
    "relative_workspace_path",
    "query",
    "pattern",
    "url",
    "description",
  ]);
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function isToolCallDone(ev: Record<string, unknown>): boolean {
  const status = typeof ev.status === "string" ? ev.status : "";
  return (
    status === "completed" ||
    status === "success" ||
    status === "finished" ||
    status === "error" ||
    ev.result !== undefined ||
    ev.error !== undefined
  );
}

function toolGroupSecondaryInfo(rows: Record<string, unknown>[]): string {
  if (rows.length <= 1) {
    const ev = isRecord(rows[0]?.ev) ? rows[0].ev : {};
    return toolSecondaryInfo(ev);
  }

  const uniqueDetails = Array.from(
    new Set(
      rows
        .map((row) => (isRecord(row.ev) ? toolSecondaryInfo(row.ev) : ""))
        .filter((value) => value.length > 0)
    )
  );

  if (uniqueDetails.length === 1) return truncateDetail(uniqueDetails[0]);
  if (uniqueDetails.length > 1) {
    const preview = uniqueDetails
      .slice(0, 3)
      .map((detail) => fileNameFromPath(detail))
      .join(", ");
    return uniqueDetails.length > 3 ? `${preview}, ...` : preview;
  }
  return "";
}

function toolPrimaryText(name: string, done: boolean, rows: Record<string, unknown>[]): string {
  const count = rows.length;
  const latest = rows[rows.length - 1];
  const latestEv = isRecord(latest?.ev) ? latest.ev : {};
  const detail = toolSecondaryInfo(latestEv);

  if (name === "read_file" || name === "edit_file") {
    const noun =
      count > 1 ? `${count} files` : fileNameFromPath(detail) || "file";
    if (name === "read_file") return `${done ? "Read" : "Reading"} ${noun}`;
    return `${done ? "Edited" : "Editing"} ${noun}`;
  }

  if (name === "run_terminal_cmd") {
    return done ? "Ran terminal command" : "Running terminal command";
  }

  if (name === "grep_search" || name === "file_search" || name === "web_search") {
    return done ? humanizeToolName(name) : humanizeToolName(name);
  }

  if (count > 1) return `${humanizeToolName(name)} (${count})`;
  return humanizeToolName(name);
}

function toolRowParts(rows: Record<string, unknown>[]): {
  primary: string;
  secondary: string;
  done: boolean;
} {
  const events = rows
    .map((row) => (isRecord(row.ev) ? row.ev : null))
    .filter((ev): ev is Record<string, unknown> => ev !== null);
  const latest = events[events.length - 1] ?? {};
  const name = typeof latest.name === "string" ? latest.name : "?";
  const done = events.length > 0 && events.every(isToolCallDone);
  const secondary = toolGroupSecondaryInfo(rows);
  return {
    primary: toolPrimaryText(name, done, rows),
    secondary:
      rows.length === 1 && secondary === fileNameFromPath(secondary) ? "" : secondary,
    done,
  };
}

function CursorToolInvocationRow({
  primary,
  secondary,
  done,
}: {
  primary: string;
  secondary?: string;
  done: boolean;
}) {
  return (
    <div className="mb-0 px-1 py-0.5 text-[12px]">
      <div className="flex min-w-0 flex-nowrap items-baseline gap-1 text-gray-700">
        <span className={`shrink-0 ${done ? "" : "shimmer"}`}>{primary}</span>
        {secondary ? (
          <span className="min-w-0 truncate text-gray-500 dark:text-neutral-400">
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AssistantSegmentsBody({ segments }: { segments: AssistantStreamSegment[] }) {
  const { t } = useTranslation();
  if (segments.length === 0) {
    return (
      <p className="text-[10px] italic text-neutral-400 dark:text-neutral-500">
        {t("apps.chats.toolCalls.cursorCloudAgent.stream.emptyAssistant")}
      </p>
    );
  }

  return (
    <>
      {segments.map((seg, idx) =>
        seg.type === "markdown" ? (
          <div key={`md-${idx}`} className={markdownStreamClass}>
            <Suspense fallback={<span>{seg.text.trim() ? seg.text : "\u00a0"}</span>}>
              <LazyMarkdown>{seg.text.trim() ? seg.text : "\u00a0"}</LazyMarkdown>
            </Suspense>
          </div>
        ) : null
      )}
    </>
  );
}

function AssistantParts({ streamRow }: { streamRow: Record<string, unknown> }) {
  const segments = mergeAssistantStream([streamRow]);
  return <AssistantSegmentsBody segments={segments} />;
}

function UserPromptBlock({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-sky-200/85 bg-sky-50/75 px-2 py-1.5 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/35">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-100/95">
        {t("apps.chats.toolCalls.cursorCloudAgent.stream.userPrompt")}
      </div>
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-900 dark:text-neutral-100">
        {children}
      </div>
    </div>
  );
}

function UserParts({
  streamRow,
  plain,
}: {
  streamRow: Record<string, unknown>;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const joined = mergeUserText([streamRow]).trim();
  if (!joined) {
    return (
      <p className="text-[10px] italic text-neutral-400 dark:text-neutral-500">
        {t("apps.chats.toolCalls.cursorCloudAgent.stream.emptyAssistant")}
      </p>
    );
  }
  if (plain) {
    return <UserPromptBlock>{joined}</UserPromptBlock>;
  }
  return (
    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-200">
      {joined}
    </p>
  );
}

function ThinkingCollapsible({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const display = text.trim();
  if (!display) {
    return (
      <p className="text-[10px] italic text-neutral-400 dark:text-neutral-500">
        {t("apps.chats.toolCalls.cursorCloudAgent.stream.emptyAssistant")}
      </p>
    );
  }
  return (
    <div className="mb-0 px-1 py-0.5 text-[12px] text-gray-500 dark:text-neutral-500">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full min-w-0 text-left hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        {!open ? (
          <span className="line-clamp-2 min-w-0">{display}</span>
        ) : null}
      </button>
      {open ? (
        <p className="whitespace-pre-wrap leading-relaxed">{display}</p>
      ) : null}
    </div>
  );
}

function ThinkingParts({
  streamRow,
  plain,
}: {
  streamRow: Record<string, unknown>;
  plain?: boolean;
}) {
  const text = mergeThinkingText([streamRow]);
  if (plain) {
    return <ThinkingCollapsible text={text} />;
  }
  return <ThinkingBody text={text} showInlineTitle />;
}

function ThinkingBody({
  text,
  showInlineTitle,
  plain,
}: {
  text: string;
  /** Extra label inside the card (single-row UI); merged rows use the header only. */
  showInlineTitle?: boolean;
  /** Chat-like stream: no bordered thinking card */
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const display = text.trim();
  if (plain) {
    return (
      <p className="whitespace-pre-wrap text-[11px] italic leading-relaxed text-neutral-600 dark:text-neutral-400">
        {display.length ? display : "\u00a0"}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-neutral-200/80 bg-neutral-100/60 px-2 py-1.5 italic text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
      {showInlineTitle ? (
        <>
          <span className="font-semibold not-italic text-neutral-500 dark:text-neutral-500">
            {t("apps.chats.toolCalls.cursorCloudAgent.stream.thinking")}
          </span>{" "}
        </>
      ) : null}
      <span className="whitespace-pre-wrap">{display.length ? display : "\u00a0"}</span>
    </div>
  );
}

function ToolCallEvent({ ev }: { ev: Record<string, unknown> }) {
  const parts = toolRowParts([{ ev }]);
  return (
    <CursorToolInvocationRow
      primary={parts.primary}
      secondary={parts.secondary}
      done={parts.done}
    />
  );
}

function ToolCallGroupEvent({ rows }: { rows: Record<string, unknown>[] }) {
  const parts = toolRowParts(rows);
  return (
    <CursorToolInvocationRow
      primary={parts.primary}
      secondary={parts.secondary}
      done={parts.done}
    />
  );
}

function TerminalBanner({
  row,
  plain,
}: {
  row: Record<string, unknown>;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const status = typeof row.status === "string" ? row.status : "";
  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  const err =
    typeof row.error === "string"
      ? row.error
      : row.error !== undefined
        ? safeJson(row.error, 400)
        : "";

  const bad = status === "error" || err;

  if (plain) {
    if (bad && err) {
      return (
        <p className="text-[11px] leading-snug whitespace-pre-wrap text-red-800 dark:text-red-200">
          {err}
        </p>
      );
    }
    if (summary) {
      return (
        <div className={markdownStreamClass}>
          <Suspense fallback={<span>{summary}</span>}>
            <LazyMarkdown>{summary}</LazyMarkdown>
          </Suspense>
        </div>
      );
    }
    return (
      <p className="text-[11px] leading-snug text-neutral-700 dark:text-neutral-300">
        {bad
          ? t("apps.chats.toolCalls.cursorCloudAgent.stream.runEndedError")
          : t("apps.chats.toolCalls.cursorCloudAgent.stream.runEnded", {
              status: status?.trim() ? status : "—",
            })}
      </p>
    );
  }

  return (
    <div
      className={`rounded-md border px-2 py-2 text-[11px] ${
        bad
          ? "border-red-200 bg-red-50/90 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
          : "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
      }`}
    >
      <div className="font-semibold">
        {bad
          ? t("apps.chats.toolCalls.cursorCloudAgent.stream.runEndedError")
          : t("apps.chats.toolCalls.cursorCloudAgent.stream.runEnded", {
              status: status?.trim() ? status : "—",
            })}
      </div>
      {summary ? (
        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed opacity-95">{summary}</p>
      ) : null}
      {err ? (
        <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]">{err}</pre>
      ) : null}
    </div>
  );
}

function FallbackBlob({ row }: { row: unknown }) {
  return (
    <pre className="max-h-36 overflow-auto font-mono text-[9px] text-neutral-600 dark:text-neutral-400">
      {safeJson(row, 12000)}
    </pre>
  );
}

function formatTime(ts: number | null): string | null {
  if (ts === null || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}

function formatTimeRange(tsStart: number | null, tsEnd: number | null): string | null {
  const a = formatTime(tsStart);
  const b = formatTime(tsEnd);
  if (!a && !b) return null;
  if (!b || a === b) return a;
  return `${a} – ${b}`;
}

/**
 * Renders one Redis-backed Cursor SDK stream row ({ ts, ev } or terminal marker).
 */
export function CursorRunEventView({
  row,
  plainStream = false,
}: {
  row: unknown;
  /** Cursor repo agent card: strip timestamps, roles, and row borders */
  plainStream?: boolean;
}) {
  const { t } = useTranslation();

  if (!isRecord(row)) {
    return <FallbackBlob row={row} />;
  }

  if (row.type === "terminal") {
    return <TerminalBanner row={row} plain={plainStream} />;
  }

  const ts = typeof row.ts === "number" ? row.ts : null;
  const timeLabel = formatTime(ts);
  const ev = row.ev;

  if (!isRecord(ev)) {
    return <FallbackBlob row={row} />;
  }

  const et = typeof ev.type === "string" ? ev.type : "";

  let body: ReactNode = null;

  switch (et) {
    case "assistant": {
      body = <AssistantParts streamRow={row as Record<string, unknown>} />;
      break;
    }
    case "user": {
      body = (
        <UserParts streamRow={row as Record<string, unknown>} plain={plainStream} />
      );
      break;
    }
    case "tool_call":
      body = <ToolCallEvent ev={ev} />;
      break;
    case "thinking": {
      body = <ThinkingParts streamRow={row as Record<string, unknown>} plain={plainStream} />;
      break;
    }
    case "status": {
      const { status: st, message: msg } = mergeStatusParts([row as Record<string, unknown>]);
      body =
        plainStream ? (
          <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
            {[st, msg].filter((x) => typeof x === "string" && x.length > 0).join(" · ") ||
              "\u00a0"}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-600 dark:text-neutral-400">
            <span className="rounded bg-neutral-200/90 px-1.5 py-px font-mono text-[9px] font-semibold uppercase dark:bg-neutral-700">
              {t("apps.chats.toolCalls.cursorCloudAgent.stream.status")}
            </span>
            <span className="font-mono">{st}</span>
            {msg ? <span>{msg}</span> : null}
          </div>
        );
      break;
    }
    case "system": {
      const modelId =
        ev.model && isRecord(ev.model) && typeof ev.model.id === "string"
          ? ev.model.id
          : "";
      body = (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-500">
          {t("apps.chats.toolCalls.cursorCloudAgent.stream.system")}
          {modelId ? ` · ${modelId}` : ""}
        </div>
      );
      break;
    }
    case "task":
    case "request": {
      body = (
        <div className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400">
          {et}
          {typeof ev.text === "string" ? `: ${ev.text}` : ""}
        </div>
      );
      break;
    }
    default:
      body = <FallbackBlob row={ev} />;
  }

  return (
    <div
      className={
        plainStream
          ? "pb-1 last:pb-0"
          : "border-b border-neutral-200/70 pb-2 last:border-b-0 last:pb-0 dark:border-neutral-700/80"
      }
    >
      {!plainStream ? (
        <div className="mb-1 flex items-center gap-2">
          {timeLabel ? (
            <span className="shrink-0 font-mono text-[9px] text-neutral-400 dark:text-neutral-500">
              {timeLabel}
            </span>
          ) : null}
          <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-600">
            {et || "event"}
          </span>
        </div>
      ) : null}
      {body}
    </div>
  );
}

function StreamBlockChrome({
  plain,
  tsStart,
  tsEnd,
  label,
  children,
}: {
  plain?: boolean;
  tsStart: number | null;
  tsEnd: number | null;
  label: string;
  children: ReactNode;
}) {
  if (plain) {
    return <div className="pb-1 last:pb-0">{children}</div>;
  }
  const timeLabel = formatTimeRange(tsStart, tsEnd);
  return (
    <div className="border-b border-neutral-200/70 pb-2 last:border-b-0 last:pb-0 dark:border-neutral-700/80">
      <div className="mb-1 flex items-center gap-2">
        {timeLabel ? (
          <span className="shrink-0 font-mono text-[9px] text-neutral-400 dark:text-neutral-500">
            {timeLabel}
          </span>
        ) : null}
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-600">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

/** One stitched assistant message after {@link coalesceCursorRunRows}. */
export function MergedAssistantStreamBlock({
  tsStart,
  tsEnd,
  segments,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  segments: AssistantStreamSegment[];
  plainStream?: boolean;
}) {
  return (
    <StreamBlockChrome plain={plainStream} tsStart={tsStart} tsEnd={tsEnd} label="assistant">
      <AssistantSegmentsBody segments={segments} />
    </StreamBlockChrome>
  );
}

export function MergedThinkingStreamBlock({
  tsStart,
  tsEnd,
  text,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  text: string;
  plainStream?: boolean;
}) {
  if (plainStream) {
    return (
      <div className="pb-1 last:pb-0">
        <ThinkingCollapsible text={text} />
      </div>
    );
  }
  return (
    <StreamBlockChrome plain={false} tsStart={tsStart} tsEnd={tsEnd} label="thinking">
      <ThinkingBody text={text} />
    </StreamBlockChrome>
  );
}

export function MergedUserStreamBlock({
  tsStart,
  tsEnd,
  text,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  text: string;
  plainStream?: boolean;
}) {
  const { t } = useTranslation();
  const trimmed = text.trim();
  if (plainStream) {
    return (
      <div className="pb-1 last:pb-0">
        {trimmed.length ? (
          <UserPromptBlock>{trimmed}</UserPromptBlock>
        ) : (
          <p className="text-[10px] italic text-neutral-400 dark:text-neutral-500">
            {t("apps.chats.toolCalls.cursorCloudAgent.stream.emptyAssistant")}
          </p>
        )}
      </div>
    );
  }
  return (
    <StreamBlockChrome plain={false} tsStart={tsStart} tsEnd={tsEnd} label="user">
      <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-200">
        {trimmed.length ? trimmed : t("apps.chats.toolCalls.cursorCloudAgent.stream.emptyAssistant")}
      </p>
    </StreamBlockChrome>
  );
}

export function MergedToolCallStreamBlock({
  tsStart,
  tsEnd,
  row,
  rows,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  row: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  plainStream?: boolean;
}) {
  const ev = isRecord(row.ev) ? row.ev : {};
  return (
    <StreamBlockChrome plain={plainStream} tsStart={tsStart} tsEnd={tsEnd} label="tool_call">
      {rows && rows.length > 1 ? (
        <ToolCallGroupEvent rows={rows} />
      ) : (
        <ToolCallEvent ev={ev} />
      )}
    </StreamBlockChrome>
  );
}

export function MergedStatusStreamBlock({
  tsStart,
  tsEnd,
  status,
  message,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  status: string;
  message: string;
  plainStream?: boolean;
}) {
  const { t } = useTranslation();
  if (plainStream) {
    const line = [status, message].filter((x) => x.trim().length > 0).join(" · ");
    return (
      <div className="pb-1 last:pb-0">
        <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
          {line.length ? line : "\u00a0"}
        </div>
      </div>
    );
  }
  return (
    <StreamBlockChrome plain={false} tsStart={tsStart} tsEnd={tsEnd} label="status">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-600 dark:text-neutral-400">
        <span className="rounded bg-neutral-200/90 px-1.5 py-px font-mono text-[9px] font-semibold uppercase dark:bg-neutral-700">
          {t("apps.chats.toolCalls.cursorCloudAgent.stream.status")}
        </span>
        <span className="font-mono">{status}</span>
        {message ? <span>{message}</span> : null}
      </div>
    </StreamBlockChrome>
  );
}

export function MergedEvTextStreamBlock({
  tsStart,
  tsEnd,
  evType,
  text,
  plainStream = false,
}: {
  tsStart: number | null;
  tsEnd: number | null;
  evType: string;
  text: string;
  plainStream?: boolean;
}) {
  const trimmed = text.trim();
  if (plainStream) {
    return (
      <div className="pb-1 last:pb-0">
        <div className="whitespace-pre-wrap text-[10px] leading-snug text-neutral-600 dark:text-neutral-400">
          {trimmed.length ? trimmed : evType}
        </div>
      </div>
    );
  }
  return (
    <StreamBlockChrome plain={false} tsStart={tsStart} tsEnd={tsEnd} label={evType}>
      <div className="font-mono text-[10px] whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
        {evType}
        {trimmed.length ? `: ${trimmed}` : ""}
      </div>
    </StreamBlockChrome>
  );
}
