import { describe, expect, test } from "bun:test";
import {
  BOOKS_SHELF_RUBBER_MAX_PX,
  booksShelfRubberOffset,
} from "../../../src/apps/books/utils/booksShelfRubberBand";

describe("Books shelf rubber-band offset", () => {
  test("preserves pull direction and starts below the finger delta", () => {
    expect(booksShelfRubberOffset(100)).toBeGreaterThan(0);
    expect(booksShelfRubberOffset(100)).toBeLessThan(100);
    expect(booksShelfRubberOffset(-100)).toBeLessThan(0);
    expect(Math.abs(booksShelfRubberOffset(-100))).toBeLessThan(100);
  });

  test("applies diminishing resistance and clamps at the max travel", () => {
    const near = booksShelfRubberOffset(40);
    const far = booksShelfRubberOffset(80);
    // Doubling the pull should not double the travel.
    expect(far).toBeLessThan(near * 2);
    expect(booksShelfRubberOffset(10_000)).toBe(BOOKS_SHELF_RUBBER_MAX_PX);
    expect(booksShelfRubberOffset(-10_000)).toBe(-BOOKS_SHELF_RUBBER_MAX_PX);
  });
});

describe("Books shelf rubber-band wiring", () => {
  test("shelf scroller is full-bleed with touch pan and attaches rubber-band", async () => {
    const source = await Bun.file(
      "src/apps/books/components/BooksShelfView.tsx"
    ).text();

    expect(source).toContain("attachBooksShelfRubberBand");
    expect(source).toContain("data-books-scroll");
    expect(source).toContain("overflow-y-scroll");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain("[-webkit-overflow-scrolling:touch]");
    // Content must always overflow so the element stays a scroll container.
    expect(source).toContain("min-h-[calc(100%+1px)]");
    // Toolbar floats above the scroller so overscroll slides wood underneath.
    expect(source).toContain(
      "pointer-events-none absolute inset-x-0 top-0 z-20"
    );
  });
});
