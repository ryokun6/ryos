import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  countUnicodeCodePoints,
  koXPathToRange,
  rangeToKoXPath,
  utf16OffsetFromCodePointOffset,
} from "../../../src/apps/books/utils/kosyncProgressAnchor";
import {
  isEpubCfi,
  isKoStyleXPath,
  kosyncPercentagePlaceholder,
  parseKoXPath,
} from "../../../src/shared/kosyncProgressLocator";

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

function sectionDoc(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument("section");
  doc.body.innerHTML = bodyHtml;
  return doc;
}

function rangeAt(
  doc: Document,
  query: string,
  start: number,
  end = start
): Range {
  const node = doc.body.querySelector(query);
  if (!node?.firstChild || node.firstChild.nodeType !== Node.TEXT_NODE) {
    throw new Error(`expected text node under ${query}`);
  }
  const text = node.firstChild as Text;
  const range = doc.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}

describe("kosyncProgressLocator", () => {
  test("classifies KO XPath and EPUB CFI", () => {
    expect(
      isKoStyleXPath("/body/DocFragment[2]/body/p[1]/text()[1].4")
    ).toBe(true);
    expect(isKoStyleXPath("epubcfi(/6/4!/4/2)")).toBe(false);
    expect(isEpubCfi("epubcfi(/6/4!/4/2)")).toBe(true);
    expect(isEpubCfi("/body/DocFragment[1]/body")).toBe(false);
    expect(kosyncPercentagePlaceholder(0.5567)).toBe("5567");
  });

  test("parseKoXPath handles optional brackets and text terminal", () => {
    const parsed = parseKoXPath(
      "/body/DocFragment[3]/body/div[1]/ul/li[4]/text()[2].17"
    );
    expect(parsed).toEqual({
      docFragmentIndex: 3,
      steps: [
        { tag: "div", index: 1 },
        { tag: "ul", index: 1 },
        { tag: "li", index: 4 },
      ],
      textNodeIndex: 2,
      charOffset: 17,
    });
  });
});

describe("kosyncProgressAnchor", () => {
  test("round-trips nested elements and repeated sibling tags", () => {
    const doc = sectionDoc(
      "<div><p>Alpha</p><p>Beta <span>gamma</span> delta</p></div>"
    );
    const range = rangeAt(doc, "p:nth-of-type(2) span", 2);
    const xpath = rangeToKoXPath(range, 1);
    expect(xpath).toBe(
      "/body/DocFragment[1]/body/div[1]/p[2]/span[1]/text()[1].2"
    );

    const restored = koXPathToRange(doc, xpath!);
    expect(restored?.startContainer.textContent).toBe("gamma");
    expect(restored?.startOffset).toBe(2);
  });

  test("indexes multiple non-empty text nodes and skips empty anchors", () => {
    const doc = sectionDoc('<p>One<a id="x"></a>Two</p>');
    const paragraph = doc.body.querySelector("p")!;
    const twoNode = [...paragraph.childNodes].find(
      (child) =>
        child.nodeType === Node.TEXT_NODE && child.textContent === "Two"
    ) as Text;
    const range = doc.createRange();
    range.setStart(twoNode, 1);
    range.collapse(true);
    const xpath = rangeToKoXPath(range, 2);
    expect(xpath).toBe("/body/DocFragment[2]/body/p[1]/text()[2].1");

    const restored = koXPathToRange(doc, xpath!);
    expect(restored?.startContainer).toBe(twoNode);
    expect(restored?.startOffset).toBe(1);
  });

  test("uses Unicode codepoint offsets including non-BMP characters", () => {
    const doc = sectionDoc("<p>Hi 🎉 there</p>");
    const textNode = doc.body.querySelector("p")!.firstChild as Text;
    const emojiStart = textNode.textContent!.indexOf("🎉");
    const range = doc.createRange();
    range.setStart(textNode, emojiStart + 2);
    range.collapse(true);

    expect(countUnicodeCodePoints(textNode.textContent!, emojiStart + 2)).toBe(
      4
    );
    expect(
      utf16OffsetFromCodePointOffset(textNode.textContent!, 4)
    ).toBe(emojiStart + 2);

    const xpath = rangeToKoXPath(range, 1);
    expect(xpath).toBe("/body/DocFragment[1]/body/p[1]/text()[1].4");

    const restored = koXPathToRange(doc, xpath!);
    expect(restored?.startOffset).toBe(emojiStart + 2);
  });

  test("returns null outside paragraph/list text", () => {
    const doc = sectionDoc("<div>Outside</div>");
    const range = rangeAt(doc, "div", 1);
    expect(rangeToKoXPath(range, 1)).toBeNull();
  });
});
