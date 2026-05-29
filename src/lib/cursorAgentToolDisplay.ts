/**
 * Display helpers for Cursor Cloud agent stream tool-call rows.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Tool names that represent shell/terminal execution (SDK + legacy aliases). */
export function isTerminalToolName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n === "run_terminal_cmd" || n === "run_terminal_command") return true;
  return n.toLowerCase() === "shell";
}

export function isToolCallDone(ev: Record<string, unknown>): boolean {
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

function truncateDetail(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

const COMMAND_ARG_KEYS = ["command", "cmd", "shell_command"] as const;

export function terminalCommandFromInput(input: unknown): string {
  if (typeof input === "string") return truncateDetail(input);
  const payload = toolPayload(input);
  if (!payload) return "";
  return truncateDetail(pickString(payload, [...COMMAND_ARG_KEYS]));
}

function terminalCommandFromEv(ev: Record<string, unknown>): string {
  return terminalCommandFromInput(ev.args ?? ev.input ?? ev.parameters ?? ev);
}

export function toolSecondaryInfo(input: unknown): string {
  if (typeof input === "string") return truncateDetail(input);
  const payload = toolPayload(input);
  if (!payload) return "";
  return pickString(payload, [
    ...COMMAND_ARG_KEYS,
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

function toolGroupTerminalCommandInfo(rows: Record<string, unknown>[]): string {
  if (rows.length <= 1) {
    const ev = isRecord(rows[0]?.ev) ? rows[0].ev : {};
    return terminalCommandFromEv(ev);
  }

  const uniqueCommands = Array.from(
    new Set(
      rows.reduce<string[]>((acc, row) => {
        const value = isRecord(row.ev) ? terminalCommandFromEv(row.ev) : "";
        if (value.length > 0) acc.push(value);
        return acc;
      }, [])
    )
  );

  if (uniqueCommands.length === 1) return uniqueCommands[0];
  if (uniqueCommands.length > 1) {
    const preview = uniqueCommands.slice(0, 2).join("; ");
    return uniqueCommands.length > 2 ? `${preview}; ...` : preview;
  }
  return "";
}

function toolGroupSecondaryInfo(
  rows: Record<string, unknown>[],
  toolName: string
): string {
  if (isTerminalToolName(toolName)) {
    return toolGroupTerminalCommandInfo(rows);
  }

  if (rows.length <= 1) {
    const ev = isRecord(rows[0]?.ev) ? rows[0].ev : {};
    return toolSecondaryInfo(ev);
  }

  const uniqueDetails = Array.from(
    new Set(
      rows.reduce<string[]>((acc, row) => {
        const value = isRecord(row.ev) ? toolSecondaryInfo(row.ev) : "";
        if (value.length > 0) acc.push(value);
        return acc;
      }, [])
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

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Tool";

  const overrides: Record<string, string> = {
    read_file: "Read file",
    edit_file: "Edit file",
    list_dir: "List directory",
    file_search: "Search files",
    grep_search: "Search text",
    web_search: "Search web",
  };
  const override = overrides[trimmed];
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

function toolPrimaryText(
  name: string,
  done: boolean,
  rows: Record<string, unknown>[]
): string {
  if (isTerminalToolName(name)) {
    return done ? "Ran" : "Running";
  }

  const count = rows.length;
  const latest = rows[rows.length - 1];
  const latestEv = isRecord(latest?.ev) ? latest.ev : {};
  const detail = toolSecondaryInfo(latestEv);

  if (name === "read_file" || name === "edit_file") {
    const noun = count > 1 ? `${count} files` : fileNameFromPath(detail) || "file";
    if (name === "read_file") return `${done ? "Read" : "Reading"} ${noun}`;
    return `${done ? "Edited" : "Editing"} ${noun}`;
  }

  if (name === "grep_search" || name === "file_search" || name === "web_search") {
    return humanizeToolName(name);
  }

  if (count > 1) return `${humanizeToolName(name)} (${count})`;
  return humanizeToolName(name);
}

export function buildToolInvocationLabel(rows: Record<string, unknown>[]): {
  primary: string;
  secondary: string;
  done: boolean;
} {
  const events = rows.reduce<Record<string, unknown>[]>((acc, row) => {
    if (isRecord(row.ev)) acc.push(row.ev);
    return acc;
  }, []);
  const latest = events[events.length - 1] ?? {};
  const name = typeof latest.name === "string" ? latest.name : "?";
  const done = events.length > 0 && events.every(isToolCallDone);
  const secondary = toolGroupSecondaryInfo(rows, name);
  return {
    primary: toolPrimaryText(name, done, rows),
    secondary:
      !isTerminalToolName(name) &&
      rows.length === 1 &&
      secondary === fileNameFromPath(secondary)
        ? ""
        : secondary,
    done,
  };
}

/** Whether a Redis terminal marker should render in the chat card body (header already shows completion). */
export function shouldRenderTerminalMarkerInPlainStream(
  row: Record<string, unknown>
): boolean {
  const status = typeof row.status === "string" ? row.status.trim() : "";
  const err =
    typeof row.error === "string"
      ? row.error.trim()
      : row.error !== undefined
        ? String(row.error)
        : "";
  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  const bad = status === "error" || err.length > 0;
  if (bad) return true;
  // Success completion: omit generic end banner; keep body only when there is a non-empty summary.
  return summary.length > 0;
}
