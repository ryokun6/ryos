import { describe, expect, test } from "bun:test";
import {
  buildToolInvocationLabel,
  isTerminalToolName,
  shouldRenderTerminalMarkerInPlainStream,
} from "../src/lib/cursorAgentToolDisplay.js";
import { coalesceCursorRunRows } from "../src/lib/cursorSdkRunCoalesce.js";

describe("cursorAgentToolDisplay", () => {
  test("recognizes SDK Shell and legacy run_terminal_cmd as terminal tools", () => {
    expect(isTerminalToolName("Shell")).toBe(true);
    expect(isTerminalToolName("run_terminal_cmd")).toBe(true);
    expect(isTerminalToolName("Read")).toBe(false);
  });

  test("collapses terminal tool calls to running/ran without command detail", () => {
    const running = buildToolInvocationLabel([
      {
        ev: {
          type: "tool_call",
          name: "Shell",
          status: "running",
          args: { command: "cd /workspace && bun test" },
        },
      },
    ]);
    expect(running.primary).toBe("Running terminal command");
    expect(running.secondary).toBe("");
    expect(running.done).toBe(false);

    const done = buildToolInvocationLabel([
      {
        ev: {
          type: "tool_call",
          name: "run_terminal_cmd",
          status: "completed",
          args: { command: "bun test" },
          result: "ok",
        },
      },
    ]);
    expect(done.primary).toBe("Ran terminal command");
    expect(done.secondary).toBe("");
    expect(done.done).toBe(true);
  });

  test("keeps file path secondary for non-terminal tools", () => {
    const read = buildToolInvocationLabel([
      {
        ev: {
          type: "tool_call",
          name: "read_file",
          status: "completed",
          args: { target_file: "/workspace/src/foo.ts" },
        },
      },
    ]);
    expect(read.primary).toBe("Read foo.ts");
    expect(read.secondary).toBe("/workspace/src/foo.ts");
  });

  test("shouldRenderTerminalMarkerInPlainStream hides success end banner", () => {
    expect(
      shouldRenderTerminalMarkerInPlainStream({
        status: "finished",
        summary: "",
      })
    ).toBe(false);
    expect(
      shouldRenderTerminalMarkerInPlainStream({
        status: "error",
        error: "boom",
      })
    ).toBe(true);
    expect(
      shouldRenderTerminalMarkerInPlainStream({
        status: "finished",
        summary: "Shipped the fix.",
      })
    ).toBe(true);
  });
});

describe("coalesceCursorRunRows terminal markers", () => {
  test("dedupes repeated terminal rows to a single entry", () => {
    const rows = [
      { ts: 1, type: "terminal", status: "running", summary: "" },
      { ts: 2, type: "terminal", status: "finished", summary: "Done." },
    ];
    const out = coalesceCursorRunRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("single");
    if (out[0]?.kind === "single") {
      expect(out[0].row).toMatchObject({
        type: "terminal",
        status: "finished",
        summary: "Done.",
      });
    }
  });
});
