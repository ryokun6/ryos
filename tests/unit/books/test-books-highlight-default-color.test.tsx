import "../../helpers/local-storage-stub";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Contents, Rendition } from "epubjs";
import { useBooksAnnotations } from "../../../src/apps/books/hooks/useBooksAnnotations";
import {
  BOOKS_HIGHLIGHT_COLORS,
  DEFAULT_BOOKS_HIGHLIGHT_COLOR,
  DEFAULT_BOOKS_SETTINGS,
  normalizeBooksHighlightColor,
  useBooksStore,
  type BookHighlight,
  type BooksHighlightColor,
} from "../../../src/stores/useBooksStore";

const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const CFI = "epubcfi(/6/4!/4/2,/1:0,/1:12)";
const OTHER_CFI = "epubcfi(/6/4!/4/2,/1:14,/1:24)";

type AnnotationsApi = ReturnType<typeof useBooksAnnotations>;

interface FakeReader {
  rendition: Rendition;
  contents: Contents;
  select: (text: string) => void;
  emitSelected: (cfiRange?: string) => void;
}

function createFakeReader(initialText: string): FakeReader {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const docListeners = new Map<string, Set<(event: Event) => void>>();
  let text = initialText;
  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    toString: () => (selection.isCollapsed ? "" : text),
    removeAllRanges() {
      selection.rangeCount = 0;
      selection.isCollapsed = true;
      docListeners
        .get("selectionchange")
        ?.forEach((handler) => handler(new Event("selectionchange")));
    },
  };
  const documentListeners = {
    addEventListener(type: string, handler: (event: Event) => void) {
      const set = docListeners.get(type) ?? new Set<(event: Event) => void>();
      set.add(handler);
      docListeners.set(type, set);
    },
    removeEventListener(type: string, handler: (event: Event) => void) {
      docListeners.get(type)?.delete(handler);
    },
  };
  const contents = {
    document: documentListeners,
    window: { getSelection: () => selection },
  };
  const rendition = {
    on(event: string, handler: (...args: never[]) => void) {
      const set = listeners.get(event) ?? new Set<(...args: never[]) => void>();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event: string, handler: (...args: never[]) => void) {
      listeners.get(event)?.delete(handler);
    },
    getContents: () => [contents],
    getRange: () => ({ toString: () => text }),
    annotations: {
      remove() {},
      highlight() {},
    },
    emit(event: string, ...args: never[]) {
      listeners.get(event)?.forEach((handler) => handler(...args));
    },
  };

  return {
    rendition: rendition as unknown as Rendition,
    contents: contents as unknown as Contents,
    select(next) {
      text = next;
      selection.rangeCount = 1;
      selection.isCollapsed = false;
    },
    emitSelected(cfiRange = CFI) {
      rendition.emit(
        "selected",
        cfiRange as never,
        contents as never
      );
    },
  };
}

let api: AnnotationsApi | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let added: BookHighlight[] = [];
let recolored: Array<{ id: string; color: BooksHighlightColor }> = [];

function HighlightProbe({
  reader,
  highlights,
}: {
  reader: FakeReader;
  highlights: BookHighlight[];
}) {
  api = useBooksAnnotations({
    getRendition: () => reader.rendition,
    isReady: true,
    isDarkPage: false,
    highlights,
    onAddHighlight: (highlight) => {
      added.push(highlight);
    },
    onSetHighlightColor: (id, color) => {
      recolored.push({ id, color });
    },
    onRemoveHighlight: () => {},
  });
  return null;
}

function currentApi(): AnnotationsApi {
  if (!api) throw new Error("annotations hook is not mounted");
  return api;
}

async function mount(reader: FakeReader, highlights: BookHighlight[] = []) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      React.createElement(HighlightProbe, { reader, highlights })
    );
  });
}

beforeEach(() => {
  added = [];
  recolored = [];
  api = null;
  useBooksStore.setState({
    settings: { ...DEFAULT_BOOKS_SETTINGS },
  });
  jest.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  api = null;
  jest.useRealTimers();
  useBooksStore.setState({
    settings: { ...DEFAULT_BOOKS_SETTINGS },
  });
});

afterAll(() => {
  if (originalActEnvironment) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment
    );
  }
});

describe("books highlight color preference", () => {
  test("defaults to the first toolbar swatch", () => {
    expect(DEFAULT_BOOKS_HIGHLIGHT_COLOR).toBe(BOOKS_HIGHLIGHT_COLORS[0]);
    expect(DEFAULT_BOOKS_SETTINGS.lastHighlightColor).toBe(
      DEFAULT_BOOKS_HIGHLIGHT_COLOR
    );
    expect(normalizeBooksHighlightColor(undefined)).toBe(
      DEFAULT_BOOKS_HIGHLIGHT_COLOR
    );
    expect(normalizeBooksHighlightColor("orange")).toBe(
      DEFAULT_BOOKS_HIGHLIGHT_COLOR
    );
    expect(normalizeBooksHighlightColor("blue")).toBe("blue");
  });

  test("migration backfills a missing color and drops unknown values", async () => {
    const migrate = useBooksStore.persist.getOptions().migrate;
    if (!migrate) throw new Error("books store migrate is missing");

    const missing = (await migrate(
      { settings: { fontId: "serif" } },
      10
    )) as { settings: { fontId: string; lastHighlightColor: string } };
    expect(missing.settings.fontId).toBe("serif");
    expect(missing.settings.lastHighlightColor).toBe(
      DEFAULT_BOOKS_HIGHLIGHT_COLOR
    );

    const invalid = (await migrate(
      { settings: { lastHighlightColor: "orange" } },
      10
    )) as { settings: { lastHighlightColor: string } };
    expect(invalid.settings.lastHighlightColor).toBe(
      DEFAULT_BOOKS_HIGHLIGHT_COLOR
    );

    const kept = (await migrate(
      { settings: { lastHighlightColor: "purple" } },
      10
    )) as { settings: { lastHighlightColor: string } };
    expect(kept.settings.lastHighlightColor).toBe("purple");
  });

  test("writes the last highlight color into the persisted books snapshot", async () => {
    useBooksStore.getState().updateSettings({ lastHighlightColor: "green" });
    const stored = await useBooksStore.persist
      .getOptions()
      .storage!.getItem("ryos:books");
    expect(stored?.state.settings.lastHighlightColor).toBe("green");
    expect(stored?.version).toBe(11);
  });
});

describe("books selection commits the last highlight color", () => {
  test("a settled selection uses the saved color without another swatch tap", async () => {
    useBooksStore.getState().updateSettings({ lastHighlightColor: "blue" });
    const reader = createFakeReader("highlighted words");
    await mount(reader);

    await act(async () => {
      reader.emitSelected();
    });

    expect(added).toHaveLength(1);
    expect(added[0]?.color).toBe("blue");
    expect(added[0]?.text).toBe("highlighted words");
    expect(added[0]?.cfiRange).toBe(CFI);
    expect(currentApi().activeSelection).toMatchObject({
      kind: "highlight",
      highlightId: added[0]?.id,
      color: "blue",
    });
    expect(useBooksStore.getState().settings.lastHighlightColor).toBe("blue");

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(currentApi().activeSelection?.highlightId).toBe(added[0]?.id);
  });

  test("a second selected event for the same range does not add another highlight", async () => {
    const reader = createFakeReader("once");
    await mount(reader);

    await act(async () => {
      reader.emitSelected();
      reader.select("once");
      reader.emitSelected();
    });

    expect(added).toHaveLength(1);
    expect(added[0]?.color).toBe(DEFAULT_BOOKS_HIGHLIGHT_COLOR);
  });

  test("tapping another swatch recolors the passage and becomes the new default", async () => {
    const reader = createFakeReader("recolor me");
    await mount(reader);

    await act(async () => {
      reader.emitSelected();
    });
    const id = added[0]?.id;
    expect(id).toBeTruthy();

    await act(async () => {
      currentApi().applyHighlightColor("purple");
    });

    expect(recolored).toEqual([{ id, color: "purple" }]);
    expect(useBooksStore.getState().settings.lastHighlightColor).toBe(
      "purple"
    );
    expect(currentApi().activeSelection).toBeNull();

    reader.select("next passage");
    await act(async () => {
      reader.emitSelected(OTHER_CFI);
    });

    expect(added).toHaveLength(2);
    expect(added[1]?.color).toBe("purple");
    expect(added[1]?.cfiRange).toBe(OTHER_CFI);
  });

  test("reselecting a saved passage keeps its color and the previous default", async () => {
    useBooksStore.getState().updateSettings({ lastHighlightColor: "pink" });
    const existing: BookHighlight = {
      id: "saved",
      cfiRange: CFI,
      text: "already marked",
      color: "green",
      createdAt: 50,
    };
    const reader = createFakeReader("already marked");
    await mount(reader, [existing]);

    await act(async () => {
      reader.emitSelected();
    });

    expect(added).toHaveLength(0);
    expect(currentApi().activeSelection).toMatchObject({
      kind: "highlight",
      highlightId: "saved",
      color: "green",
    });
    expect(useBooksStore.getState().settings.lastHighlightColor).toBe("pink");
  });
});
