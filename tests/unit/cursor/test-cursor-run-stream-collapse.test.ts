import { describe, expect, test } from "bun:test";
import type { CoalescedCursorRow } from "../../../src/lib/cursorSdkRunCoalesce.js";
import {
  computeCursorRunDurationMs,
  findCursorRunSummaryIndex,
  formatCursorRunDuration,
  isCursorRunSummaryItem,
  splitCursorRunStreamItems,
} from "../../../src/lib/cursorRunStreamCollapse.js";

function assistantItem(text: string): CoalescedCursorRow {
  return {
    kind: "merged_assistant",
    tsStart: 1,
    tsEnd: 2,
    segments: [{ type: "markdown", text }],
  };
}

function toolItem(): CoalescedCursorRow {
  return {
    kind: "merged_tool_call",
    tsStart: 1,
    tsEnd: 2,
    row: { ev: { type: "tool_call", name: "read_file" } },
    rows: [{ ev: { type: "tool_call", name: "read_file" } }],
  };
}

describe("isCursorRunSummaryItem", () => {
  test("treats non-empty merged assistant markdown as summary", () => {
    expect(isCursorRunSummaryItem(assistantItem("Done."))).toBe(true);
  });

  test("ignores empty assistant blocks", () => {
    expect(isCursorRunSummaryItem(assistantItem("   "))).toBe(false);
  });

  test("treats visible terminal errors as summary", () => {
    const item: CoalescedCursorRow = {
      kind: "single",
      row: { type: "terminal", status: "error", error: "boom" },
    };
    expect(isCursorRunSummaryItem(item)).toBe(true);
  });
});

describe("splitCursorRunStreamItems", () => {
  test("splits preamble from last assistant summary when done", () => {
    const items = [toolItem(), toolItem(), assistantItem("Shipped the fix.")];
    const split = splitCursorRunStreamItems(items, true);
    expect(split.canCollapse).toBe(true);
    expect(split.preamble).toHaveLength(2);
    expect(split.summary).toHaveLength(1);
    expect(findCursorRunSummaryIndex(items)).toBe(2);
  });

  test("does not collapse while running", () => {
    const items = [toolItem(), assistantItem("Still going.")];
    const split = splitCursorRunStreamItems(items, false);
    expect(split.canCollapse).toBe(false);
    expect(split.summary).toEqual(items);
    expect(split.preamble).toEqual([]);
  });

  test("does not collapse when only a summary exists", () => {
    const items = [assistantItem("Only message.")];
    const split = splitCursorRunStreamItems(items, true);
    expect(split.canCollapse).toBe(false);
  });
});

describe("formatCursorRunDuration", () => {
  test("formats seconds and minutes", () => {
    expect(formatCursorRunDuration(45_000)).toBe("45s");
    expect(formatCursorRunDuration(134_000)).toBe("2m 14s");
    expect(formatCursorRunDuration(3_600_000)).toBe("1h");
    expect(formatCursorRunDuration(3_900_000)).toBe("1h 5m");
  });
});

describe("computeCursorRunDurationMs", () => {
  test("prefers terminal durationMs from SDK", () => {
    const events = [
      { ts: 1000, ev: { type: "assistant" } },
      { ts: 5000, type: "terminal", durationMs: 134_000 },
    ];
    expect(computeCursorRunDurationMs(events)).toBe(134_000);
  });

  test("falls back to first and terminal timestamps", () => {
    const events = [
      { ts: 1000, ev: { type: "user" } },
      { ts: 5000, type: "terminal", status: "finished" },
    ];
    expect(computeCursorRunDurationMs(events)).toBe(4000);
  });
});
