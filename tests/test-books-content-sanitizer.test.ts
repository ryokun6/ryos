import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { sanitizeEpubSectionDocument } from "../src/apps/books/utils/booksContentSanitizer";

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

function createSectionDocument(bodyHtml: string, headHtml = ""): Document {
  const sectionDocument = document.implementation.createHTMLDocument("Section");
  sectionDocument.head.innerHTML = headHtml;
  sectionDocument.body.innerHTML = bodyHtml;
  return sectionDocument;
}

describe("sanitizeEpubSectionDocument", () => {
  test("removes script elements from head and body", () => {
    const doc = createSectionDocument(
      "<p>Hello</p><script>window.stolen = localStorage.token;</script>",
      "<script src='evil.js'></script>"
    );

    const removed = sanitizeEpubSectionDocument(doc);

    expect(removed).toBeGreaterThanOrEqual(2);
    expect(doc.querySelectorAll("script").length).toBe(0);
    expect(doc.body.querySelector("p")?.textContent).toBe("Hello");
  });

  test("removes nested browsing contexts and plugin elements", () => {
    const doc = createSectionDocument(
      "<iframe src='https://evil.example'></iframe>" +
        "<object data='x.swf'></object>" +
        "<embed src='x.swf'>" +
        "<p>Kept</p>"
    );

    sanitizeEpubSectionDocument(doc);

    expect(doc.querySelectorAll("iframe, object, embed").length).toBe(0);
    expect(doc.body.querySelector("p")?.textContent).toBe("Kept");
  });

  test("strips inline event handler attributes", () => {
    const doc = createSectionDocument(
      "<p onclick=\"alert(1)\" onmouseover=\"alert(2)\" class=\"kept\">Text</p>" +
        "<img src=\"cover.png\" onerror=\"alert(3)\" alt=\"\" />"
    );

    const removed = sanitizeEpubSectionDocument(doc);

    expect(removed).toBe(3);
    const p = doc.body.querySelector("p");
    expect(p?.getAttribute("onclick")).toBeNull();
    expect(p?.getAttribute("onmouseover")).toBeNull();
    expect(p?.getAttribute("class")).toBe("kept");
    expect(doc.body.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(doc.body.querySelector("img")?.getAttribute("src")).toBe(
      "cover.png"
    );
  });

  test("neutralizes javascript: URLs, including obfuscated ones", () => {
    const doc = createSectionDocument(
      "<a href=\"javascript:alert(1)\">bad</a>" +
        "<a href=\"JaVa\tScRiPt:alert(2)\">sneaky</a>" +
        "<a href=\"chapter2.xhtml\">good</a>" +
        "<form action=\"javascript:alert(3)\"><input formaction=\"javascript:alert(4)\" /></form>"
    );

    sanitizeEpubSectionDocument(doc);

    const anchors = Array.from(doc.body.querySelectorAll("a"));
    expect(anchors[0].getAttribute("href")).toBeNull();
    expect(anchors[1].getAttribute("href")).toBeNull();
    expect(anchors[2].getAttribute("href")).toBe("chapter2.xhtml");
    expect(doc.body.querySelector("form")?.getAttribute("action")).toBeNull();
    expect(
      doc.body.querySelector("input")?.getAttribute("formaction")
    ).toBeNull();
  });

  test("returns 0 and leaves a clean document untouched", () => {
    const doc = createSectionDocument(
      "<h1>Chapter 1</h1><p>Once upon a time…</p>" +
        "<img src=\"art.png\" alt=\"art\" /><a href=\"#note-1\">note</a>"
    );
    const before = doc.body.innerHTML;

    expect(sanitizeEpubSectionDocument(doc)).toBe(0);
    expect(doc.body.innerHTML).toBe(before);
  });
});
