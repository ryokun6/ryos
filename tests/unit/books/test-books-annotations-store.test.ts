import "../../helpers/local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  useBooksStore,
  type BookBookmark,
  type BookHighlight,
} from "../../../src/stores/useBooksStore";
import { buildHighlightAnnotationStyles } from "../../../src/apps/books/hooks/useBooksAnnotations";

const PATH = "/Books/Test.epub";
const OTHER = "/Books/Other.epub";

function makeHighlight(overrides: Partial<BookHighlight> = {}): BookHighlight {
  return {
    id: "h1",
    cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:10)",
    text: "some passage",
    color: "yellow",
    createdAt: 1000,
    ...overrides,
  };
}

function makeBookmark(overrides: Partial<BookBookmark> = {}): BookBookmark {
  return {
    cfi: "epubcfi(/6/4!/4/2/1:0)",
    text: "page snippet",
    percentage: 0.25,
    createdAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  useBooksStore.setState({
    progressByPath: {},
    highlightsByPath: {},
    bookmarksByPath: {},
    pinnedTop: [],
    pinnedBottom: [],
    lastOpenedPath: null,
    openPath: null,
  });
});

describe("books highlights store", () => {
  test("addHighlight appends per book", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.addHighlight(
      PATH,
      makeHighlight({
        id: "h2",
        color: "blue",
        cfiRange: "epubcfi(/6/4!/4/2,/1:12,/1:20)",
      })
    );
    s.addHighlight(OTHER, makeHighlight({ id: "h3" }));

    const state = useBooksStore.getState();
    expect(state.highlightsByPath[PATH].map((h) => h.id)).toEqual([
      "h1",
      "h2",
    ]);
    expect(state.highlightsByPath[OTHER].map((h) => h.id)).toEqual(["h3"]);
  });

  test("addHighlight with an existing id replaces the entry", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight({ color: "yellow" }));
    s.addHighlight(PATH, makeHighlight({ color: "pink" }));

    const list = useBooksStore.getState().highlightsByPath[PATH];
    expect(list).toHaveLength(1);
    expect(list[0].color).toBe("pink");
  });

  test("addHighlight with the same cfiRange replaces instead of stacking", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight({ id: "h1", color: "yellow" }));
    s.addHighlight(PATH, makeHighlight({ id: "h2", color: "green" }));

    const list = useBooksStore.getState().highlightsByPath[PATH];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("h2");
    expect(list[0].color).toBe("green");
  });

  test("setHighlightColor recolors only the matching id", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.addHighlight(
      PATH,
      makeHighlight({
        id: "h2",
        color: "green",
        cfiRange: "epubcfi(/6/4!/4/2,/1:12,/1:20)",
      })
    );

    s.setHighlightColor(PATH, "h1", "purple");
    const list = useBooksStore.getState().highlightsByPath[PATH];
    expect(list.find((h) => h.id === "h1")?.color).toBe("purple");
    expect(list.find((h) => h.id === "h2")?.color).toBe("green");

    // Unknown id is a no-op.
    const before = useBooksStore.getState().highlightsByPath;
    s.setHighlightColor(PATH, "nope", "blue");
    expect(useBooksStore.getState().highlightsByPath).toBe(before);
  });

  test("removeHighlight drops the entry and the empty book key", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.removeHighlight(PATH, "h1");
    expect(useBooksStore.getState().highlightsByPath[PATH]).toBeUndefined();
  });
});

describe("books bookmarks store", () => {
  test("addBookmark dedupes by cfi", () => {
    const s = useBooksStore.getState();
    s.addBookmark(PATH, makeBookmark());
    s.addBookmark(PATH, makeBookmark({ text: "updated", createdAt: 2000 }));

    const list = useBooksStore.getState().bookmarksByPath[PATH];
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe("updated");
  });

  test("removeBookmark drops the entry and the empty book key", () => {
    const s = useBooksStore.getState();
    s.addBookmark(PATH, makeBookmark());
    s.addBookmark(PATH, makeBookmark({ cfi: "epubcfi(/6/6!/4/2/1:0)" }));

    s.removeBookmark(PATH, "epubcfi(/6/4!/4/2/1:0)");
    expect(useBooksStore.getState().bookmarksByPath[PATH]).toHaveLength(1);

    s.removeBookmark(PATH, "epubcfi(/6/6!/4/2/1:0)");
    expect(useBooksStore.getState().bookmarksByPath[PATH]).toBeUndefined();
  });
});

describe("books annotations lifecycle", () => {
  test("removeBook forgets highlights and bookmarks for the path", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.addBookmark(PATH, makeBookmark());
    s.addHighlight(OTHER, makeHighlight({ id: "h9" }));

    s.removeBook(PATH);
    const state = useBooksStore.getState();
    expect(state.highlightsByPath[PATH]).toBeUndefined();
    expect(state.bookmarksByPath[PATH]).toBeUndefined();
    expect(state.highlightsByPath[OTHER]).toHaveLength(1);
  });

  test("renameProgressPath migrates highlights and bookmarks", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.addBookmark(PATH, makeBookmark());

    s.renameProgressPath(PATH, OTHER);
    const state = useBooksStore.getState();
    expect(state.highlightsByPath[PATH]).toBeUndefined();
    expect(state.bookmarksByPath[PATH]).toBeUndefined();
    expect(state.highlightsByPath[OTHER]).toHaveLength(1);
    expect(state.bookmarksByPath[OTHER]).toHaveLength(1);
  });
});

describe("highlight annotation styles", () => {
  test("light pages multiply the tint; dark pages screen it", () => {
    const light = buildHighlightAnnotationStyles("yellow", false);
    expect(light["mix-blend-mode"]).toBe("multiply");
    expect(light.fill).toBe("#facc15");

    const dark = buildHighlightAnnotationStyles("yellow", true);
    expect(dark["mix-blend-mode"]).toBe("screen");
  });

  test("the active highlight renders brighter than inactive ones", () => {
    const inactiveLight = buildHighlightAnnotationStyles("yellow", false);
    const activeLight = buildHighlightAnnotationStyles("yellow", false, true);
    expect(Number(activeLight["fill-opacity"])).toBeGreaterThan(
      Number(inactiveLight["fill-opacity"])
    );

    const inactiveDark = buildHighlightAnnotationStyles("yellow", true);
    const activeDark = buildHighlightAnnotationStyles("yellow", true, true);
    expect(Number(activeDark["fill-opacity"])).toBeGreaterThan(
      Number(inactiveDark["fill-opacity"])
    );
  });
});
