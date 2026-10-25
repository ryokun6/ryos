import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { BookHighlight } from "../../../src/stores/useBooksStore";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const { BooksHighlightsList } = await import(
  "../../../src/apps/books/components/BooksHighlightsDrawer"
);

const i18n = i18next.createInstance();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mark(
  id: string,
  text: string,
  cfiRange: string,
  color: BookHighlight["color"] = "yellow"
): BookHighlight {
  return { id, text, cfiRange, color, createdAt: 1 };
}

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: {
        translation: {
          apps: {
            books: {
              highlights: {
                title: "Highlights",
                emptyTitle: "No Highlights",
                emptyHint:
                  "Select a passage while you read and it will show up here.",
                untitled: "Highlight",
              },
              selection: {
                color: {
                  yellow: "Yellow highlight",
                  green: "Green highlight",
                  blue: "Blue highlight",
                  pink: "Pink highlight",
                  purple: "Purple highlight",
                },
              },
            },
          },
        },
      },
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
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

async function renderList(
  highlights: BookHighlight[],
  onSelect: (highlight: BookHighlight) => void = () => {}
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(BooksHighlightsList, { highlights, onSelect })
      )
    );
  });
  return container;
}

describe("Books highlights list", () => {
  test("shows an empty state when the book has no highlights", async () => {
    const view = await renderList([]);
    expect(view?.textContent).toContain("No Highlights");
    expect(view?.textContent).toContain(
      "Select a passage while you read and it will show up here."
    );
  });

  test("lists highlights in reading order and jumps to the one that was tapped", async () => {
    const later = mark(
      "later",
      "Second passage",
      "epubcfi(/6/6!/4/2,/1:0,/1:8)",
      "blue"
    );
    const earlier = mark(
      "earlier",
      "First passage",
      "epubcfi(/6/4!/4/2,/1:0,/1:8)",
      "pink"
    );
    const selected: BookHighlight[] = [];
    const view = await renderList([later, earlier], (highlight) => {
      selected.push(highlight);
    });
    const buttons = [...(view?.querySelectorAll("button") ?? [])];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "First passage",
      "Second passage",
    ]);
    expect(buttons[0]?.getAttribute("aria-label")).toContain("Pink highlight");
    // Keep the click inside the React root. Importing the drawer also arms
    // the app sound library, which preloads on the first document click.
    view?.addEventListener("click", (event) => event.stopPropagation());
    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toEqual([later]);
  });
});
