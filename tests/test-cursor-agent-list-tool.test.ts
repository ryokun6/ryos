import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  cursorAgentListSchema,
  executeCursorAgentList,
} from "../api/chat/tools/cursor-agent-list.js";

const SDK_PATH = "@cursor/sdk";

const baseContext = {
  username: "ryo",
  log: () => {},
  logError: () => {},
  env: {},
  apiKey: "test-key",
};

let listMock: ReturnType<typeof mock>;
let listRunsMock: ReturnType<typeof mock>;

beforeEach(async () => {
  listMock = mock(async () => ({ items: [] }));
  listRunsMock = mock(async () => ({ items: [] }));

  await mock.module(SDK_PATH, () => ({
    Agent: {
      list: listMock,
      listRuns: listRunsMock,
    },
  }));
});

afterEach(() => {
  mock.restore();
});

describe("cursorAgentListSchema", () => {
  test("requires agentId for listRuns", () => {
    const parsed = cursorAgentListSchema.safeParse({
      action: "listRuns",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) => issue.path[0] === "agentId")
      ).toBe(true);
    }
  });

  test("listAgents has sensible defaults", () => {
    const parsed = cursorAgentListSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.action).toBe("listAgents");
      expect(parsed.data.status).toBe("any");
      expect(parsed.data.limit).toBe(10);
      expect(parsed.data.includeArchived).toBe(false);
    }
  });
});

describe("executeCursorAgentList owner gate", () => {
  test("rejects callers whose username is not the repo owner", async () => {
    const result = await executeCursorAgentList(
      {
        action: "listAgents",
        status: "any",
        limit: 10,
        includeArchived: false,
      },
      {
        ...baseContext,
        username: "alice",
      }
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("restricted");
    }
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe("executeCursorAgentList listAgents", () => {
  test("returns mapped agents with web URLs and applies status filter", async () => {
    listMock.mockImplementation(async () => ({
      items: [
        {
          agentId: "bc-aaa",
          name: "Agent A",
          summary: "did A",
          status: "finished",
          archived: false,
          createdAt: 1,
          lastModified: 2,
          runtime: "cloud",
          repos: ["https://github.com/ryokun6/ryos"],
        },
        {
          agentId: "bc-bbb",
          name: "Agent B",
          summary: "doing B",
          status: "running",
          archived: false,
          runtime: "cloud",
        },
      ],
      nextCursor: "cursor-abc",
    }));

    const result = await executeCursorAgentList(
      {
        action: "listAgents",
        status: "finished",
        limit: 25,
        includeArchived: false,
      },
      baseContext
    );

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0]?.[0]).toMatchObject({
      runtime: "cloud",
      limit: 25,
      includeArchived: false,
      apiKey: "test-key",
    });

    expect(result.success).toBe(true);
    if (result.success && result.action === "listAgents") {
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].agentId).toBe("bc-aaa");
      expect(result.agents[0].url).toBe(
        "https://cursor.com/agents?id=bc-aaa"
      );
      expect(result.agents[0].repos).toEqual([
        "https://github.com/ryokun6/ryos",
      ]);
      expect(result.nextCursor).toBe("cursor-abc");
      expect(result.filtered?.total).toBe(2);
      expect(result.message.toLowerCase()).toContain("finished");
    }
  });

  test("status='any' returns all agents and omits filtered metadata", async () => {
    listMock.mockImplementation(async () => ({
      items: [
        {
          agentId: "bc-aaa",
          name: "Agent A",
          status: "finished",
          runtime: "cloud",
        },
      ],
    }));

    const result = await executeCursorAgentList(
      {
        action: "listAgents",
        status: "any",
        limit: 10,
        includeArchived: false,
      },
      baseContext
    );

    expect(result.success).toBe(true);
    if (result.success && result.action === "listAgents") {
      expect(result.agents).toHaveLength(1);
      expect(result.filtered).toBeUndefined();
      expect(result.message).toContain("Found 1 agent");
    }
  });
});

describe("executeCursorAgentList listRuns", () => {
  test("maps runs with truncated result preview", async () => {
    listRunsMock.mockImplementation(async () => ({
      items: [
        {
          id: "run-1",
          agentId: "bc-aaa",
          status: "finished",
          durationMs: 12_345,
          result: "Line one\nLine two with more detail",
          git: {
            branches: [
              {
                repoUrl: "https://github.com/ryokun6/ryos",
                branch: "feature/x",
                prUrl: "https://github.com/ryokun6/ryos/pull/9999",
              },
            ],
          },
        },
        {
          id: "run-2",
          agentId: "bc-aaa",
          status: "running",
        },
      ],
    }));

    const result = await executeCursorAgentList(
      {
        action: "listRuns",
        agentId: "bc-aaa",
        status: "any",
        limit: 5,
        includeArchived: false,
      },
      baseContext
    );

    expect(listRunsMock).toHaveBeenCalledTimes(1);
    expect(listRunsMock.mock.calls[0]?.[0]).toBe("bc-aaa");
    expect(listRunsMock.mock.calls[0]?.[1]).toMatchObject({
      runtime: "cloud",
      limit: 5,
      apiKey: "test-key",
    });

    expect(result.success).toBe(true);
    if (result.success && result.action === "listRuns") {
      expect(result.runs).toHaveLength(2);
      expect(result.runs[0]?.resultPreview).toBe("Line one");
      expect(result.runs[0]?.git?.branches[0]?.prUrl).toContain("/pull/9999");
      expect(result.runs[1]?.resultPreview).toBeUndefined();
    }
  });
});
