import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RYOS_GITHUB_REPO_URL,
  executeCursorRyOsRepoAgent,
} from "../api/chat/tools/cursor-repo-agent.js";

describe("cursorRyOsRepoAgent gate", () => {
  test("rejects callers whose username is not the repo owner", async () => {
    const result = await executeCursorRyOsRepoAgent(
      { prompt: "touch foo" },
      {
        username: "alice",
        log: () => {},
        logError: () => {},
        env: {},
        apiKey: "test-key",
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("restricted");
  });

  test("default GitHub repo points at ryokun6/ryos", () => {
    expect(DEFAULT_RYOS_GITHUB_REPO_URL).toBe(
      "https://github.com/ryokun6/ryos"
    );
  });
});
