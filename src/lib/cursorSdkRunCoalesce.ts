/**
 * Merge consecutive Cursor SDK stream rows of the same event kind into single render units.
 */

export interface AssistantToolUseChunk {
  id?: string;
  name: string;
  input: unknown;
}

export type AssistantStreamSegment =
  | { type: "markdown"; text: string }
  | { type: "tool_request"; chunk: AssistantToolUseChunk };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function collectTsRange(group: Record<string, unknown>[]): {
  tsStart: number | null;
  tsEnd: number | null;
} {
  let tsStart: number | null = null;
  let tsEnd: number | null = null;
  for (const r of group) {
    const t = typeof r.ts === "number" ? r.ts : null;
    if (t !== null) {
      if (tsStart === null) tsStart = t;
      tsEnd = t;
    }
  }
  return { tsStart, tsEnd };
}

/**
 * Walk one or more consecutive assistant rows (oldest first) and preserve content order:
 * streaming text deltas concatenate into one markdown segment until a tool_use breaks the flow.
 */
export function mergeAssistantStream(
  rows: Record<string, unknown>[]
): AssistantStreamSegment[] {
  let mdBuf = "";
  const out: AssistantStreamSegment[] = [];

  const flushMarkdown = () => {
    if (mdBuf.length === 0) return;
    out.push({ type: "markdown", text: mdBuf });
    mdBuf = "";
  };

  for (const row of rows) {
    const ev = row.ev;
    if (!isRecord(ev) || ev.type !== "assistant") continue;

    const msg = ev.message;
    if (!isRecord(msg) || !Array.isArray(msg.content)) continue;

    for (const part of msg.content) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string") {
        mdBuf += part.text;
      } else if (part.type === "tool_use") {
        flushMarkdown();
        const name = typeof part.name === "string" ? part.name : "tool";
        const id = typeof part.id === "string" ? part.id : undefined;
        out.push({
          type: "tool_request",
          chunk: { id, name, input: part.input },
        });
      }
    }
  }

  flushMarkdown();
  return out;
}

export function mergeThinkingText(rows: Record<string, unknown>[]): string {
  let buf = "";
  for (const row of rows) {
    const ev = row.ev;
    if (!isRecord(ev) || ev.type !== "thinking") continue;
    buf += typeof ev.text === "string" ? ev.text : "";
  }
  return buf;
}

export function mergeUserText(rows: Record<string, unknown>[]): string {
  let buf = "";
  for (const row of rows) {
    const ev = row.ev;
    if (!isRecord(ev) || ev.type !== "user") continue;
    const msg = ev.message;
    if (!isRecord(msg) || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string") {
        buf += part.text;
      }
    }
  }
  return buf;
}

export function mergeStatusParts(rows: Record<string, unknown>[]): {
  status: string;
  message: string;
} {
  let status = "";
  let message = "";
  for (const row of rows) {
    const ev = row.ev;
    if (!isRecord(ev) || ev.type !== "status") continue;
    const st = typeof ev.status === "string" ? ev.status : "";
    if (!status && st) status = st;
    message += typeof ev.message === "string" ? ev.message : "";
  }
  return { status, message };
}

export function mergeEvTextRows(rows: Record<string, unknown>[], evType: string): string {
  let buf = "";
  for (const row of rows) {
    const ev = row.ev;
    if (!isRecord(ev) || ev.type !== evType) continue;
    buf += typeof ev.text === "string" ? ev.text : "";
  }
  return buf;
}

function evTypeOf(row: Record<string, unknown>): string {
  const ev = row.ev;
  return isRecord(ev) && typeof ev.type === "string" ? ev.type : "";
}

export type CoalescedCursorRow =
  | {
      kind: "merged_assistant";
      tsStart: number | null;
      tsEnd: number | null;
      segments: AssistantStreamSegment[];
    }
  | {
      kind: "merged_thinking";
      tsStart: number | null;
      tsEnd: number | null;
      text: string;
    }
  | {
      kind: "merged_user";
      tsStart: number | null;
      tsEnd: number | null;
      text: string;
    }
  | {
      kind: "merged_status";
      tsStart: number | null;
      tsEnd: number | null;
      status: string;
      message: string;
    }
  | {
      kind: "merged_ev_text";
      tsStart: number | null;
      tsEnd: number | null;
      evType: string;
      text: string;
    }
  | {
      kind: "merged_tool_call";
      tsStart: number | null;
      tsEnd: number | null;
      row: Record<string, unknown>;
      rows: Record<string, unknown>[];
    }
  | { kind: "single"; row: unknown };

function isAssistantRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  return isRecord(ev) && ev.type === "assistant";
}

function isThinkingRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  return isRecord(ev) && ev.type === "thinking";
}

function isUserRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  return isRecord(ev) && ev.type === "user";
}

function isStatusRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  return isRecord(ev) && ev.type === "status";
}

function isMergeableEvTextRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  if (!isRecord(ev)) return false;
  const et = ev.type;
  return et === "task" || et === "request";
}

function isToolCallRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false;
  if (row.type === "terminal") return false;
  const ev = row.ev;
  return isRecord(ev) && ev.type === "tool_call";
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  } catch {
    return String(value);
  }
}

function toolCallKey(row: Record<string, unknown>): string {
  const ev = row.ev;
  if (!isRecord(ev)) return "";

  const idCandidates = [
    ev.id,
    ev.toolCallId,
    ev.tool_call_id,
    ev.callId,
    ev.call_id,
  ];
  const id = idCandidates.find((v): v is string => typeof v === "string" && v.length > 0);
  if (id) return `id:${id}`;

  const name = typeof ev.name === "string" ? ev.name : "tool";
  const args = ev.args ?? ev.input ?? ev.parameters;
  return `${name}:${stableJson(args)}`;
}

function toolCallName(row: Record<string, unknown>): string {
  const ev = row.ev;
  return isRecord(ev) && typeof ev.name === "string" ? ev.name : "";
}

function collectToolCallLifecycle(
  events: unknown[],
  startIndex: number
): { group: Record<string, unknown>[]; nextIndex: number } {
  const first = events[startIndex] as Record<string, unknown>;
  const key = toolCallKey(first);
  const group: Record<string, unknown>[] = [first];
  let nextIndex = startIndex + 1;

  while (nextIndex < events.length) {
    const next = events[nextIndex];
    if (isStatusRow(next)) {
      nextIndex++;
      continue;
    }
    if (!isToolCallRow(next)) break;
    const nextRecord = next as Record<string, unknown>;
    if (toolCallKey(nextRecord) !== key) break;
    group.push(nextRecord);
    nextIndex++;
  }

  return { group, nextIndex };
}

/**
 * Merge adjacent stream rows that belong to one logical message (same ev.type);
 * leave tool_call, system, terminal, etc. as single rows.
 */
export function coalesceCursorRunRows(events: unknown[]): CoalescedCursorRow[] {
  if (!Array.isArray(events)) return [];

  const out: CoalescedCursorRow[] = [];
  // Tracks where a tool call key was first emitted so later lifecycle rows
  // (interleaved with thinking/assistant/etc.) update that entry in-place
  // instead of being rendered as a duplicate.
  const toolKeyToLocation = new Map<
    string,
    { outIndex: number; rowIndex: number }
  >();
  let i = 0;

  while (i < events.length) {
    const row = events[i];

    if (isAssistantRow(row)) {
      const group: Record<string, unknown>[] = [];
      while (i < events.length && isAssistantRow(events[i])) {
        group.push(events[i] as Record<string, unknown>);
        i++;
      }
      const { tsStart, tsEnd } = collectTsRange(group);
      out.push({
        kind: "merged_assistant",
        tsStart,
        tsEnd,
        segments: mergeAssistantStream(group),
      });
      continue;
    }

    if (isThinkingRow(row)) {
      const group: Record<string, unknown>[] = [];
      while (i < events.length && isThinkingRow(events[i])) {
        group.push(events[i] as Record<string, unknown>);
        i++;
      }
      const { tsStart, tsEnd } = collectTsRange(group);
      out.push({
        kind: "merged_thinking",
        tsStart,
        tsEnd,
        text: mergeThinkingText(group),
      });
      continue;
    }

    if (isUserRow(row)) {
      const group: Record<string, unknown>[] = [];
      while (i < events.length && isUserRow(events[i])) {
        group.push(events[i] as Record<string, unknown>);
        i++;
      }
      const { tsStart, tsEnd } = collectTsRange(group);
      out.push({
        kind: "merged_user",
        tsStart,
        tsEnd,
        text: mergeUserText(group),
      });
      continue;
    }

    if (isStatusRow(row)) {
      const first = row as Record<string, unknown>;
      const ev0 = first.ev;
      const anchorStatus =
        isRecord(ev0) && typeof ev0.status === "string" ? ev0.status : "";
      const group: Record<string, unknown>[] = [first];
      i++;
      while (i < events.length) {
        const next = events[i];
        if (!isStatusRow(next)) break;
        const evn = (next as Record<string, unknown>).ev;
        const st =
          isRecord(evn) && typeof evn.status === "string" ? evn.status : "";
        if (st !== anchorStatus) break;
        group.push(next as Record<string, unknown>);
        i++;
      }
      const { tsStart, tsEnd } = collectTsRange(group);
      const { status, message } = mergeStatusParts(group);
      out.push({
        kind: "merged_status",
        tsStart,
        tsEnd,
        status,
        message,
      });
      continue;
    }

    if (isMergeableEvTextRow(row)) {
      const et = evTypeOf(row as Record<string, unknown>);
      const group: Record<string, unknown>[] = [];
      while (
        i < events.length &&
        isMergeableEvTextRow(events[i]) &&
        evTypeOf(events[i] as Record<string, unknown>) === et
      ) {
        group.push(events[i] as Record<string, unknown>);
        i++;
      }
      const { tsStart, tsEnd } = collectTsRange(group);
      out.push({
        kind: "merged_ev_text",
        tsStart,
        tsEnd,
        evType: et,
        text: mergeEvTextRows(group, et),
      });
      continue;
    }

    if (isToolCallRow(row)) {
      const name = toolCallName(row);
      const newRows: Record<string, unknown>[] = [];
      const localKeyToIndex = new Map<string, number>();
      let batchTsStart: number | null = null;
      let batchTsEnd: number | null = null;

      while (i < events.length) {
        const next = events[i];
        if (isStatusRow(next)) {
          i++;
          continue;
        }
        if (!isToolCallRow(next)) break;
        const nextRecord = next as Record<string, unknown>;
        if (toolCallName(nextRecord) !== name) break;

        const lifecycle = collectToolCallLifecycle(events, i);
        const latest = lifecycle.group[lifecycle.group.length - 1]!;
        const key = toolCallKey(latest);
        i = lifecycle.nextIndex;

        // Same-id tool call already emitted earlier in `out` — mutate in place
        // so the running entry updates to its final state instead of duplicating.
        const globalLoc = key ? toolKeyToLocation.get(key) : undefined;
        if (globalLoc) {
          const existing = out[globalLoc.outIndex];
          if (existing && existing.kind === "merged_tool_call") {
            existing.rows[globalLoc.rowIndex] = latest;
            existing.row = existing.rows[existing.rows.length - 1]!;
            for (const r of lifecycle.group) {
              const ts = typeof r.ts === "number" ? r.ts : null;
              if (
                ts !== null &&
                (existing.tsEnd === null || ts > existing.tsEnd)
              ) {
                existing.tsEnd = ts;
              }
            }
          }
          continue;
        }

        for (const r of lifecycle.group) {
          const ts = typeof r.ts === "number" ? r.ts : null;
          if (ts !== null) {
            if (batchTsStart === null || ts < batchTsStart) batchTsStart = ts;
            if (batchTsEnd === null || ts > batchTsEnd) batchTsEnd = ts;
          }
        }

        // Same-id tool call already in this batch — update local entry.
        const localIdx = key ? localKeyToIndex.get(key) : undefined;
        if (localIdx !== undefined) {
          newRows[localIdx] = latest;
          continue;
        }

        if (key) localKeyToIndex.set(key, newRows.length);
        newRows.push(latest);
      }

      if (newRows.length > 0) {
        const outIndex = out.length;
        out.push({
          kind: "merged_tool_call",
          tsStart: batchTsStart,
          tsEnd: batchTsEnd,
          row: newRows[newRows.length - 1]!,
          rows: newRows,
        });

        newRows.forEach((r, idx) => {
          const k = toolCallKey(r);
          if (k) toolKeyToLocation.set(k, { outIndex, rowIndex: idx });
        });
      }
      continue;
    }

    out.push({ kind: "single", row });
    i++;
  }

  return out;
}
