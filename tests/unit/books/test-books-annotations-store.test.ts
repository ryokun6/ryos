import "../../helpers/local-storage-stub";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BOOKS_HIGHLIGHT_UNDER_TEXT_CSS,
  buildHighlightAnnotationStyles,
  highlightOverlayBlendMode,
  highlightUnderTextAlpha,
} from "../../../src/apps/books/hooks/useBooksAnnotations";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import {
  useBooksStore,
  type BookBookmark,
  type BookHighlight,
} from "../../../src/stores/useBooksStore";

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
  useCloudSyncStore.setState((state) => ({
    deletionMarkers: { ...state.deletionMarkers, booksHighlightIds: {} },
  }));
});

afterEach(() => {
  useCloudSyncStore.setState((state) => ({
    deletionMarkers: { ...state.deletionMarkers, booksHighlightIds: {} },
  }));
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

  test("addHighlight merges overlapping and contiguous ranges into one mark", () => {
    const s = useBooksStore.getState();
    s.addHighlight(
      PATH,
      makeHighlight({
        id: "h1",
        cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
        text: "abcdefghijkl",
        color: "yellow",
        createdAt: 1000,
      })
    );
    s.addHighlight(
      PATH,
      makeHighlight({
        id: "h2",
        cfiRange: "epubcfi(/6/4!/4/2,/1:12,/1:20)",
        text: "mnopqrst",
        color: "green",
        createdAt: 2000,
      })
    );

    const list = useBooksStore.getState().highlightsByPath[PATH];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "h2",
      cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:20)",
      text: "abcdefghijklmnopqrst",
      color: "green",
      createdAt: 1000,
    });
    expect(
      useCloudSyncStore.getState().deletionMarkers.booksHighlightIds.h1
    ).toEqual(expect.any(String));
  });

  test("setHighlightColor merges neighbors into the recolored range", () => {
    useBooksStore.setState({
      highlightsByPath: {
        [PATH]: [
          makeHighlight({
            id: "h1",
            cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:12)",
            text: "abcdefghijkl",
          }),
          makeHighlight({
            id: "h2",
            cfiRange: "epubcfi(/6/4!/4/2,/1:20,/1:24)",
            text: "wxyz",
            color: "blue",
          }),
          makeHighlight({
            id: "h3",
            cfiRange: "epubcfi(/6/4!/4/2,/1:8,/1:16)",
            text: "ijklmnop",
            color: "pink",
            createdAt: 1500,
          }),
        ],
      },
    });

    useBooksStore.getState().setHighlightColor(PATH, "h1", "purple");
    const list = useBooksStore.getState().highlightsByPath[PATH];
    expect(list.map((h) => h.id).sort()).toEqual(["h1", "h2"]);
    expect(list.find((h) => h.id === "h1")).toMatchObject({
      color: "purple",
      cfiRange: "epubcfi(/6/4!/4/2,/1:0,/1:16)",
    });
    expect(list.find((h) => h.id === "h2")?.color).toBe("blue");
  });

  test("removeHighlight drops the entry and the empty book key", () => {
    const s = useBooksStore.getState();
    s.addHighlight(PATH, makeHighlight());
    s.removeHighlight(PATH, "h1");
    expect(useBooksStore.getState().highlightsByPath[PATH]).toBeUndefined();
    expect(
      useCloudSyncStore.getState().deletionMarkers.booksHighlightIds.h1
    ).toEqual(expect.any(String));
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
    expect(
      useCloudSyncStore.getState().deletionMarkers.booksHighlightIds.h1
    ).toEqual(expect.any(String));
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

  test("setProgress keeps updatedAt when the page did not move", () => {
    const s = useBooksStore.getState();
    s.setProgress(PATH, {
      cfi: "epubcfi(/6/8!/4/2/1:40)",
      percentage: 0.4,
      updatedAt: 10,
      kosyncProgress: "/body/DocFragment[2]/p",
    });
    s.setProgress(PATH, {
      cfi: "epubcfi(/6/8!/4/2/1:40)",
      percentage: 0.4002,
      updatedAt: 99,
      kosyncProgress: "/body/DocFragment[2]/p",
    });
    expect(useBooksStore.getState().progressByPath[PATH]?.updatedAt).toBe(10);

    s.setProgress(PATH, {
      cfi: "epubcfi(/6/10!/4/2/1:2)",
      percentage: 0.55,
      updatedAt: 20,
      kosyncProgress: "/body/DocFragment[3]/p",
    });
    expect(useBooksStore.getState().progressByPath[PATH]).toMatchObject({
      cfi: "epubcfi(/6/10!/4/2/1:2)",
      percentage: 0.55,
      updatedAt: 20,
    });
  });
});

describe("highlight annotation styles", () => {
  test("the visible wash is a CSS highlight behind the glyphs", () => {
    const css = BOOKS_HIGHLIGHT_UNDER_TEXT_CSS;
    expect(css).toContain("::highlight(ryos-books-hl-yellow)");
    expect(css).toContain("background-color:");
    expect(css).not.toMatch(/(^|[;{])\s*color:/);
    expect(highlightUnderTextAlpha(false, true)).toBeGreaterThan(
      highlightUnderTextAlpha(false, false)
    );
    expect(highlightUnderTextAlpha(true, true)).toBeGreaterThan(
      highlightUnderTextAlpha(true, false)
    );
  });

  test("under-text marks keep the SVG rect as an invisible hit target", () => {
    const styles = buildHighlightAnnotationStyles("yellow", false, true, "under-text");
    expect(styles.fill).toBe("#facc15");
    expect(styles["fill-opacity"]).toBe("0");
    expect(styles["mix-blend-mode"]).toBe("normal");
  });

  test("the blend fallback multiplies on light pages and screens on dark pages", () => {
    expect(highlightOverlayBlendMode(false)).toBe("multiply");
    expect(highlightOverlayBlendMode(true)).toBe("screen");
    const styles = buildHighlightAnnotationStyles("blue", true, false, "blend");
    expect(styles["fill-opacity"]).toBe("1");
    expect(styles["mix-blend-mode"]).toBe("normal");
  });
});
