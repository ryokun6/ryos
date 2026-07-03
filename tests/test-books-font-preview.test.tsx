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

async function renderPanel(compact = false): Promise<HTMLDivElement> {
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
          compact,
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
      expect(chip!.classList.contains("h-7")).toBe(true);
      expect(chip!.classList.contains("!text-[12px]")).toBe(true);
      expect(chip!.classList.contains("books-font-pill")).toBe(true);
      expect(chip!.classList.contains("metal-inset-btn")).toBe(true);
      expect(chip!.dataset.state).toBe(
        DEFAULT_BOOKS_SETTINGS.fontId === font.id ? "on" : "off"
      );

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

describe("BooksCustomizePanel segmented controls", () => {
  test("uses the Aqua inset toolbar treatment", async () => {
    const host = await renderPanel();
    const selected = host.querySelector<HTMLButtonElement>(
      'button[role="radio"][aria-checked="true"]'
    );

    expect(selected?.dataset.state).toBe("on");
    expect(selected?.classList.contains("h-full")).toBe(true);
    expect(selected?.classList.contains("!text-[12px]")).toBe(true);
    expect(selected?.classList.contains("metal-inset-btn")).toBe(true);
    expect(
      selected?.parentElement?.classList.contains("metal-inset-btn-group")
    ).toBe(true);
    expect(selected?.parentElement?.classList.contains("h-6")).toBe(true);

    const panel = host.querySelector(".books-customize-panel");
    const children = Array.from(panel?.children ?? []);
    const colorRow = host
      .querySelector('button[title^="apps.books.theme."]')
      ?.closest(".shrink-0");
    const segmentedRow = selected?.closest(".shrink-0");
    expect(children.indexOf(segmentedRow!)).toBeGreaterThan(
      children.indexOf(colorRow!)
    );
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
      expect(swatch.classList.contains("h-7")).toBe(true);
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

describe("BooksCustomizePanel setting rows", () => {
  test("keeps every setting row at the same 32px height", async () => {
    const host = await renderPanel();
    const panel = host.querySelector(".books-customize-panel");
    const rows = Array.from(panel?.children ?? []).filter((child) =>
      child.classList.contains("shrink-0")
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.classList.contains("h-8"))).toBe(true);
    expect(
      rows.every((row) =>
        row.querySelector('[title]')?.classList.contains("text-[12px]")
      )
    ).toBe(true);
    expect(
      rows.every((row) =>
        row.querySelector('[title]')?.classList.contains("line-clamp-2")
      )
    ).toBe(true);
    const valueLabels = rows
      .map((row) => row.lastElementChild)
      .filter((child) => child?.tagName === "SPAN");
    expect(
      valueLabels.every((label) => label?.classList.contains("w-9"))
    ).toBe(true);
  });

  test("centers the wide panel above the reader toolbar", async () => {
    const host = await renderPanel();
    const panel = host.querySelector(".books-customize-panel");

    expect(panel?.classList.contains("bottom-[50px]")).toBe(true);
    expect(panel?.classList.contains("left-1/2")).toBe(true);
    expect(panel?.classList.contains("-translate-x-1/2")).toBe(true);
    expect(panel?.classList.contains("w-[328px]")).toBe(true);
    expect(panel?.classList.contains("px-4")).toBe(true);
    expect(panel?.classList.contains("os-mac-aqua:!rounded-[14px]")).toBe(true);
    expect(panel?.classList.contains("top-10")).toBe(false);
  });

  test("always shows the pill-shaped Done button", async () => {
    const wideHost = await renderPanel();
    expect(
      wideHost.querySelector('button[aria-label="common.dialog.done"]')
    ).not.toBeNull();

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    const compactHost = await renderPanel(true);
    expect(
      compactHost.querySelector('button[aria-label="common.dialog.done"]')
    ).not.toBeNull();
    const compactPanel = compactHost.querySelector(".books-customize-panel");
    expect(compactPanel?.classList.contains("inset-x-1")).toBe(true);
    expect(compactPanel?.classList.contains("bottom-1")).toBe(true);
    expect(compactPanel?.classList.contains("rounded-[10px]")).toBe(true);
  });
});
