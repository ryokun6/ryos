import { describe, expect, test } from "bun:test";
import { applyStickiesToolAction } from "../../../src/shared/tools/stickies";
import type { StickiesSnapshotData } from "../../../src/shared/domains/stickies";

function state(): StickiesSnapshotData {
  return {
    notes: [
      {
        id: "note-1",
        content: "hello",
        color: "yellow",
        position: { x: 1, y: 2 },
        size: { width: 200, height: 200 },
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    deletedNoteIds: {},
  };
}

const deps = {
  generateId: () => "generated-note",
  now: () => 100,
  deletedAt: () => "2026-06-07T22:00:00.000Z",
  defaultPosition: () => ({ x: 10, y: 20 }),
  defaultSize: () => ({ width: 220, height: 240 }),
};

describe("stickies tool shared reducer", () => {
  test("lists and creates notes", () => {
    const listed = applyStickiesToolAction(state(), { action: "list" }, deps);
    expect(listed.ok).toBe(true);
    if (!listed.ok || listed.kind !== "list") return;
    expect(listed.notes).toHaveLength(1);

    const created = applyStickiesToolAction(
      state(),
      { action: "create", content: "new", color: "blue" },
      deps
    );
    expect(created.ok).toBe(true);
    if (!created.ok || created.kind !== "create") return;
    expect(created.note).toMatchObject({
      id: "generated-note",
      content: "new",
      color: "blue",
      position: { x: 10, y: 20 },
    });
  });

  test("updates notes and rejects empty patches", () => {
    expect(
      applyStickiesToolAction(state(), { action: "update", id: "note-1" }, deps)
    ).toEqual({ ok: false, error: "no_updates" });

    const updated = applyStickiesToolAction(
      state(),
      { action: "update", id: "note-1", content: "updated" },
      deps
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok || updated.kind !== "update") return;
    expect(updated.note.content).toBe("updated");
    expect(updated.note.updatedAt).toBe(100);
  });

  test("deletes and clears notes with tombstones", () => {
    const deleted = applyStickiesToolAction(
      state(),
      { action: "delete", id: "note-1" },
      deps
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || deleted.kind !== "delete") return;
    expect(deleted.state.notes).toEqual([]);
    expect(deleted.state.deletedNoteIds).toEqual({
      "note-1": "2026-06-07T22:00:00.000Z",
    });

    const cleared = applyStickiesToolAction(state(), { action: "clear" }, deps);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok || cleared.kind !== "clear") return;
    expect(cleared.count).toBe(1);
    expect(cleared.state.deletedNoteIds).toEqual({
      "note-1": "2026-06-07T22:00:00.000Z",
    });
  });
});
