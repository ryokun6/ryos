import { describe, expect, test, beforeEach } from "bun:test";
import {
  clearConsoleCapture,
  formatConsoleArguments,
  formatConsoleEntriesForCopy,
  getConsoleCaptureSnapshot,
  installConsoleCapture,
  setConsoleCaptureEnabled,
  sanitizeConsoleStyle,
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
    expect(last.displayParts).toEqual([
      { type: "text", text: "obj:" },
      { type: "text", text: " " },
      {
        type: "json",
        text: '{\n  "a": 1,\n  "self": "[Circular]"\n}',
        summary: "Object(2) { a, self }",
      },
    ]);
  });

  test("represents JSON arguments as compact expandable display parts", () => {
    const formatted = formatConsoleArguments([
      "payload",
      {
        status: "ok",
        items: [1, 2, 3],
        metadata: { cached: true },
        requestId: "abc",
      },
      ["alpha", "beta"],
    ]);

    expect(formatted.text).toContain('"status": "ok"');
    expect(formatted.displayParts?.map((part) => part.type)).toEqual([
      "text",
      "text",
      "json",
      "text",
      "json",
    ]);
    expect(formatted.displayParts?.[2]).toMatchObject({
      type: "json",
      summary: "Object(4) { status, items, metadata, … }",
    });
    expect(formatted.displayParts?.[4]).toMatchObject({
      type: "json",
      summary: "Array(2)",
    });
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

  test("sanitizes console styles to a strict safe subset", () => {
    expect(
      sanitizeConsoleStyle(
        "color: #FFF; background: #000; font-weight: bold; position: fixed; background-image: url(https://example.com/x)"
      )
    ).toEqual({
      color: "#fff",
      backgroundColor: "#000",
      fontWeight: "bold",
    });
  });

  test("parses multiple %c segments and keeps readable plain text", () => {
    const formatted = formatConsoleArguments([
      "%cRed%c white on black",
      "color: red",
      "color: #fff; background-color: #000",
    ]);

    expect(formatted.text).toBe("Red white on black");
    expect(formatted.styledSegments).toEqual([
      { text: "Red", style: { color: "red" } },
      {
        text: " white on black",
        style: { color: "#fff", backgroundColor: "#000" },
      },
    ]);
  });

  test("captures Tone-style %c logs without exposing formatting syntax", async () => {
    console.log(
      "%c * Tone.js v15.1.22 *",
      "background: #000; color: #fff"
    );
    await flush();

    const entries = getConsoleCaptureSnapshot();
    const last = entries[entries.length - 1];
    expect(last.text).toBe(" * Tone.js v15.1.22 *");
    expect(last.styledSegments).toEqual([
      {
        text: " * Tone.js v15.1.22 *",
        style: { backgroundColor: "#000", color: "#fff" },
      },
    ]);

    const copied = formatConsoleEntriesForCopy([last]);
    expect(copied).toContain("[LOG]  * Tone.js v15.1.22 *");
    expect(copied).not.toContain("%c");
    expect(copied).not.toContain("background:");
  });

  test("keeps styled text while making a trailing object expandable", () => {
    const formatted = formatConsoleArguments([
      "%cRequest",
      "color: blue; font-weight: bold",
      { method: "GET", status: 200 },
    ]);

    expect(formatted.text).toBe(
      'Request {\n  "method": "GET",\n  "status": 200\n}'
    );
    expect(formatted.displayParts).toEqual([
      {
        type: "text",
        text: "Request",
        style: { color: "blue", fontWeight: "bold" },
      },
      { type: "text", text: " " },
      {
        type: "json",
        text: '{\n  "method": "GET",\n  "status": 200\n}',
        summary: "Object(2) { method, status }",
      },
    ]);
  });

  test("falls back to plain text for unmatched %c placeholders", () => {
    expect(formatConsoleArguments(["%c unmatched"]).text).toBe("%c unmatched");
  });
});
