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

describe("Finder Preview file metadata", () => {
  test("classifies PDF and SVG files for Preview", () => {
    expect(getFileTypeFromExtension("Guide.pdf")).toBe("pdf");
    expect(getFileTypeFromExtension("Diagram.svg")).toBe("svg");
  });

  test("uses a PDF document icon", () => {
    expect(
      getIconPath({
        name: "Guide.pdf",
        isDirectory: false,
        path: "/Documents/Guide.pdf",
        type: "pdf",
      }),
    ).toBe("/icons/default/file-pdf.png");
  });
});
