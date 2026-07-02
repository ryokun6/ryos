import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

// happy-dom has no ResizeObserver; ScrollFadeRow observes its scroll container.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
  });
}

const { BooksCustomizePanel } = await import(
  "../src/apps/books/components/BooksCustomizePanel"
);
const { applyFontPreviewStack, BOOK_FONTS, getBookFontCssStack } = await import(
  "../src/apps/books/utils/booksReader"
);
const { DEFAULT_BOOKS_SETTINGS } = await import(
  "../src/stores/useBooksStore"
);

const i18n = i18next.createInstance();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: { translation: {} },
      "zh-TW": { translation: {} },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

async function renderPanel(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(BooksCustomizePanel, {
          settings: { ...DEFAULT_BOOKS_SETTINGS },
          updateSettings: () => {},
          osIsDark: false,
          compact: false,
          bookLanguage: null,
          onClose: () => {},
        })
      )
    );
  });
  return container;
}

describe("applyFontPreviewStack", () => {
  test("sets the stack as an inline declaration with important priority", () => {
    const el = document.createElement("button");
    applyFontPreviewStack(el, '"EB Garamond", serif');

    expect(el.style.getPropertyValue("font-family")).toBe(
      '"EB Garamond", serif'
    );
    expect(el.style.getPropertyPriority("font-family")).toBe("important");
  });

  test("clears any previous stack when the font keeps publisher defaults", () => {
    const el = document.createElement("button");
    applyFontPreviewStack(el, '"EB Garamond", serif');
    applyFontPreviewStack(el, null);

    expect(el.style.getPropertyValue("font-family")).toBe("");
  });

  test("ignores unmount calls from React ref callbacks", () => {
    expect(() => applyFontPreviewStack(null, '"EB Garamond", serif')).not.toThrow();
  });
});

/** CSSOM normalizes quoting, so compare unquoted family lists. */
function fontFamilies(stack: string): string[] {
  return stack
    .split(",")
    .map((family) => family.trim().replace(/^["']|["']$/g, ""));
}

describe("BooksCustomizePanel font chips", () => {
  test("every chip previews its own font stack with important priority", async () => {
    const host = await renderPanel();
    const chips = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
    ).filter((chip) => chip.textContent?.startsWith("apps.books.fonts."));

    expect(chips).toHaveLength(BOOK_FONTS.length);

    for (const font of BOOK_FONTS) {
      const chip = chips.find(
        (candidate) => candidate.textContent === `apps.books.fonts.${font.id}`
      );
      expect(chip).toBeDefined();

      const expectedStack = getBookFontCssStack(font.id, "en");
      if (expectedStack === null) {
        // "Original" keeps the theme UI font (no inline override).
        expect(chip!.style.getPropertyValue("font-family")).toBe("");
      } else {
        expect(
          fontFamilies(chip!.style.getPropertyValue("font-family"))
        ).toEqual(fontFamilies(expectedStack));
        // Theme stylesheets force `font-family: var(--os-font-ui) !important`
        // on buttons; only an inline important declaration can beat that.
        expect(chip!.style.getPropertyPriority("font-family")).toBe(
          "important"
        );
      }
    }
  });
});

describe("BooksCustomizePanel theme swatches", () => {
  test("uses consistently sized, softly rounded Latin previews", async () => {
    const host = await renderPanel();
    const swatches = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        'button[title^="apps.books.theme."]'
      )
    );

    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      expect(swatch.textContent).toBe("Aa");
      expect(swatch.classList.contains("!rounded-[5px]")).toBe(true);
      expect(swatch.classList.contains("rounded-full")).toBe(false);
      expect(swatch.querySelector("span")?.classList.contains("!text-[11px]")).toBe(
        true
      );
    }

    const accent = swatches.find(
      (swatch) => swatch.title === "apps.books.theme.accent"
    );
    const custom = swatches.find(
      (swatch) => swatch.title === "apps.books.theme.custom"
    );
    const normal = swatches.find(
      (swatch) => swatch.title === "apps.books.theme.light"
    );
    expect(custom?.classList.contains("!p-[2.5px]")).toBe(true);
    expect(
      custom?.querySelector("span")?.classList.contains("border-0")
    ).toBe(true);
    expect(accent?.classList.contains("!p-0")).toBe(true);
    expect(accent?.querySelector("span")?.classList.contains("border")).toBe(
      true
    );
    expect(normal?.classList.contains("!p-0")).toBe(true);
    expect(normal?.querySelector("span")?.classList.contains("border")).toBe(
      true
    );
  });

  test("uses the localized character preview for CJK UI locales", async () => {
    await i18n.changeLanguage("zh-TW");
    const host = await renderPanel();
    const swatches = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        'button[title^="apps.books.theme."]'
      )
    );

    expect(swatches.length).toBeGreaterThan(0);
    expect(swatches.every((swatch) => swatch.textContent === "字")).toBe(true);
  });
});
