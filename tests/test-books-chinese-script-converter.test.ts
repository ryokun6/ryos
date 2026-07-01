import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  applyChineseScriptToDocument,
  createChineseScriptConversionSession,
  resolveChineseScriptReadingLanguage,
} from "../src/apps/books/utils/chineseScriptConverter";

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

function createBookDocument(text: string, language = "zh-Hans"): Document {
  const bookDocument = document.implementation.createHTMLDocument("Book");
  bookDocument.documentElement.setAttribute("lang", language);
  bookDocument.body.innerHTML = `
    <p title="汉字元数据">${text}</p>
    <script>const label = "汉字脚本";</script>
  `;
  return bookDocument;
}

describe("Books live Chinese script conversion", () => {
  test("switches scripts live and restores the exact original text", async () => {
    const bookDocument = createBookDocument("汉字发型");
    const session = createChineseScriptConversionSession();
    const paragraph = bookDocument.querySelector("p")!;
    const script = bookDocument.querySelector("script")!;

    expect(
      await applyChineseScriptToDocument(
        bookDocument,
        "traditional",
        session
      )
    ).toBe(1);
    expect(paragraph.textContent).toBe("漢字髮型");
    expect(bookDocument.documentElement.lang).toBe("zh-TW");
    expect(paragraph.getAttribute("title")).toBe("汉字元数据");
    expect(script.textContent).toContain("汉字脚本");

    await applyChineseScriptToDocument(bookDocument, "simplified", session);
    expect(paragraph.textContent).toBe("汉字发型");
    expect(bookDocument.documentElement.lang).toBe("zh-CN");

    await applyChineseScriptToDocument(bookDocument, "traditional", session);
    await applyChineseScriptToDocument(bookDocument, "original", session);
    expect(paragraph.textContent).toBe("汉字发型");
    expect(bookDocument.documentElement.lang).toBe("zh-Hans");
  });

  test("converts Traditional Chinese text to Simplified Chinese", async () => {
    const bookDocument = createBookDocument("漢字髮型", "zh-Hant");

    await applyChineseScriptToDocument(
      bookDocument,
      "simplified",
      createChineseScriptConversionSession()
    );

    expect(bookDocument.querySelector("p")?.textContent).toBe("汉字发型");
  });

  test("ignores a stale async selection", async () => {
    const bookDocument = createBookDocument("汉字");

    await applyChineseScriptToDocument(
      bookDocument,
      "traditional",
      createChineseScriptConversionSession(),
      () => false
    );

    expect(bookDocument.querySelector("p")?.textContent).toBe("汉字");
  });

  test("resolves matching Chinese font locales", () => {
    expect(resolveChineseScriptReadingLanguage("original", "ja")).toBe("ja");
    expect(resolveChineseScriptReadingLanguage("simplified", "ja")).toBe(
      "zh-CN"
    );
    expect(resolveChineseScriptReadingLanguage("traditional", "ja")).toBe(
      "zh-TW"
    );
  });

  test("keeps both OpenCC directions behind dynamic imports", () => {
    const source = readFileSync(
      new URL(
        "../src/apps/books/utils/chineseScriptConverter.ts",
        import.meta.url
      ),
      "utf8"
    );

    expect(source).toContain('import("opencc-js/t2cn")');
    expect(source).toContain('import("opencc-js/cn2t")');
    expect(source).not.toContain('from "opencc-js"');
  });
});
