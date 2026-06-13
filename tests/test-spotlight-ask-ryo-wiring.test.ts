import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Spotlight Ask Ryo wiring", () => {
  test("Chats forwards launch initialData to the controller", () => {
    const source = readSource(
      "src/apps/chats/components/chats-app/ChatsAppComponent.tsx"
    );

    expect(source).toMatch(/initialData,\s*\n\s*instanceId,/);
    expect(source).toMatch(/useChatsAppController\(\{[\s\S]*initialData,/);
  });

  test("Spotlight passes a unique prefill request to Chats", () => {
    const source = readSource("src/hooks/useSpotlightSearch.ts");

    expect(source).toContain('launchApp("chats"');
    expect(source).toContain("prefillMessage: trimmed");
    expect(source).toContain("autoSend: true");
    expect(source).toContain("prefillRequestId:");
  });

  test("Chats applies repeated identical prefill messages by request id", () => {
    const source = readSource(
      "src/apps/chats/components/chats-app/useChatsAppController.tsx"
    );

    expect(source).toContain(
      "const prefillRequestKey = initialData?.prefillRequestId ?? prefillMessage;"
    );
    expect(source).toContain(
      "prefillRequestKey !== prefillAppliedRef.current"
    );
    expect(source).toContain("handleDirectMessageSubmit(prefillMessage)");
  });
});
