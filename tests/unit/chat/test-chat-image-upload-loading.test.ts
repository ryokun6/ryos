import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("chat image upload loading UI", () => {
  test("useAiChat tracks upload progress and aborts on stop", () => {
    const source = readSource("src/apps/chats/hooks/useAiChat.ts");
    expect(source).toContain("imageUploadProgress");
    expect(source).toContain("isUploadingImage");
    expect(source).toContain("imageUploadAbortRef");
    expect(source).toContain("onProgress:");
    expect(source).toContain("imageUploadAbortRef.current?.abort()");
  });

  test("ChatInput shows stop while uploading and progress on preview", () => {
    const windowSource = readSource(
      "src/apps/chats/components/chats-app/ChatsWindowContent.tsx"
    );
    expect(windowSource).toContain(
      "isLoading={isLoading || isRyoLoading || isUploadingImage}"
    );
    expect(windowSource).toContain("imageUploadProgress={imageUploadProgress}");

    const preview = readSource(
      "src/apps/chats/components/chat-input/ChatInputImagePreview.tsx"
    );
    expect(preview).toContain('role="progressbar"');
    expect(preview).toContain("imageUploadProgress");
    expect(preview).toContain("progressPercent");
  });
});
