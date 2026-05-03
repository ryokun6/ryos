import { describe, expect, test } from "bun:test";
import {
  cursorSdkMetaKey,
  DEFAULT_RYOS_GITHUB_REPO_URL,
  executeCursorCloudAgent,
  executeListCursorCloudAgentRuns,
  formatCursorRunCompletionTelegramMessage,
  listCursorSdkRunsFromRedis,
  pickPrUrlFromRunGit,
  sendCursorAgentFollowup,
} from "../api/chat/tools/cursor-repo-agent.js";
import type { Redis } from "../api/_utils/redis.js";

/**
 * Minimal Redis stand-in: only implements `get` so we can exercise the
 * pre-Agent.resume validation paths in `sendCursorAgentFollowup`.
 */
function makeFakeRedis(initial: Record<string, unknown>): Redis {
  const store = new Map<string, unknown>(Object.entries(initial));
  const stub = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    },
  } as unknown as Redis;
  return stub;
}

describe("cursorCloudAgent gate", () => {
  test("rejects callers whose username is not the repo owner", async () => {
    const result = await executeCursorCloudAgent(
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

describe("formatCursorRunCompletionTelegramMessage", () => {
  test("includes title and summary on success", () => {
    const text = formatCursorRunCompletionTelegramMessage({
      ok: true,
      agentTitle: "Add dark mode",
      status: "finished",
      summary: "Added a system-wide dark mode toggle.",
    });
    expect(text.startsWith("Cursor agent done — Add dark mode")).toBe(true);
    expect(text).toContain("Added a system-wide dark mode toggle.");
  });

  test("falls back when summary is empty on success", () => {
    const text = formatCursorRunCompletionTelegramMessage({
      ok: true,
      agentTitle: "Refactor",
      status: "finished",
      summary: "",
    });
    expect(text).toContain("Cursor agent done — Refactor");
    expect(text).toContain("(no summary returned, status: finished)");
  });

  test("uses error body on failure and prefixes failed", () => {
    const text = formatCursorRunCompletionTelegramMessage({
      ok: false,
      agentTitle: "Try thing",
      status: "error",
      error: "boom",
    });
    expect(text.startsWith("Cursor agent failed — Try thing")).toBe(true);
    expect(text).toContain("boom");
  });

  test("truncates very long bodies", () => {
    const longSummary = "x".repeat(5000);
    const text = formatCursorRunCompletionTelegramMessage({
      ok: true,
      summary: longSummary,
    });
    expect(text.length).toBeLessThanOrEqual(3700);
    expect(text).toContain("…(truncated)");
  });
});

describe("pickPrUrlFromRunGit", () => {
  test("returns the first branch's prUrl when present", () => {
    const url = pickPrUrlFromRunGit({
      branches: [
        { repoUrl: "https://github.com/x/y", branch: "main" },
        { repoUrl: "https://github.com/x/y", prUrl: "https://github.com/x/y/pull/42" },
      ],
    });
    expect(url).toBe("https://github.com/x/y/pull/42");
  });

  test("returns undefined when git info is malformed", () => {
    expect(pickPrUrlFromRunGit(undefined)).toBeUndefined();
    expect(pickPrUrlFromRunGit({})).toBeUndefined();
    expect(pickPrUrlFromRunGit({ branches: [] })).toBeUndefined();
    expect(
      pickPrUrlFromRunGit({ branches: [{ repoUrl: "https://github.com/x/y" }] })
    ).toBeUndefined();
  });
});

describe("sendCursorAgentFollowup pre-checks", () => {
  const baseContext = {
    apiKey: "test-key",
    username: "ryo",
    log: () => {},
    logError: () => {},
  };

  test("rejects non-owner usernames", async () => {
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-1",
      prompt: "do thing",
      context: { ...baseContext, username: "alice", redis: makeFakeRedis({}) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  test("requires a non-empty prompt", async () => {
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-1",
      prompt: "   ",
      context: { ...baseContext, redis: makeFakeRedis({}) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  test("returns 404 when previous run is unknown", async () => {
    const result = await sendCursorAgentFollowup({
      previousRunId: "missing",
      prompt: "do thing",
      context: { ...baseContext, redis: makeFakeRedis({}) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  test("returns 403 when previous run belongs to another user", async () => {
    const redis = makeFakeRedis({
      [cursorSdkMetaKey("run-foreign")]: JSON.stringify({
        username: "someone-else",
        agentId: "bc-abc",
        terminalStatus: "finished",
      }),
    });
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-foreign",
      prompt: "do thing",
      context: { ...baseContext, redis },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  test("returns 409 when the previous run is still in progress", async () => {
    const redis = makeFakeRedis({
      [cursorSdkMetaKey("run-busy")]: JSON.stringify({
        username: "ryo",
        agentId: "bc-abc",
        // terminalStatus omitted -> still in flight
      }),
    });
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-busy",
      prompt: "do thing",
      context: { ...baseContext, redis },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain("in progress");
    }
  });

  test("returns 409 when another follow-up is already mid-flight", async () => {
    const redis = makeFakeRedis({
      [cursorSdkMetaKey("run-prev")]: JSON.stringify({
        username: "ryo",
        agentId: "bc-abc",
        terminalStatus: "finished",
        // a concurrent followup has been queued and not yet finished
        activeRunId: "run-other",
      }),
    });
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-prev",
      prompt: "do thing",
      context: { ...baseContext, redis },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain("busy");
    }
  });

  test("returns 409 when previous run has no agent id", async () => {
    const redis = makeFakeRedis({
      [cursorSdkMetaKey("run-noagent")]: JSON.stringify({
        username: "ryo",
        terminalStatus: "finished",
      }),
    });
    const result = await sendCursorAgentFollowup({
      previousRunId: "run-noagent",
      prompt: "do thing",
      context: { ...baseContext, redis },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain("agent id");
    }
  });
});

function makeListTestRedis(
  entries: Record<string, string>
): Redis {
  const store = new Map(Object.entries(entries));
  return {
    scan: async (_cursor: string | number) => {
      const keys = [...store.keys()].filter(
        (k) => k.startsWith("cursor-sdk-run:") && k.endsWith(":meta")
      );
      return [0, keys];
    },
    mget: async (...keys: string[]) =>
      keys.map((k) => store.get(k) ?? null),
  } as unknown as Redis;
}

describe("listCursorSdkRunsFromRedis", () => {
  test("dedupes, sorts running first, and exposes nextRunId when present", async () => {
    const redis = makeListTestRedis({
      "cursor-sdk-run:abc:meta": JSON.stringify({
        runId: "abc",
        agentId: "ag1",
        createdAt: 100,
        activeRunId: "abc",
        promptPreview: "hello",
      }),
      "cursor-sdk-run:done:meta": JSON.stringify({
        runId: "done",
        agentId: "ag1",
        createdAt: 50,
        finishedAt: 200,
        terminalStatus: "finished",
        summary: "All good",
        prUrl: "https://github.com/x/y/pull/1",
        nextRunId: "abc",
      }),
    });
    const { runs, scanIncomplete, totalCount } = await listCursorSdkRunsFromRedis(
      redis,
      10
    );
    expect(scanIncomplete).toBe(false);
    expect(totalCount).toBe(2);
    expect(runs.length).toBe(2);
    expect(runs[0].status).toBe("running");
    expect(runs[0].runId).toBe("abc");
    expect(runs[1].prUrl).toBe("https://github.com/x/y/pull/1");
    expect(runs[1].nextRunId).toBe("abc");
    expect(runs[1].summaryPreview).toContain("All good");
  });
});

describe("executeListCursorCloudAgentRuns", () => {
  test("rejects non-owner", async () => {
    const result = await executeListCursorCloudAgentRuns(
      {},
      {
        username: "alice",
        redis: makeListTestRedis({}),
        log: () => {},
        logError: () => {},
        env: {},
      }
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("restricted");
    }
  });

  test("requires Redis", async () => {
    const result = await executeListCursorCloudAgentRuns(
      {},
      {
        username: "ryo",
        log: () => {},
        logError: () => {},
        env: {},
      }
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Redis");
    }
  });

  test("returns pollUrl for each run", async () => {
    const redis = makeListTestRedis({
      "cursor-sdk-run:x:meta": JSON.stringify({
        runId: "x",
        agentId: "a",
        createdAt: 1,
        activeRunId: "x",
      }),
    });
    const result = await executeListCursorCloudAgentRuns(
      { limit: 5 },
      {
        username: "ryo",
        redis,
        log: () => {},
        logError: () => {},
        env: {},
      }
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.runs.length).toBe(1);
      expect(result.runs[0].pollUrl).toContain("/api/ai/cursor-run-status");
      expect(result.runs[0].pollUrl).toContain(encodeURIComponent("x"));
    }
  });
});
