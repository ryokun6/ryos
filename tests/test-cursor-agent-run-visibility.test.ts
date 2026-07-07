import { describe, expect, test } from "bun:test";
import {
  CURSOR_AGENT_RECENT_MS,
  isCursorAgentRunRecent,
  partitionCursorAgentRunsByRecency,
} from "../src/apps/admin/utils/cursorAgentRunVisibility";
import type { AdminCursorAgentRunRow } from "../src/apps/admin/components/CursorAgentsPanel";

function makeRun(
  overrides: Partial<AdminCursorAgentRunRow> & Pick<AdminCursorAgentRunRow, "runId">,
): AdminCursorAgentRunRow {
  return {
    agentId: "agent-1",
    status: "finished",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("cursorAgentRunVisibility", () => {
  const now = 1_700_000_000_000;
  const cutoff = now - CURSOR_AGENT_RECENT_MS;

  test("treats runs updated within a week as recent", () => {
    const run = makeRun({
      runId: "recent",
      updatedAt: cutoff + 1,
    });
    expect(isCursorAgentRunRecent(run, cutoff, now)).toBe(true);
  });

  test("treats runs older than a week as not recent", () => {
    const run = makeRun({
      runId: "old",
      updatedAt: cutoff - 1,
    });
    expect(isCursorAgentRunRecent(run, cutoff, now)).toBe(false);
  });

  test("always keeps running agents visible even when old", () => {
    const run = makeRun({
      runId: "running-old",
      status: "running",
      updatedAt: cutoff - 10_000,
    });
    expect(isCursorAgentRunRecent(run, cutoff, now)).toBe(true);
  });

  test("falls back to createdAt when updatedAt is missing", () => {
    const run = makeRun({
      runId: "created-only",
      createdAt: cutoff + 5,
      updatedAt: null,
    });
    expect(isCursorAgentRunRecent(run, cutoff, now)).toBe(true);
  });

  test("shows runs with unknown timestamps by default", () => {
    const run = makeRun({ runId: "unknown-age" });
    expect(isCursorAgentRunRecent(run, cutoff, now)).toBe(true);
  });

  test("partitions runs into recent and older buckets", () => {
    const runs = [
      makeRun({ runId: "recent", updatedAt: cutoff + 1 }),
      makeRun({ runId: "old", updatedAt: cutoff - 1 }),
      makeRun({
        runId: "running-old",
        status: "running",
        updatedAt: cutoff - 1,
      }),
    ];

    const { recent, older } = partitionCursorAgentRunsByRecency(
      runs,
      CURSOR_AGENT_RECENT_MS,
      now,
    );

    expect(recent.map((r) => r.runId)).toEqual(["recent", "running-old"]);
    expect(older.map((r) => r.runId)).toEqual(["old"]);
  });
});
