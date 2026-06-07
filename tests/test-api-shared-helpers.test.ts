import { describe, expect, test } from "bun:test";
import { decodeHtmlEntitiesOnce } from "../api/_utils/html-entities";
import {
  generateRandomHexId,
  parseJSON,
} from "../api/_utils/redis-helpers";

describe("API shared helpers", () => {
  test("decodeHtmlEntitiesOnce decodes common and numeric entities once", () => {
    expect(decodeHtmlEntitiesOnce("&amp; &lt; &gt; &quot; &#39; &apos;")).toBe(
      "& < > \" ' '"
    );
    expect(decodeHtmlEntitiesOnce("snowman: &#x2603;")).toBe("snowman: \u2603");
    expect(decodeHtmlEntitiesOnce("&amp;lt;")).toBe("&lt;");
  });

  test("generateRandomHexId returns lowercase hex at requested byte length", () => {
    const id = generateRandomHexId(12);
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  test("parseJSON accepts objects and valid JSON strings only", () => {
    const objectValue = { ok: true };
    expect(parseJSON<typeof objectValue>(objectValue)).toBe(objectValue);
    expect(parseJSON<{ ok: boolean }>("{\"ok\":true}")).toEqual({ ok: true });
    expect(parseJSON("{nope")).toBeNull();
    expect(parseJSON(null)).toBeNull();
  });
});
