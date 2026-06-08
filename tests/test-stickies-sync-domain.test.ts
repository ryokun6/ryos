import { describe, expect, test } from "bun:test";
import {
  mergeStickiesSnapshots,
  normalizeStickiesSnapshotData,
} from "../src/shared/domains/stickies";

const oldDeletedAt = "2026-01-01T00:00:00.000Z";
const newDeletedAt = "2026-01-02T00:00:00.000Z";

function note(id: string, updatedAt: number) {
  return {
    id,
    content: `note ${id}`,
    color: "yellow",
    position: { x: 1, y: 2 },
    size: { width: 220, height: 240 },
    createdAt: 1,
    updatedAt,
  };
}

describe("normalizeStickiesSnapshotData", () => {
  test("returns defaults for non-object input", () => {
    expect(normalizeStickiesSnapshotData(null)).toEqual({
      notes: [],
      deletedNoteIds: {},
    });
    expect(normalizeStickiesSnapshotData("bad")).toEqual({
      notes: [],
      deletedNoteIds: {},
    });
  });

  test("keeps valid notes and drops malformed notes", () => {
    const valid = note("a", 10);
    expect(
      normalizeStickiesSnapshotData({
        notes: [
          valid,
          { id: "bad", content: "missing geometry" },
          { ...valid, id: "" },
        ],
        deletedNoteIds: { a: oldDeletedAt, invalid: 1 },
      })
    ).toEqual({
      notes: [valid],
      deletedNoteIds: { a: oldDeletedAt },
    });
  });
});

describe("mergeStickiesSnapshots", () => {
  test("keeps local and remote notes when not deleted", () => {
    expect(
      mergeStickiesSnapshots(
        { notes: [note("local", 10)], deletedNoteIds: {} },
        { notes: [note("remote", 20)], deletedNoteIds: {} }
      ).notes.map((item) => item.id).sort()
    ).toEqual(["local", "remote"]);
  });

  test("prefers newer updatedAt for matching note ids", () => {
    const merged = mergeStickiesSnapshots(
      { notes: [note("same", 30)], deletedNoteIds: {} },
      { notes: [note("same", 20)], deletedNoteIds: {} }
    );
    expect(merged.notes).toEqual([note("same", 30)]);
  });

  test("filters notes deleted by the newest tombstone", () => {
    const merged = mergeStickiesSnapshots(
      { notes: [note("gone", 30)], deletedNoteIds: { gone: oldDeletedAt } },
      { notes: [note("gone", 40)], deletedNoteIds: { gone: newDeletedAt } }
    );
    expect(merged.notes).toEqual([]);
    expect(merged.deletedNoteIds).toEqual({ gone: newDeletedAt });
  });
});
