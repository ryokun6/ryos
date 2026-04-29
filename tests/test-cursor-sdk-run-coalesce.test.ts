import { describe, expect, test } from "bun:test";
import { coalesceCursorRunRows } from "../src/lib/cursorSdkRunCoalesce.js";

describe("coalesceCursorRunRows tool calls", () => {
  test("collapses lifecycle updates for the same tool call", () => {
    const rows = [
      {
        ts: 1,
        ev: {
          type: "tool_call",
          id: "call-1",
          name: "run_terminal_cmd",
          status: "running",
          args: { command: "bun test" },
        },
      },
      { ts: 2, ev: { type: "status", status: "running", message: "tick" } },
      {
        ts: 3,
        ev: {
          type: "tool_call",
          id: "call-1",
          name: "run_terminal_cmd",
          status: "completed",
          args: { command: "bun test" },
          result: "ok",
        },
      },
    ];

    const out = coalesceCursorRunRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("merged_tool_call");
    if (out[0]?.kind === "merged_tool_call") {
      expect(out[0].tsStart).toBe(1);
      expect(out[0].tsEnd).toBe(3);
      expect(out[0].row.ev).toMatchObject({
        type: "tool_call",
        status: "completed",
      });
    }
  });

  test("merges consecutive distinct calls to the same tool name", () => {
    const rows = [
      {
        ts: 1,
        ev: {
          type: "tool_call",
          name: "edit_file",
          status: "completed",
          args: { target_file: "/workspace/a.ts" },
        },
      },
      {
        ts: 2,
        ev: {
          type: "tool_call",
          name: "edit_file",
          status: "completed",
          args: { target_file: "/workspace/b.ts" },
        },
      },
    ];

    const out = coalesceCursorRunRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("merged_tool_call");
    if (out[0]?.kind === "merged_tool_call") {
      expect(out[0].rows).toHaveLength(2);
      expect(out[0].row.ev).toMatchObject({
        type: "tool_call",
        name: "edit_file",
        args: { target_file: "/workspace/b.ts" },
      });
    }
  });

  test("keeps different adjacent tool names separate", () => {
    const rows = [
      {
        ts: 1,
        ev: {
          type: "tool_call",
          name: "edit_file",
          status: "completed",
          args: { target_file: "/workspace/a.ts" },
        },
      },
      {
        ts: 2,
        ev: {
          type: "tool_call",
          name: "run_terminal_cmd",
          status: "completed",
          args: { command: "bun test" },
        },
      },
    ];

    const out = coalesceCursorRunRows(rows);
    expect(out).toHaveLength(2);
    expect(out.every((row) => row.kind === "merged_tool_call")).toBe(true);
  });
});
