import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GOOGLE_FILES_POLL_TIMEOUT_MS } from "../../../api/_utils/upload-provider-file.js";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AI SDK 7 uploadFile wiring", () => {
  test("Telegram injects provider file references with full MIME mediaType", () => {
    const source = readSource("api/webhooks/telegram.ts");
    expect(source).toContain("uploadProviderFileForModel");
    expect(source).toContain('type: "file" as const');
    expect(source).toContain("uploaded.providerReference");
    expect(source).toContain("uploaded.mediaType");
    // Top-level "image" breaks resolveFullMediaType for provider references.
    expect(source).not.toMatch(/mediaType:\s*"image"/);
    expect(source).not.toMatch(/type:\s*"image"\s+as\s+const/);
  });

  test("applet-ai uploads attachments via google.files() with full MIME", () => {
    const source = readSource("api/applet-ai.ts");
    expect(source).toContain("uploadFile");
    expect(source).toContain("google.files()");
    expect(source).toContain("uploaded.providerReference");
    expect(source).toContain("uploaded.mediaType ||");
    expect(source).toContain("GOOGLE_FILES_POLL_TIMEOUT_MS");
    expect(source).not.toMatch(/mediaType:\s*"image"/);
  });

  test("upload helper selects files API and caps Google poll timeout", () => {
    const source = readSource("api/_utils/upload-provider-file.ts");
    expect(source).toContain("openai.files()");
    expect(source).toContain("anthropic.files()");
    expect(source).toContain("google.files()");
    expect(source).toContain("uploadFile");
    expect(source).toContain("pollTimeoutMs: GOOGLE_FILES_POLL_TIMEOUT_MS");
    expect(source).toContain("mediaType: result.mediaType || mediaType");
    expect(GOOGLE_FILES_POLL_TIMEOUT_MS).toBe(30_000);
  });
});
