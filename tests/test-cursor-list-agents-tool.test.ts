import { describe, expect, test } from "bun:test";
import { executeListRecentCursorAgents } from "../api/chat/tools/cursor-list-agents.js";

describe("listRecentCursorAgents gate", () => {
  test("rejects callers whose username is not the repo owner", async () => {
    const result = await executeListRecentCursorAgents(
      {},
      {
        username: "alice",
        log: () => {},
        logError: () => {},
        env: {},
        apiKey: "test-key",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("restricted");
    }
  });

  test("returns actionable error when api key is missing", async () => {
    const result = await executeListRecentCursorAgents(
      {},
      {
        username: "ryo",
        log: () => {},
        logError: () => {},
        env: {},
        apiKey: "",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("CURSOR_API_KEY");
    }
  });
});
