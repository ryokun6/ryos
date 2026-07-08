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
} from "../../../src/apps/books/utils/chineseScriptConverter";

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

  test("converts regional terms and quotation punctuation in both directions", async () => {
    const simplifiedBook = createBookDocument("");
    simplifiedBook.body.innerHTML =
      "<p>鼠标和自行车。悟空道：<span>“</span>怎么叫做<span>‘</span>水中捞月<span>’</span>？<span>”</span></p>";

    await applyChineseScriptToDocument(
      simplifiedBook,
      "traditional",
      createChineseScriptConversionSession()
    );

    expect(simplifiedBook.querySelector("p")?.textContent).toBe(
      "滑鼠和腳踏車。悟空道：「怎麼叫做『水中撈月』？」"
    );

    const traditionalBook = createBookDocument("", "zh-Hant");
    traditionalBook.body.innerHTML =
      "<p>滑鼠和腳踏車。悟空道：<span>「</span>怎麼叫做<span>『</span>水中撈月<span>』</span>？<span>」</span></p>";

    await applyChineseScriptToDocument(
      traditionalBook,
      "simplified",
      createChineseScriptConversionSession()
    );

    expect(traditionalBook.querySelector("p")?.textContent).toBe(
      "鼠标和自行车。悟空道：“怎么叫做‘水中捞月’？”"
    );
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
        "../../../src/apps/books/utils/chineseScriptConverter.ts",
        import.meta.url
      ),
      "utf8"
    );

    expect(source).toContain('import("opencc-js/t2cn")');
    expect(source).toContain('import("opencc-js/cn2t")');
    expect(source).not.toContain('from "opencc-js"');
    expect(source).toContain('from: "twp"');
    expect(source).toContain('to: "twp"');
    expect(source).toContain("CustomConverter");
  });
});
