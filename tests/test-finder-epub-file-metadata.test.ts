import { describe, expect, test } from "bun:test";
import {
  BOOK_FILE_ICON_PATH,
  getFileTypeFromExtension,
  isEpubFile,
} from "../src/apps/finder/utils/fileSystemHelpers";
import { getIconPath } from "../src/apps/finder/components/file-list/fileListUtils";

describe("Finder EPUB file metadata", () => {
  test("classifies EPUB files as books", () => {
    expect(getFileTypeFromExtension("Meditations.epub")).toBe("epub");
    expect(isEpubFile("Meditations.epub")).toBe(true);
    expect(isEpubFile("Meditations", "application/epub+zip")).toBe(true);
  });

  test("uses the Books app icon for EPUB files", () => {
    expect(
      getIconPath({
        name: "Meditations.epub",
        isDirectory: false,
        path: "/Books/Meditations.epub",
        icon: "/icons/file.png",
        type: "epub",
      })
    ).toBe(BOOK_FILE_ICON_PATH);
  });
});
