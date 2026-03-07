import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  executeCalendarControl,
  executeStickiesControl,
} from "../api/chat/tools/executors";

const calendarData = {
  data: {
    events: [
      {
        id: "evt-1",
        title: "Dentist",
        date: "2026-03-10",
        startTime: "14:00",
        endTime: "15:00",
        color: "blue",
        notes: "Cleaning",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    calendars: [{ id: "home", name: "Home", color: "blue", visible: true }],
    todos: [
      {
        id: "todo-1",
        title: "Buy milk",
        completed: false,
        dueDate: "2026-03-08",
        calendarId: "home",
        createdAt: 1000,
      },
    ],
  },
  updatedAt: "2026-03-06T00:00:00.000Z",
  version: 1,
  createdAt: "2026-03-06T00:00:00.000Z",
};

const stickiesData = {
  data: {
    notes: [
      {
        id: "note-1",
        content: "Hello world",
        color: "yellow",
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 },
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  },
  updatedAt: "2026-03-06T00:00:00.000Z",
  version: 1,
  createdAt: "2026-03-06T00:00:00.000Z",
};

function createMockRedis(initialData: Record<string, unknown> = {}) {
  const store: Record<string, string> = {};
  for (const [key, value] of Object.entries(initialData)) {
    store[key] = JSON.stringify(value);
  }

  return {
    get: mock(async (key: string) => {
      const val = store[key];
      return val ? JSON.parse(val) : null;
    }),
    set: mock(async (key: string, value: string) => {
      store[key] = value;
      return "OK";
    }),
    _store: store,
  } as any;
}

function createMockContext(redis: any, username = "testuser") {
  return {
    log: mock(() => {}),
    logError: mock(() => {}),
    env: {},
    username,
    redis,
    timeZone: "America/Los_Angeles",
  };
}

describe("Server-side Calendar Executor", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    redis = createMockRedis({
      "sync:state:testuser:calendar": calendarData,
    });
    context = createMockContext(redis);
  });

  test("list returns all events", async () => {
    const result = await executeCalendarControl({ action: "list" }, context);
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events![0].title).toBe("Dentist");
  });

  test("list filters by date", async () => {
    const result = await executeCalendarControl(
      { action: "list", date: "2026-03-11" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  test("create adds event and persists", async () => {
    const result = await executeCalendarControl(
      {
        action: "create",
        title: "Meeting",
        date: "2026-03-12",
        startTime: "10:00",
        color: "green",
      },
      context
    );
    expect(result.success).toBe(true);
    expect(result.event?.title).toBe("Meeting");
    expect(result.event?.id).toBeTruthy();
    expect(redis.set).toHaveBeenCalled();
  });

  test("create requires title and date", async () => {
    const result = await executeCalendarControl(
      { action: "create", title: "Oops" },
      context
    );
    expect(result.success).toBe(false);
  });

  test("update modifies existing event", async () => {
    const result = await executeCalendarControl(
      { action: "update", id: "evt-1", title: "Updated Dentist" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Updated");
  });

  test("update fails for unknown id", async () => {
    const result = await executeCalendarControl(
      { action: "update", id: "nonexistent", title: "X" },
      context
    );
    expect(result.success).toBe(false);
  });

  test("delete removes event", async () => {
    const result = await executeCalendarControl(
      { action: "delete", id: "evt-1" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("Deleted");
  });

  test("listTodos returns todos", async () => {
    const result = await executeCalendarControl(
      { action: "listTodos" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.todos).toHaveLength(1);
    expect(result.todos![0].title).toBe("Buy milk");
  });

  test("createTodo adds and persists", async () => {
    const result = await executeCalendarControl(
      { action: "createTodo", title: "Exercise" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.todo?.title).toBe("Exercise");
  });

  test("toggleTodo flips completion", async () => {
    const result = await executeCalendarControl(
      { action: "toggleTodo", id: "todo-1" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.todo?.completed).toBe(true);
  });

  test("deleteTodo removes todo", async () => {
    const result = await executeCalendarControl(
      { action: "deleteTodo", id: "todo-1" },
      context
    );
    expect(result.success).toBe(true);
  });

  test("returns error when no sync data exists", async () => {
    const emptyRedis = createMockRedis({});
    const ctx = createMockContext(emptyRedis);
    const result = await executeCalendarControl({ action: "list" }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain("cloud sync");
  });

  test("returns error without authentication", async () => {
    const ctx = createMockContext(redis, undefined as any);
    ctx.username = undefined as any;
    const result = await executeCalendarControl({ action: "list" }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Authentication");
  });
});

describe("Server-side Stickies Executor", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    redis = createMockRedis({
      "sync:state:testuser:stickies": stickiesData,
    });
    context = createMockContext(redis);
  });

  test("list returns all notes", async () => {
    const result = await executeStickiesControl({ action: "list" }, context);
    expect(result.success).toBe(true);
    expect(result.notes).toHaveLength(1);
    expect(result.notes![0].content).toBe("Hello world");
  });

  test("create adds note and persists", async () => {
    const result = await executeStickiesControl(
      { action: "create", content: "New note", color: "blue" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.note?.content).toBe("New note");
    expect(redis.set).toHaveBeenCalled();
  });

  test("create works even without prior state", async () => {
    const emptyRedis = createMockRedis({});
    const ctx = createMockContext(emptyRedis);
    const result = await executeStickiesControl(
      { action: "create", content: "First note" },
      ctx
    );
    expect(result.success).toBe(true);
    expect(result.note?.content).toBe("First note");
  });

  test("update modifies existing note", async () => {
    const result = await executeStickiesControl(
      { action: "update", id: "note-1", content: "Updated content" },
      context
    );
    expect(result.success).toBe(true);
  });

  test("delete removes note", async () => {
    const result = await executeStickiesControl(
      { action: "delete", id: "note-1" },
      context
    );
    expect(result.success).toBe(true);
  });

  test("clear removes all notes", async () => {
    const result = await executeStickiesControl({ action: "clear" }, context);
    expect(result.success).toBe(true);
    expect(result.message).toContain("1");
  });

  test("returns error without authentication", async () => {
    const ctx = createMockContext(redis, undefined as any);
    ctx.username = undefined as any;
    const result = await executeStickiesControl({ action: "list" }, ctx);
    expect(result.success).toBe(false);
  });
});
