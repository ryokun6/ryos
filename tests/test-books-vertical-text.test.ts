import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  applyEpubTextLayout,
  resolveEpubPageDirection,
} from "../src/apps/books/utils/booksTextLayout";

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

function createBookDocument(): Document {
  return document.implementation.createHTMLDocument("Vertical book");
}

describe("Books vertical text layout", () => {
  test("sets the principal writing mode for epub.js pagination", () => {
    const bookDocument = createBookDocument();

    applyEpubTextLayout(bookDocument, "vertical");

    const rootStyle = bookDocument.documentElement.style;
    expect(rootStyle.getPropertyValue("writing-mode")).toBe("vertical-rl");
    expect(rootStyle.getPropertyPriority("writing-mode")).toBe("important");
    expect(rootStyle.getPropertyValue("-webkit-writing-mode")).toBe(
      "vertical-rl"
    );
    expect(rootStyle.getPropertyValue("text-orientation")).toBe("mixed");
    expect(rootStyle.getPropertyValue("direction")).toBe("ltr");
  });

  test("restores the publisher's root styles when returning to book default", () => {
    const bookDocument = createBookDocument();
    const root = bookDocument.documentElement;
    root.style.setProperty("writing-mode", "vertical-lr");
    root.style.setProperty("text-orientation", "upright");
    root.style.setProperty("direction", "rtl");

    applyEpubTextLayout(bookDocument, "vertical");
    applyEpubTextLayout(bookDocument, "book");

    expect(root.style.getPropertyValue("writing-mode")).toBe("vertical-lr");
    expect(root.style.getPropertyValue("text-orientation")).toBe("upright");
    expect(root.style.getPropertyValue("direction")).toBe("rtl");
    expect(root.hasAttribute("data-ryos-text-layout-override")).toBe(false);
  });

  test("uses RTL page progression only for the vertical override", () => {
    expect(resolveEpubPageDirection("vertical", "ltr")).toBe("rtl");
    expect(resolveEpubPageDirection("book", "rtl")).toBe("rtl");
    expect(resolveEpubPageDirection("book", "ltr")).toBe("ltr");
    expect(resolveEpubPageDirection("book", "unexpected")).toBe("ltr");
  });
});
