import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RYOS_GITHUB_REPO_URL,
  executeCursorRyOsRepoAgent,
  extractPrUrlFromTerminalPayload,
  findTerminalEventInRedisLines,
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

  test("extractPrUrlFromTerminalPayload reads PR from SDK git branches", () => {
    const url = extractPrUrlFromTerminalPayload({
      type: "terminal",
      status: "finished",
      git: {
        branches: [
          {
            repoUrl: "https://github.com/ryokun6/ryos",
            prUrl: "https://github.com/ryokun6/ryos/pull/42",
          },
        ],
      },
    });
    expect(url).toBe("https://github.com/ryokun6/ryos/pull/42");
  });

  test("findTerminalEventInRedisLines picks terminal entry", () => {
    const t = findTerminalEventInRedisLines([
      '{"type":"stream"}',
      '{"type":"terminal","status":"finished","summary":"done"}',
    ]);
    expect(t?.status).toBe("finished");
    expect(t?.summary).toBe("done");
  });
});
