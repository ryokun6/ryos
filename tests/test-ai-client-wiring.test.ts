import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("AI client wiring", () => {
  test("Ryo room replies use the shared AI API client", () => {
    const source = readFileSync("src/apps/chats/hooks/useRyoChat.ts", "utf8");

    expect(source).toContain("requestRyoReply");
    expect(source).not.toContain("/api/ai/ryo-reply");
  });

  test("clear-chat memory extraction uses the shared AI API client", () => {
    const source = readFileSync("src/apps/chats/hooks/useAiChat.ts", "utf8");

    expect(source).toContain("extractMemoriesFromChat");
    expect(source).not.toContain("/api/ai/extract-memories");
  });

  test("proactive greeting uses the shared AI API client", () => {
    const source = readFileSync(
      "src/apps/chats/hooks/useProactiveGreeting.ts",
      "utf8"
    );

    expect(source).toContain("requestProactiveGreeting");
    expect(source).not.toContain("abortableFetch(getApiUrl(\"/api/chat\")");
  });
});
