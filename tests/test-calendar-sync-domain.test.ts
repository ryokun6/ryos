import { describe, expect, test } from "bun:test";
import {
  mergeCalendarSnapshots,
  normalizeCalendarSnapshotData,
} from "../src/shared/domains/calendar";

const oldDeletedAt = "2026-01-01T00:00:00.000Z";
const newDeletedAt = "2026-01-02T00:00:00.000Z";

function event(id: string, updatedAt: number) {
  return {
    id,
    title: `event ${id}`,
    date: "2026-06-07",
    endDate: "2026-06-09",
    color: "blue" as const,
    calendarId: "home",
    location: "Tokyo",
    createdAt: 1,
    updatedAt,
  };
}

function calendar(id: string) {
  return { id, name: id, color: "green" as const, visible: true };
}

function todo(id: string) {
  return {
    id,
    title: `todo ${id}`,
    completed: false,
    dueDate: null,
    calendarId: "home",
    createdAt: 1,
  };
}

describe("normalizeCalendarSnapshotData", () => {
  test("defaults invalid snapshots", () => {
    expect(normalizeCalendarSnapshotData(null)).toEqual({
      events: [],
      calendars: [],
      todos: [],
      deletedEventIds: {},
      deletedCalendarIds: {},
      deletedTodoIds: {},
    });
  });

  test("keeps valid entries, location, and tombstones", () => {
    expect(
      normalizeCalendarSnapshotData({
        events: [event("a", 10), { id: "bad" }],
        calendars: [calendar("home"), { id: "bad" }],
        todos: [todo("t1"), { id: "bad" }],
        deletedEventIds: { old: oldDeletedAt, bad: 1 },
      })
    ).toEqual({
      events: [event("a", 10)],
      calendars: [calendar("home")],
      todos: [todo("t1")],
      deletedEventIds: { old: oldDeletedAt },
      deletedCalendarIds: {},
      deletedTodoIds: {},
    });
  });
});

describe("mergeCalendarSnapshots", () => {
  test("prefers newer events and unions todos/calendars", () => {
    const merged = mergeCalendarSnapshots(
      {
        events: [event("same", 20)],
        calendars: [calendar("local")],
        todos: [todo("local-todo")],
        deletedEventIds: {},
      },
      {
        events: [event("same", 10), event("remote", 5)],
        calendars: [calendar("remote")],
        todos: [todo("remote-todo")],
        deletedEventIds: {},
      }
    );

    expect(merged.events.map((item) => [item.id, item.updatedAt])).toEqual([
      ["same", 20],
      ["remote", 5],
    ]);
    expect(merged.calendars.map((item) => item.id).sort()).toEqual([
      "local",
      "remote",
    ]);
    expect(merged.todos.map((item) => item.id).sort()).toEqual([
      "local-todo",
      "remote-todo",
    ]);
  });

  test("filters events deleted by newest tombstone", () => {
    const merged = mergeCalendarSnapshots(
      {
        events: [event("gone", 20)],
        calendars: [],
        todos: [],
        deletedEventIds: { gone: oldDeletedAt },
      },
      {
        events: [event("gone", 30)],
        calendars: [],
        todos: [],
        deletedEventIds: { gone: newDeletedAt },
      }
    );

    expect(merged.events).toEqual([]);
    expect(merged.deletedEventIds).toEqual({ gone: newDeletedAt });
  });
});
