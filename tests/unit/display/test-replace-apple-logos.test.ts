import { describe, expect, test } from "bun:test";
import { resolveReplaceAppleLogos } from "@/utils/replaceAppleLogos";

describe("resolveReplaceAppleLogos", () => {
  test("auto defaults on in the iOS shell", () => {
    expect(resolveReplaceAppleLogos(null, true)).toBe(true);
    expect(resolveReplaceAppleLogos(undefined, true)).toBe(true);
  });

  test("auto defaults off outside the iOS shell", () => {
    expect(resolveReplaceAppleLogos(null, false)).toBe(false);
    expect(resolveReplaceAppleLogos(undefined, false)).toBe(false);
  });

  test("explicit debug override wins", () => {
    expect(resolveReplaceAppleLogos(true, false)).toBe(true);
    expect(resolveReplaceAppleLogos(false, true)).toBe(false);
  });
});
