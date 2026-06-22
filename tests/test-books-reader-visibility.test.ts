import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { getEpubContentVisibilitySnapshot } from "../src/apps/books/utils/booksReader";

function createDocument(html: string): Document {
  const window = new Window();
  window.document.write(html);
  return window.document as unknown as Document;
}

describe("Books reader visibility snapshot", () => {
  test("marks an empty XHTML body as blank", () => {
    const doc = createDocument("<html><body><section> \n </section></body></html>");

    const snapshot = getEpubContentVisibilitySnapshot(doc);

    expect(snapshot.isBlank).toBe(true);
    expect(snapshot.textLength).toBe(0);
  });

  test("treats real text content as visible", () => {
    const doc = createDocument(
      "<html><body><p>Understanding Media begins here.</p></body></html>"
    );

    const snapshot = getEpubContentVisibilitySnapshot(doc);

    expect(snapshot.isBlank).toBe(false);
    expect(snapshot.sampleText).toContain("Understanding Media");
  });

  test("treats decoded raster images as visible", () => {
    const doc = createDocument("<html><body><img src='cover.jpg' /></body></html>");
    const image = doc.querySelector("img");
    expect(image).toBeTruthy();
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 960,
    });

    const snapshot = getEpubContentVisibilitySnapshot(doc);

    expect(snapshot.isBlank).toBe(false);
    expect(snapshot.loadedImageCount).toBe(1);
  });
});
