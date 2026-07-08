import { describe, expect, test } from "bun:test";
import { applyCalendarToolAction } from "../../../src/shared/tools/calendar";
import { calendarControlSchema } from "../../../api/chat/tools/schemas";
import type { CalendarSnapshotData } from "../../../src/shared/domains/calendar";

function state(): CalendarSnapshotData {
  return {
    events: [
      {
        id: "event-1",
        title: "Coffee",
        date: "2026-06-07",
        color: "blue",
        calendarId: "home",
        location: "Tokyo",
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    calendars: [{ id: "home", name: "Home", color: "green", visible: true }],
    todos: [
      {
        id: "todo-1",
        title: "Buy beans",
        completed: false,
        dueDate: null,
        calendarId: "home",
        createdAt: 1,
      },
    ],
    deletedEventIds: {},
    deletedTodoIds: {},
  };
}

const deps = {
  generateId: () => "generated-id",
  now: () => 100,
  deletedAt: () => "2026-06-07T22:00:00.000Z",
};

describe("calendar tool shared reducer", () => {
  test("lists events and preserves location", () => {
    const result = applyCalendarToolAction(state(), { action: "list" }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") return;
    expect(result.events[0].location).toBe("Tokyo");
  });

  test("creates events with default calendar color and location", () => {
    const result = applyCalendarToolAction(
      state(),
      {
        action: "create",
        title: "Dinner",
        date: "2026-06-08",
        endDate: "2026-06-10",
        calendarId: "home",
        location: "Osaka",
      },
      deps
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "create") return;
    expect(result.event.id).toBe("generated-id");
    expect(result.event.color).toBe("green");
    expect(result.event.endDate).toBe("2026-06-10");
    expect(result.event.location).toBe("Osaka");
  });

  test("lists multi-day all-day events on covered dates", () => {
    const current = state();
    current.events[0] = {
      ...current.events[0],
      date: "2026-06-07",
      endDate: "2026-06-09",
    };

    const middle = applyCalendarToolAction(
      current,
      { action: "list", date: "2026-06-08" },
      deps
    );
    expect(middle.ok).toBe(true);
    if (!middle.ok || middle.kind !== "list") return;
    expect(middle.events.map((event) => event.id)).toEqual(["event-1"]);

    const after = applyCalendarToolAction(
      current,
      { action: "list", date: "2026-06-10" },
      deps
    );
    expect(after.ok).toBe(true);
    if (!after.ok || after.kind !== "list") return;
    expect(after.events).toEqual([]);
  });

  test("updates and deletes events with tombstones", () => {
    const updated = applyCalendarToolAction(
      state(),
      { action: "update", id: "event-1", title: "Tea" },
      deps
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok || updated.kind !== "update") return;
    expect(updated.event.title).toBe("Tea");

    const deleted = applyCalendarToolAction(
      updated.state,
      { action: "delete", id: "event-1" },
      deps
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || deleted.kind !== "delete") return;
    expect(deleted.state.events).toEqual([]);
    expect(deleted.state.deletedEventIds).toEqual({
      "event-1": "2026-06-07T22:00:00.000Z",
    });
  });

  test("creates, toggles, and deletes todos", () => {
    const created = applyCalendarToolAction(
      state(),
      { action: "createTodo", title: "Call mom" },
      deps
    );
    expect(created.ok).toBe(true);
    if (!created.ok || created.kind !== "createTodo") return;
    expect(created.todo.calendarId).toBe("home");

    const toggled = applyCalendarToolAction(
      created.state,
      { action: "toggleTodo", id: "todo-1" },
      deps
    );
    expect(toggled.ok).toBe(true);
    if (!toggled.ok || toggled.kind !== "toggleTodo") return;
    expect(toggled.todo.completed).toBe(true);

    const deleted = applyCalendarToolAction(
      toggled.state,
      { action: "deleteTodo", id: "todo-1" },
      deps
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || deleted.kind !== "deleteTodo") return;
    expect(deleted.state.deletedTodoIds).toEqual({
      "todo-1": "2026-06-07T22:00:00.000Z",
    });
  });
});

describe("calendarControlSchema accepts over-filled tool-model input", () => {
  // Regression: tool-calling models (e.g. gpt-5.5) emit EVERY schema field, so
  // the schema must not reject calls that include endDate alongside
  // startTime/endTime. A blocking cross-field refinement here previously made
  // calendarControl unusable (every call failed validation before executing).
  test("a 'list' call with all fields populated still validates", () => {
    const parsed = calendarControlSchema.safeParse({
      action: "list",
      id: "",
      title: "",
      date: "2026-06-27",
      endDate: "2026-06-27",
      startTime: "00:00",
      endTime: "23:59",
      color: "blue",
      notes: "",
      completed: false,
      calendarId: "",
    });
    expect(parsed.success).toBe(true);
  });

  test("a timed 'create' with endDate present still validates", () => {
    const parsed = calendarControlSchema.safeParse({
      action: "create",
      title: "Standup",
      date: "2026-06-27",
      endDate: "2026-06-27",
      startTime: "09:00",
      endTime: "09:30",
    });
    expect(parsed.success).toBe(true);
  });

  test("a multi-day all-day 'create' validates", () => {
    const parsed = calendarControlSchema.safeParse({
      action: "create",
      title: "Trip",
      date: "2026-06-27",
      endDate: "2026-06-29",
    });
    expect(parsed.success).toBe(true);
  });
});
