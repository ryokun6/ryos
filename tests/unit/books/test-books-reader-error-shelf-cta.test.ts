import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..", "..", "..");

describe("Books reader load-error shelf CTA", () => {
  test("BooksReaderPane renders a Back to Shelf button on loadError", () => {
    const source = readFileSync(
      path.join(ROOT, "src/apps/books/components/BooksReaderPane.tsx"),
      "utf8"
    );
    expect(source).toContain("onBackToShelf: () => void");
    expect(source).toContain("onClick={onBackToShelf}");
    expect(source).toContain('t("apps.books.menu.backToShelf")');
    expect(source).toContain("loadError &&");
  });

  test("BooksAppComponent wires closeBook into the reader error CTA", () => {
    const source = readFileSync(
      path.join(
        ROOT,
        "src/apps/books/components/books-app/BooksAppComponent.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("onBackToShelf={closeBook}");
  });
});
