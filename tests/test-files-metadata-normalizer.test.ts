import { describe, expect, test } from "bun:test";
import { normalizeFilesMetadataSnapshotData } from "../src/shared/domains/filesMetadata";

describe("normalizeFilesMetadataSnapshotData", () => {
  test("returns default snapshot fields for non-object input", () => {
    for (const value of [null, undefined, "", 42]) {
      expect(normalizeFilesMetadataSnapshotData(value)).toEqual({
        items: {},
        libraryState: "uninitialized",
        documents: [],
        deletedPaths: {},
      });
    }
  });

  test("returns default snapshot fields for missing object fields", () => {
    expect(normalizeFilesMetadataSnapshotData({})).toEqual({
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: {},
    });
  });

  test("preserves existing files metadata fields", () => {
    const item = {
      path: "/Documents/Note.txt",
      name: "Note.txt",
      isDirectory: false,
      status: "active",
      uuid: "doc-1",
      modifiedAt: 10,
    };

    expect(
      normalizeFilesMetadataSnapshotData({
        items: { [item.path]: item },
        libraryState: "loaded",
        documents: [{ key: "doc-1", value: { text: "hello" } }],
        deletedPaths: { "/Trash/Old.txt": "2026-01-01T00:00:00.000Z" },
      })
    ).toEqual({
      items: { [item.path]: item },
      libraryState: "loaded",
      documents: [{ key: "doc-1", value: { text: "hello" } }],
      deletedPaths: { "/Trash/Old.txt": "2026-01-01T00:00:00.000Z" },
    });
  });

  test("normalizes documents but preserves deletedPaths passthrough", () => {
    expect(
      normalizeFilesMetadataSnapshotData({
        documents: null,
        deletedPaths: { "/x": "2026-01-01T00:00:00.000Z", bad: 1 },
      })
    ).toEqual({
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: { "/x": "2026-01-01T00:00:00.000Z", bad: 1 },
    });
  });
});
