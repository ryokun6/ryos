import { describe, expect, test } from "bun:test";
import { isRecoverableChunkLoadError } from "../src/utils/chunkLoadErrors";

describe("lazy app chunk errors", () => {
  test("recognizes browser dynamic-import failures", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: /assets/Calculator.js",
      "Importing a module script failed.",
      "error loading dynamically imported module",
      "Unable to preload CSS for /assets/Calculator.css",
    ]) {
      expect(
        isRecoverableChunkLoadError({
          error: new TypeError(message),
          offline: false,
        })
      ).toBe(true);
    }
  });

  test("treats Safari's generic load failure as recoverable only offline", () => {
    const error = new TypeError("Load failed");
    expect(isRecoverableChunkLoadError({ error, offline: true })).toBe(true);
    expect(isRecoverableChunkLoadError({ error, offline: false })).toBe(false);
  });

  test("does not hide application runtime errors", () => {
    expect(
      isRecoverableChunkLoadError({
        error: new TypeError("Cannot read properties of undefined"),
        offline: true,
      })
    ).toBe(false);
  });
});
