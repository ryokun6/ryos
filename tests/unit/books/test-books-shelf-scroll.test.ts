import { describe, expect, test } from "bun:test";

describe("Books shelf scroll wiring", () => {
  test("uses native overflow scroll without mask or custom rubber-band", async () => {
    const source = await Bun.file(
      "src/apps/books/components/BooksShelfView.tsx"
    ).text();

    expect(source).toContain("data-books-scroll");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain("overscroll-y-auto");
    // Masks and custom overscroll JS kill iOS momentum / bounce.
    expect(source).not.toContain("maskImage");
    expect(source).not.toContain("WebkitMaskImage");
    expect(source).not.toContain("attachBooksShelfRubberBand");
    expect(source).not.toContain("booksShelfRubberBand");
  });
});
