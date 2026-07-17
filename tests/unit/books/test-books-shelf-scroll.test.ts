import { describe, expect, test } from "bun:test";

describe("Books shelf scroll wiring", () => {
  test("uses native full-bleed scroll under a transparent floating toolbar", async () => {
    const source = await Bun.file(
      "src/apps/books/components/BooksShelfView.tsx"
    ).text();

    expect(source).toContain("data-books-scroll");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain("overscroll-y-auto");
    // Full-bleed scroller + overlay chrome (no clipped gradient edge).
    expect(source).toContain("absolute inset-0");
    expect(source).toContain("bg-transparent");
    expect(source).toContain("pointer-events-none absolute inset-x-0 top-0 z-20");
    expect(source).toContain("SHELF_TOOLBAR_CLEARANCE");
    // Masks and custom overscroll JS kill iOS momentum / bounce.
    expect(source).not.toContain("maskImage");
    expect(source).not.toContain("WebkitMaskImage");
    expect(source).not.toContain("bg-gradient-to-b from-black/");
    expect(source).not.toContain("attachBooksShelfRubberBand");
  });
});
