import { describe, expect, test } from "bun:test";
import {
  buildIDBValuePreview,
  estimateIDBValueBytes,
  formatIDBEntriesForCopy,
  formatIDBKey,
  formatIDBStoresForCopy,
  summarizeIDBValue,
} from "../src/components/debug/indexedDBInspector";

describe("formatIDBKey", () => {
  test("passes strings through and stringifies numbers", () => {
    expect(formatIDBKey("ryos:files")).toBe("ryos:files");
    expect(formatIDBKey(42)).toBe("42");
  });

  test("formats dates and compound array keys", () => {
    const date = new Date("2026-07-03T00:00:00.000Z");
    expect(formatIDBKey(date)).toBe("2026-07-03T00:00:00.000Z");
    expect(formatIDBKey(["a", 1])).toBe("[a, 1]");
  });

  test("formats binary keys with byte lengths", () => {
    expect(formatIDBKey(new ArrayBuffer(8))).toBe("ArrayBuffer(8)");
    expect(formatIDBKey(new Uint8Array(4))).toBe("Uint8Array(4)");
  });
});

describe("estimateIDBValueBytes", () => {
  test("uses text length for strings and JSON length for objects", () => {
    expect(estimateIDBValueBytes("hello")).toBe(5);
    expect(estimateIDBValueBytes({ a: 1 })).toBe(
      JSON.stringify({ a: 1 }).length
    );
  });

  test("uses real byte sizes for binary values", () => {
    expect(estimateIDBValueBytes(new Blob(["abcd"]))).toBe(4);
    expect(estimateIDBValueBytes(new ArrayBuffer(16))).toBe(16);
    expect(estimateIDBValueBytes(new Uint8Array(3))).toBe(3);
  });

  test("returns null when no meaningful size exists", () => {
    expect(estimateIDBValueBytes(null)).toBeNull();
    expect(estimateIDBValueBytes(undefined)).toBeNull();
    expect(estimateIDBValueBytes(7)).toBeNull();
  });
});

describe("summarizeIDBValue", () => {
  test("summarizes primitives", () => {
    expect(summarizeIDBValue(undefined)).toBe("undefined");
    expect(summarizeIDBValue(null)).toBe("null");
    expect(summarizeIDBValue(true)).toBe("boolean · true");
    expect(summarizeIDBValue("abc")).toBe("string · 3 B");
  });

  test("summarizes blobs with mime type and size", () => {
    const blob = new Blob(["12345678"], { type: "image/png" });
    expect(summarizeIDBValue(blob)).toBe("Blob · image/png · 8 B");
  });

  test("summarizes arrays and objects with counts and pluralization", () => {
    expect(summarizeIDBValue([1])).toContain("array · 1 item");
    expect(summarizeIDBValue([1, 2])).toContain("array · 2 items");
    expect(summarizeIDBValue({ a: 1 })).toContain("object · 1 key");
    expect(summarizeIDBValue({ a: 1, b: 2 })).toContain("object · 2 keys");
  });
});

describe("buildIDBValuePreview", () => {
  test("pretty-prints objects as JSON", () => {
    const { text, truncated } = buildIDBValuePreview({ a: 1 });
    expect(text).toBe('{\n  "a": 1\n}');
    expect(truncated).toBe(false);
  });

  test("truncates long values and flags it", () => {
    const { text, truncated } = buildIDBValuePreview("x".repeat(50), 10);
    expect(text).toBe(`${"x".repeat(10)}…`);
    expect(truncated).toBe(true);
  });

  test("renders nested binary values as placeholders", () => {
    const value = {
      blob: new Blob(["abc"], { type: "image/png" }),
      buffer: new ArrayBuffer(4),
    };
    const { text } = buildIDBValuePreview(value);
    expect(text).toContain("[Blob image/png 3 B]");
    expect(text).toContain("[ArrayBuffer 4 B]");
  });

  test("handles circular references", () => {
    const value: Record<string, unknown> = { name: "loop" };
    value.self = value;
    const { text } = buildIDBValuePreview(value);
    expect(text).toContain("[Circular]");
  });

  test("describes top-level blobs without reading them", () => {
    const blob = new Blob(["1234"], { type: "audio/mpeg" });
    expect(buildIDBValuePreview(blob).text).toBe("[Blob audio/mpeg 4 B]");
  });
});

describe("copy formatting", () => {
  test("formats a store list dump", () => {
    const text = formatIDBStoresForCopy("ryOS", [
      { name: "documents", count: 1 },
      { name: "images", count: 3 },
    ]);
    expect(text).toBe(
      [
        "IndexedDB database: ryOS",
        "- documents: 1 record",
        "- images: 3 records",
      ].join("\n")
    );
  });

  test("formats an entries dump with previews", () => {
    const text = formatIDBEntriesForCopy("documents", [
      {
        key: "readme.md",
        summary: "string · 5 B",
        preview: "hello",
        previewTruncated: false,
      },
    ]);
    expect(text).toContain("IndexedDB store: documents (1 entries)");
    expect(text).toContain("— readme.md · string · 5 B");
    expect(text).toContain("hello");
  });
});
