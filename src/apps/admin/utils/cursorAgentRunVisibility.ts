import type { AdminCursorAgentRunRow } from "../components/CursorAgentsPanel";

export const CURSOR_AGENT_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

function runActivityTimestamp(run: AdminCursorAgentRunRow): number | null {
  return run.updatedAt ?? run.createdAt ?? null;
}

export function isCursorAgentRunRecent(
  run: AdminCursorAgentRunRow,
  cutoffMs: number,
  now = Date.now(),
): boolean {
  if (run.status.toLowerCase() === "running") return true;
  const ts = runActivityTimestamp(run);
  if (ts == null) return true;
  return ts >= cutoffMs;
}

export function partitionCursorAgentRunsByRecency(
  runs: AdminCursorAgentRunRow[],
  maxAgeMs = CURSOR_AGENT_RECENT_MS,
  now = Date.now(),
): { recent: AdminCursorAgentRunRow[]; older: AdminCursorAgentRunRow[] } {
  const cutoffMs = now - maxAgeMs;
  const recent: AdminCursorAgentRunRow[] = [];
  const older: AdminCursorAgentRunRow[] = [];

  for (const run of runs) {
    if (isCursorAgentRunRecent(run, cutoffMs, now)) {
      recent.push(run);
    } else {
      older.push(run);
    }
  }

  return { recent, older };
}
