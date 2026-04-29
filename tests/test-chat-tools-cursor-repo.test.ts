import { describe, expect, test } from "bun:test";
import type { Redis } from "@upstash/redis";
import { createChatTools } from "../api/chat/tools/index.js";

class FakeRedis {
  async get(): Promise<null> {
    return null;
  }
}

describe("cursorRepoAgent telegram tool", () => {
  test("telegram profile exposes cursorRepoAgent execute", () => {
    const tools = createChatTools(
      {
        log: () => undefined,
        logError: () => undefined,
        env: {},
        username: "alice",
        redis: new FakeRedis() as unknown as Redis,
      },
      { profile: "telegram" }
    );
    expect("cursorRepoAgent" in tools).toBe(true);
    expect(typeof tools.cursorRepoAgent.execute).toBe("function");
  });

  test("fails safely without Telegram routing context", async () => {
    const tools = createChatTools(
      {
        log: () => undefined,
        logError: () => undefined,
        env: { CURSOR_API_KEY: "fake" },
        username: "alice",
        redis: new FakeRedis() as unknown as Redis,
      },
      { profile: "telegram" }
    );

    const result = await tools.cursorRepoAgent.execute?.({
      instructions: "say hi",
      repoUrl: "https://github.com/ryokun6/ryos",
    });

    expect(result?.success).toBe(false);
    expect((result?.message || "").toLowerCase()).toContain("telegram");
  });
});
