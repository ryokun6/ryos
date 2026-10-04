import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("applet ai model config", () => {
  test("text and image generation use the default model", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/applet-ai.ts"),
      "utf-8"
    );

    expect(source).toContain("getModelInstance(DEFAULT_MODEL)");
    expect(source).toContain("uploadProviderFileForModel");
    expect(source).not.toMatch(/gemini/i);
    expect(source).not.toContain("@ai-sdk/google");
  });
});
