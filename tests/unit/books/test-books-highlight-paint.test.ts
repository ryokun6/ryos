import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  applyHighlightOverlayBlend,
  BOOKS_HIGHLIGHT_PAGE_DARK_CLASS,
  booksHighlightRegistryName,
  paintUnderTextHighlights,
} from "../../../src/apps/books/hooks/useBooksAnnotations";
import type { BookHighlight } from "../../../src/stores/useBooksStore";
import type { Rendition } from "epubjs";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

afterAll(() => {
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

function highlight(overrides: Partial<BookHighlight> = {}): BookHighlight {
  return {
    id: "h1",
    cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
    text: "visible passage",
    color: "yellow",
    createdAt: 1,
    ...overrides,
  };
}

describe("highlight paint", () => {
  test("CSS highlights paint behind the glyphs and the active mark is stronger", () => {
    const registry = new Map<string, { ranges: Range[] }>();
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    const root = document.createElement("html");
    const doc = {
      documentElement: root,
      defaultView: {
        Highlight: FakeHighlight,
        CSS: { highlights: registry },
      },
    } as unknown as Document;
    const range = {
      startContainer: { ownerDocument: doc },
    } as unknown as Range;

    const mark = highlight();
    paintUnderTextHighlights(doc, [mark], mark.id, false, () => range);
    const activeName = booksHighlightRegistryName("yellow", true);
    expect(registry.get(activeName)?.ranges[0]).toBe(range);
    expect(root.classList.contains(BOOKS_HIGHLIGHT_PAGE_DARK_CLASS)).toBe(false);

    paintUnderTextHighlights(doc, [mark], null, true, () => range);
    expect(registry.has(activeName)).toBe(false);
    expect(registry.get(booksHighlightRegistryName("yellow", false))?.ranges[0]).toBe(
      range
    );
    expect(root.classList.contains(BOOKS_HIGHLIGHT_PAGE_DARK_CLASS)).toBe(true);
  });

  test("the blend fallback sets mix-blend-mode on the annotation svg", () => {
    const parent = document.createElement("div");
    const frame = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    parent.append(frame, svg);
    document.body.append(parent);

    const rendition = {
      getContents: () => [
        {
          document,
          window: { frameElement: frame },
        },
      ],
    } as unknown as Rendition;

    applyHighlightOverlayBlend(rendition, "multiply");
    expect(svg.style.mixBlendMode).toBe("multiply");
    applyHighlightOverlayBlend(rendition, "screen");
    expect(svg.style.mixBlendMode).toBe("screen");
    parent.remove();
  });
});
