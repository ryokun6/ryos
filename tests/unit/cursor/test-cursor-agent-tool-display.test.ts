import { describe, expect, test } from "bun:test";
import {
  buildToolInvocationLabel,
  isTerminalToolName,
  shouldRenderTerminalMarkerInPlainStream,
} from "../../../src/lib/cursorAgentToolDisplay.js";
import { coalesceCursorRunRows } from "../../../src/lib/cursorSdkRunCoalesce.js";

describe("cursorAgentToolDisplay", () => {
  test("recognizes SDK Shell and legacy run_terminal_cmd as terminal tools", () => {
    expect(isTerminalToolName("Shell")).toBe(true);
    expect(isTerminalToolName("run_terminal_cmd")).toBe(true);
    expect(isTerminalToolName("Read")).toBe(false);
  });

  test("shows Running/Ran with the actual command", () => {
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
    expect(running.verb).toBe("Running");
    expect(running.detail).toBe("cd /workspace && bun test");
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
    expect(done.verb).toBe("Ran");
    expect(done.detail).toBe("bun test");
    expect(done.done).toBe(true);
  });

  test("splits read verb from file detail", () => {
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
    expect(read.verb).toBe("Read");
    expect(read.detail).toBe("foo.ts");
  });

  test("splits search verb from query detail", () => {
    const search = buildToolInvocationLabel([
      {
        ev: {
          type: "tool_call",
          name: "grep_search",
          status: "completed",
          args: { pattern: ".error" },
        },
      },
    ]);
    expect(search.verb).toBe("Search text");
    expect(search.detail).toBe(".error");
  });

  test("shows file count in detail for grouped reads", () => {
    const reads = buildToolInvocationLabel([
      { ev: { type: "tool_call", name: "read_file", status: "completed", args: { path: "a.ts" } } },
      { ev: { type: "tool_call", name: "read_file", status: "completed", args: { path: "b.ts" } } },
    ]);
    expect(reads.verb).toBe("Read");
    expect(reads.detail).toBe("2 files");
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
    ).toBe(false);
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
