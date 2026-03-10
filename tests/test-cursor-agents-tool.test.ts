import { describe, expect, mock, test } from "bun:test";
import { executeCursorAgentsControl } from "../api/chat/tools/executors.js";

const baseContext = {
  log: mock(() => {}),
  logError: mock(() => {}),
  env: {
    CURSOR_API_KEY: "cursor-test-key",
  },
};

async function withMockedFetch(
  mockFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  callback: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("executeCursorAgentsControl", () => {
  test("returns a helpful error when no API key is configured", async () => {
    const result = await executeCursorAgentsControl(
      { action: "list" },
      {
        ...baseContext,
        env: {},
      }
    );

    expect(result).toEqual({
      success: false,
      message:
        "Cursor API key not configured. Set CURSOR_API_KEY or CURSOR_AGENTS_API_KEY to enable Cursor Agents.",
    });
  });

  test("lists agents with bearer auth and query parameters", async () => {
    await withMockedFetch(async (input, init) => {
      expect(String(input)).toBe(
        "https://api.cursor.com/v0/agents?limit=5&cursor=bc_next&prUrl=https%3A%2F%2Fgithub.com%2Facme%2Fryos%2Fpull%2F1"
      );
      expect(init?.headers).toEqual({
        Authorization: "Bearer cursor-test-key",
        "Content-Type": "application/json",
      });

      return Response.json({
        agents: [
          {
            id: "bc_123",
            name: "Add README Documentation",
            status: "RUNNING",
            createdAt: "2026-03-10T00:00:00Z",
            summary: "Working on docs",
            source: {
              repository: "https://github.com/acme/ryos",
              ref: "main",
            },
            target: {
              url: "https://cursor.com/agents?id=bc_123",
              branchName: "cursor/add-readme",
            },
          },
        ],
        nextCursor: "bc_after",
      });
    }, async () => {
      const result = await executeCursorAgentsControl(
        {
          action: "list",
          limit: 5,
          cursor: "bc_next",
          prUrl: "https://github.com/acme/ryos/pull/1",
        },
        baseContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("Found 1 Cursor agent.");
      expect(result.nextCursor).toBe("bc_after");
      expect(result.agents).toEqual([
        {
          id: "bc_123",
          name: "Add README Documentation",
          status: "RUNNING",
          createdAt: "2026-03-10T00:00:00Z",
          summary: "Working on docs",
          source: {
            repository: "https://github.com/acme/ryos",
            ref: "main",
            prUrl: undefined,
          },
          target: {
            branchName: "cursor/add-readme",
            url: "https://cursor.com/agents?id=bc_123",
            prUrl: undefined,
            autoCreatePr: undefined,
            openAsCursorGithubApp: undefined,
            skipReviewerRequest: undefined,
          },
        },
      ]);
    });
  });

  test("gets one agent status", async () => {
    await withMockedFetch(async (input, init) => {
      expect(String(input)).toBe("https://api.cursor.com/v0/agents/bc_456");
      expect(init?.headers).toEqual({
        Authorization: "Bearer cursor-test-key",
        "Content-Type": "application/json",
      });

      return Response.json({
        id: "bc_456",
        name: "Fix test suite",
        status: "FINISHED",
        createdAt: "2026-03-10T01:00:00Z",
        summary: "All done",
        source: {
          repository: "https://github.com/acme/ryos",
          ref: "main",
        },
        target: {
          url: "https://cursor.com/agents?id=bc_456",
          prUrl: "https://github.com/acme/ryos/pull/42",
        },
      });
    }, async () => {
      const result = await executeCursorAgentsControl(
        { action: "status", id: "bc_456" },
        baseContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Agent "Fix test suite" is currently FINISHED.');
      expect(result.agent?.target.prUrl).toBe("https://github.com/acme/ryos/pull/42");
    });
  });

  test("launches an agent with repository source and target options", async () => {
    await withMockedFetch(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        Authorization: "Bearer cursor-test-key",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: {
          text: "Add Cursor Agents support to chat tools",
        },
        model: "default",
        source: {
          repository: "https://github.com/acme/ryos",
          ref: "main",
        },
        target: {
          branchName: "cursor/add-agents-tool",
          autoCreatePr: true,
          openAsCursorGithubApp: true,
          skipReviewerRequest: true,
        },
      });

      return new Response(
        JSON.stringify({
          id: "bc_789",
          name: "Cursor Agents integration",
          status: "CREATING",
          createdAt: "2026-03-10T02:00:00Z",
          source: {
            repository: "https://github.com/acme/ryos",
            ref: "main",
          },
          target: {
            url: "https://cursor.com/agents?id=bc_789",
            branchName: "cursor/add-agents-tool",
            autoCreatePr: true,
            openAsCursorGithubApp: true,
            skipReviewerRequest: true,
          },
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }, async () => {
      const result = await executeCursorAgentsControl(
        {
          action: "launch",
          prompt: "Add Cursor Agents support to chat tools",
          repository: "https://github.com/acme/ryos",
          ref: "main",
          model: "default",
          branchName: "cursor/add-agents-tool",
          autoCreatePr: true,
          openAsCursorGithubApp: true,
          skipReviewerRequest: true,
        },
        baseContext
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Launched Cursor agent "Cursor Agents integration" (bc_789).');
      expect(result.agent?.status).toBe("CREATING");
    });
  });

  test("adds a follow-up to an existing agent", async () => {
    await withMockedFetch(async (input, init) => {
      expect(String(input)).toBe("https://api.cursor.com/v0/agents/bc_789/followup");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: {
          text: "Also add Telegram support",
        },
      });

      return Response.json({ id: "bc_789" });
    }, async () => {
      const result = await executeCursorAgentsControl(
        {
          action: "followUp",
          id: "bc_789",
          prompt: "Also add Telegram support",
        },
        baseContext
      );

      expect(result).toEqual({
        success: true,
        message: "Added follow-up to Cursor agent bc_789.",
        followUpAdded: true,
      });
    });
  });
});
