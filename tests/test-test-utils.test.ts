import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { uniqueTestUsername } from "./test-utils";

afterEach(() => {
  spyOn(crypto, "getRandomValues").mockRestore();
});

describe("uniqueTestUsername", () => {
  test("rejects bytes outside the unbiased range", () => {
    let callCount = 0;
    const randomValues = spyOn(crypto, "getRandomValues");
    randomValues.mockImplementation((array) => {
      const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength
      );
      bytes.fill(callCount++ === 0 ? 255 : 0);
      return array;
    });

    expect(uniqueTestUsername("test")).toBe(`test${"b".repeat(12)}`);
    expect(randomValues).toHaveBeenCalledTimes(2);
  });

  test("returns validator-safe usernames within the length limit", () => {
    for (let index = 0; index < 100; index += 1) {
      const username = uniqueTestUsername("sample_");
      expect(username).toMatch(/^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i);
      expect(username.length).toBeLessThanOrEqual(30);
    }
  });

  test("rejects prefixes that cannot produce a valid username", () => {
    expect(() => uniqueTestUsername("1invalid")).toThrow();
    expect(() => uniqueTestUsername("x".repeat(19))).toThrow();
  });
});
