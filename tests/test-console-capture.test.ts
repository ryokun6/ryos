import { describe, expect, test, beforeEach } from "bun:test";
import {
  clearConsoleCapture,
  formatConsoleEntriesForCopy,
  getConsoleCaptureSnapshot,
  installConsoleCapture,
  setConsoleCaptureEnabled,
  subscribeConsoleCapture,
} from "../src/utils/consoleCapture";

// Flush the microtask-batched notifier so snapshots are up to date.
const flush = () => new Promise<void>((r) => queueMicrotask(() => r()));

describe("consoleCapture", () => {
  beforeEach(async () => {
    installConsoleCapture();
    setConsoleCaptureEnabled(true);
    clearConsoleCapture();
    await flush();
  });

  test("captures console.log output into the buffer", async () => {
    console.log("hello", "world");
    await flush();
    const entries = getConsoleCaptureSnapshot();
    const last = entries[entries.length - 1];
    expect(last.level).toBe("log");
    expect(last.text).toBe("hello world");
  });

  test("captures different levels", async () => {
    console.warn("a warning");
    console.error("a problem");
    await flush();
    const entries = getConsoleCaptureSnapshot();
    const levels = entries.slice(-2).map((e) => e.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  test("serializes objects and handles circular references", async () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    console.log("obj:", obj);
    await flush();
    const entries = getConsoleCaptureSnapshot();
    const last = entries[entries.length - 1];
    expect(last.text).toContain('"a": 1');
    expect(last.text).toContain("[Circular]");
  });

  test("clearConsoleCapture empties the buffer", async () => {
    console.log("to be cleared");
    await flush();
    expect(getConsoleCaptureSnapshot().length).toBeGreaterThan(0);
    clearConsoleCapture();
    await flush();
    expect(getConsoleCaptureSnapshot().length).toBe(0);
  });

  test("notifies subscribers when a new log arrives", async () => {
    let calls = 0;
    const unsub = subscribeConsoleCapture(() => {
      calls += 1;
    });
    console.log("notify me");
    await flush();
    expect(calls).toBeGreaterThan(0);
    unsub();
  });

  test("formatConsoleEntriesForCopy produces readable lines", async () => {
    clearConsoleCapture();
    await flush();
    console.log("copy line");
    await flush();
    const text = formatConsoleEntriesForCopy(getConsoleCaptureSnapshot());
    expect(text).toContain("[LOG] copy line");
  });

  test("skips buffering while capture is disabled", async () => {
    setConsoleCaptureEnabled(false);
    await flush();

    console.log("not buffered");
    await flush();

    expect(getConsoleCaptureSnapshot()).toHaveLength(0);

    setConsoleCaptureEnabled(true);
    console.log("buffered again");
    await flush();

    expect(getConsoleCaptureSnapshot().at(-1)?.text).toBe("buffered again");
  });
});
