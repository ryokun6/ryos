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
    expect(source).toContain("isSubmittingRef");
    expect(source).toContain("onProgress:");
    expect(source).toContain("imageUploadAbortRef.current?.abort()");
    // Re-entry guard before starting another upload/submit.
    expect(source).toContain(
      "if (isSubmittingRef.current || imageUploadAbortRef.current)"
    );
    // Keep overlay until chat loading owns the Stop button.
    expect(source).toContain("if (!isLoading) return;");
    expect(source).toContain("keepSubmitGuard");
    expect(source).toContain("if (!keepSubmitGuard)");
  });

  test("ChatInput shows stop while uploading and progress on preview", () => {
    const windowSource = readSource(
      "src/apps/chats/components/chats-app/ChatsWindowContent.tsx"
    );
    expect(windowSource).toContain(
      "isLoading={isLoading || isRyoLoading || isUploadingImage}"
    );
    expect(windowSource).toContain("imageUploadProgress={imageUploadProgress}");

    const view = readSource(
      "src/apps/chats/components/chat-input/ChatInputView.tsx"
    );
    expect(view).toContain("if (vm.isLoading)");

    const preview = readSource(
      "src/apps/chats/components/chat-input/ChatInputImagePreview.tsx"
    );
    expect(preview).toContain('role="progressbar"');
    expect(preview).toContain("imageUploadProgress");
    expect(preview).toContain("strokeDashoffset");
    expect(preview).toContain("RING_CIRCUMFERENCE");
    expect(preview).toContain("-rotate-90");
    expect(preview).toContain("isIndeterminate");
    expect(preview).toContain("animate-spin");
    expect(preview).toContain("INDETERMINATE_ARC");
  });
});
