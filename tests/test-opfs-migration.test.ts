import { describe, expect, test } from "bun:test";
import type { FileSystemItem } from "../src/stores/useFilesStore";
import { STORES } from "../src/utils/indexedDB";
import { resolveLegacyContentKey } from "../src/utils/indexedDBMigration";

const baseItem = (overrides: Partial<FileSystemItem>): FileSystemItem => ({
  path: "/Documents/example.txt",
  name: "example.txt",
  isDirectory: false,
  status: "active",
  uuid: "11111111-1111-4111-8111-111111111111",
  ...overrides,
});

describe("OPFS migration key resolution", () => {
  test("maps legacy document names to metadata UUIDs", () => {
    const items: FileSystemItem[] = [
      baseItem({
        path: "/Documents/notes.md",
        name: "notes.md",
        type: "markdown",
        uuid: "22222222-2222-4222-8222-222222222222",
      }),
    ];

    expect(resolveLegacyContentKey(STORES.DOCUMENTS, "notes.md", items)).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
  });

  test("maps trashed files to their trash UUIDs", () => {
    const items: FileSystemItem[] = [
      baseItem({
        path: "/Trash/photo.png",
        name: "photo.png",
        type: "png",
        status: "trashed",
        uuid: "33333333-3333-4333-8333-333333333333",
      }),
    ];

    expect(resolveLegacyContentKey(STORES.TRASH, "photo.png", items)).toBe(
      "33333333-3333-4333-8333-333333333333"
    );
  });

  test("preserves custom wallpaper keys as-is", () => {
    expect(
      resolveLegacyContentKey(STORES.CUSTOM_WALLPAPERS, "wallpaper-1", [])
    ).toBe("wallpaper-1");
  });

  test("preserves UUID keys without remapping", () => {
    expect(
      resolveLegacyContentKey(
        STORES.APPLETS,
        "44444444-4444-4444-8444-444444444444",
        []
      )
    ).toBe("44444444-4444-4444-8444-444444444444");
  });

  test("falls back to the legacy key when metadata is missing", () => {
    expect(resolveLegacyContentKey(STORES.IMAGES, "orphaned.png", [])).toBe(
      "orphaned.png"
    );
  });
});
