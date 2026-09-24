import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  test("applet-ai uploads attachments through the shared provider helper", () => {
    const source = readSource("api/applet-ai.ts");
    expect(source).toContain("uploadProviderFileForModel");
    expect(source).toContain("modelId: DEFAULT_MODEL");
    expect(source).toContain("uploaded.providerReference");
    expect(source).toContain("uploaded.mediaType");
    expect(source).not.toContain("google.files()");
    expect(source).not.toMatch(/mediaType:\s*"image"/);
  });

  test("upload helper selects OpenAI and Anthropic files APIs", () => {
    const source = readSource("api/_utils/upload-provider-file.ts");
    expect(source).toContain("openai.files()");
    expect(source).toContain("anthropic.files()");
    expect(source).not.toContain("google.files()");
    expect(source).toContain("uploadFile");
    expect(source).toContain("mediaType: result.mediaType || mediaType");
  });
});
