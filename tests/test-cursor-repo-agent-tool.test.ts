import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RYOS_GITHUB_REPO_URL,
  executeCursorRyOsRepoAgent,
  formatCursorRunCompletionTelegramMessage,
} from "../api/chat/tools/cursor-repo-agent.js";
import {
  executeListRecentCursorAgents,
  githubRepoSlug,
} from "../api/chat/tools/list-recent-cursor-agents.js";

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

  test("reports missing api key clearly", async () => {
    const result = await executeListRecentCursorAgents(
      {},
      {
        username: "ryo",
        log: () => {},
        logError: () => {},
        env: {},
        apiKey: "   ",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("CURSOR_API_KEY");
    }
  });
});

describe("githubRepoSlug helper", () => {
  test("parses https github urls to owner/repo", () => {
    expect(githubRepoSlug("https://github.com/ryokun6/ryos")).toBe("ryokun6/ryos");
    expect(githubRepoSlug("https://github.com/Acme/RePo.git")).toBe("acme/repo");
  });
});
