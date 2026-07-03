import { describe, expect, test } from "bun:test";
import {
  BOOKS_EDGE_TAP_RATIO,
  resolveBooksEdgeTapDirection,
} from "../src/apps/books/utils/booksEdgeTap";

const base = {
  viewportWidth: 1000,
  isVerticalText: false,
  hasSelection: false,
  isInteractiveTarget: false,
};

describe("Books edge-tap navigation", () => {
  test("turns horizontal pages only within the edge regions", () => {
    expect(
      resolveBooksEdgeTapDirection({ ...base, clientX: 100 })
    ).toBe("prev");
    expect(
      resolveBooksEdgeTapDirection({ ...base, clientX: 900 })
    ).toBe("next");
    expect(
      resolveBooksEdgeTapDirection({ ...base, clientX: 500 })
    ).toBeNull();
    expect(BOOKS_EDGE_TAP_RATIO).toBe(0.14);
  });

  test("reverses physical edges for vertical text", () => {
    expect(
      resolveBooksEdgeTapDirection({
        ...base,
        clientX: 100,
        isVerticalText: true,
      })
    ).toBe("next");
    expect(
      resolveBooksEdgeTapDirection({
        ...base,
        clientX: 900,
        isVerticalText: true,
      })
    ).toBe("prev");
  });

  test("never turns while selecting text or using interactive content", () => {
    expect(
      resolveBooksEdgeTapDirection({
        ...base,
        clientX: 100,
        hasSelection: true,
      })
    ).toBeNull();
    expect(
      resolveBooksEdgeTapDirection({
        ...base,
        clientX: 900,
        isInteractiveTarget: true,
      })
    ).toBeNull();
  });

  test("wires taps inside EPUB documents without parent overlays", async () => {
    const source = await Bun.file(
      "src/apps/books/components/BooksReaderPane.tsx"
    ).text();

    expect(source).toContain(
      'document.addEventListener("click", handleClick)'
    );
    // Edge zones are measured in the parent host's coordinate space — the
    // paginated iframe is wider than the visible page, so its own widths lie.
    expect(source).toContain("const hostRect = host.getBoundingClientRect();");
    expect(source).toContain(
      "frameRect.left + event.clientX - hostRect.left"
    );
    expect(source).toContain("resolveBooksEdgeTapDirection({");
    expect(source).not.toContain('aria-label={isVerticalText ? "Next page"');
    expect(source).not.toContain("w-[14%]");
  });
});
