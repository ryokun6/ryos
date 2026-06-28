/**
 * Collapse completed Cursor agent run streams: preamble vs final summary message.
 */

import { shouldRenderTerminalMarkerInPlainStream } from "@/lib/cursorAgentToolDisplay";
import type { CoalescedCursorRow } from "@/lib/cursorSdkRunCoalesce";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isTerminalRow(row: unknown): row is Record<string, unknown> {
  return isRecord(row) && row.type === "terminal";
}

function assistantHasVisibleMarkdown(item: CoalescedCursorRow): boolean {
  if (item.kind !== "merged_assistant") return false;
  return item.segments.some(
    (segment) => segment.type === "markdown" && segment.text.trim().length > 0
  );
}

/** Whether a coalesced row is the run's closing summary (assistant text or terminal error). */
export function isCursorRunSummaryItem(item: CoalescedCursorRow): boolean {
  if (assistantHasVisibleMarkdown(item)) return true;
  if (item.kind === "single" && isTerminalRow(item.row)) {
    return shouldRenderTerminalMarkerInPlainStream(item.row);
  }
  return false;
}

/** Index of the last summary row, or -1 when none. */
export function findCursorRunSummaryIndex(items: CoalescedCursorRow[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (isCursorRunSummaryItem(items[i]!)) return i;
  }
  return -1;
}

export interface CursorRunStreamSplit {
  preamble: CoalescedCursorRow[];
  summary: CoalescedCursorRow[];
  canCollapse: boolean;
}

/**
 * When the run is terminal, split stream rows into collapsible preamble and the
 * final summary block that stays visible.
 */
export function splitCursorRunStreamItems(
  items: CoalescedCursorRow[],
  done: boolean
): CursorRunStreamSplit {
  if (!done || items.length <= 1) {
    return { preamble: [], summary: items, canCollapse: false };
  }

  const summaryIndex = findCursorRunSummaryIndex(items);
  if (summaryIndex <= 0) {
    return { preamble: [], summary: items, canCollapse: false };
  }

  const preamble = items.slice(0, summaryIndex);
  const summary = items.slice(summaryIndex);
  return { preamble, summary, canCollapse: preamble.length > 0 };
}

/** Human-readable duration for the collapse label (e.g. "2m 14s", "45s"). */
export function formatCursorRunDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    const minPart = minutes > 0 ? ` ${minutes}m` : "";
    return `${hours}h${minPart}`.trim();
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Prefer SDK `durationMs` on the terminal marker; fall back to first/last event timestamps.
 */
export function computeCursorRunDurationMs(events: unknown[]): number | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  let terminalTs: number | null = null;
  let terminalDurationMs: number | null = null;
  let minTs: number | null = null;
  let maxTs: number | null = null;

  for (const event of events) {
    if (!isRecord(event)) continue;
    const ts =
      typeof event.ts === "number" && Number.isFinite(event.ts) ? event.ts : null;
    if (ts !== null) {
      if (minTs === null || ts < minTs) minTs = ts;
      if (maxTs === null || ts > maxTs) maxTs = ts;
    }
    if (event.type === "terminal") {
      if (typeof event.durationMs === "number" && event.durationMs > 0) {
        terminalDurationMs = event.durationMs;
      }
      if (ts !== null) terminalTs = ts;
    }
  }

  if (terminalDurationMs !== null) return terminalDurationMs;
  if (minTs !== null && terminalTs !== null && terminalTs >= minTs) {
    return terminalTs - minTs;
  }
  if (minTs !== null && maxTs !== null && maxTs >= minTs) {
    return maxTs - minTs;
  }
  return null;
}
