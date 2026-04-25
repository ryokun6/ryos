import { describe, expect, test } from "bun:test";
import { parseJSON } from "../api/_utils/parse-json";

describe("parseJSON", () => {
  test("returns null for empty or invalid values", () => {
    expect(parseJSON(null)).toBeNull();
    expect(parseJSON(undefined)).toBeNull();
    expect(parseJSON("not-json")).toBeNull();
    expect(parseJSON(42)).toBeNull();
  });

  test("parses JSON strings and passes objects through", () => {
    expect(parseJSON<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });

    const objectValue = { ok: true };
    expect(parseJSON<typeof objectValue>(objectValue)).toBe(objectValue);
  });
});
