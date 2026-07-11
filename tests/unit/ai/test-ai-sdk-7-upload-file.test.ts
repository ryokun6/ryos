import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AI SDK 7 uploadFile wiring", () => {
  test("Telegram injects provider file references for images", () => {
    const source = readSource("api/webhooks/telegram.ts");
    expect(source).toContain("uploadProviderFileForModel");
    expect(source).toContain('type: "file" as const');
    expect(source).toContain("providerReference");
    expect(source).not.toMatch(/type:\s*"image"\s+as\s+const/);
  });

  test("applet-ai uploads attachments via google.files()", () => {
    const source = readSource("api/applet-ai.ts");
    expect(source).toContain("uploadFile");
    expect(source).toContain("google.files()");
    expect(source).toContain("providerReference");
  });

  test("upload helper selects files API by model provider", () => {
    const source = readSource("api/_utils/upload-provider-file.ts");
    expect(source).toContain("openai.files()");
    expect(source).toContain("anthropic.files()");
    expect(source).toContain("google.files()");
    expect(source).toContain("uploadFile");
  });
});
