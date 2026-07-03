import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type BooksColumnMode = "auto" | "single" | "double";
export type BooksThemeOverride =
  | "auto"
  | "accent"
  | "light"
  | "paper"
  | "sepia"
  | "gray"
  | "green"
  | "dark"
  | "night"
  | "black"
  | "custom";
export const BOOKS_THEME_OVERRIDES: readonly BooksThemeOverride[] = [
  "auto",
  "accent",
  "light",
  "paper",
  "sepia",
  "gray",
  "green",
  "dark",
  "night",
  "black",
  "custom",
];
export function isBooksThemeOverride(
  value: unknown
): value is BooksThemeOverride {
  return (BOOKS_THEME_OVERRIDES as readonly unknown[]).includes(value);
}
export type BooksChineseScript = "original" | "simplified" | "traditional";
export type BooksTextLayout = "book" | "vertical";
export type BooksShelfView = "grid" | "list";

export interface BookProgress {
  /** EPUB CFI of the current location. */
  cfi: string;
  /** 0..1 progress through the book (when locations are available). */
  percentage: number;
  updatedAt: number;
}

export type BooksHighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple";

export const BOOKS_HIGHLIGHT_COLORS: readonly BooksHighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
];

/** Swatch / annotation fill per highlight color (works on light + dark pages
 * via blend modes applied at render time). */
export const BOOKS_HIGHLIGHT_COLOR_HEX: Record<BooksHighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
  pink: "#f472b6",
  purple: "#c084fc",
};

export function isBooksHighlightColor(
  value: unknown
): value is BooksHighlightColor {
  return (BOOKS_HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}

export interface BookHighlight {
  id: string;
  /** EPUB CFI range of the highlighted passage. */
  cfiRange: string;
  /** Plain text of the highlighted passage. */
  text: string;
  color: BooksHighlightColor;
  createdAt: number;
}

export interface BookBookmark {
  /** EPUB CFI of the bookmarked page start. */
  cfi: string;
  /** Short text snippet from the bookmarked page (used as a menu label). */
  text?: string;
  /** 0..1 progress of the bookmark position when known. */
  percentage?: number;
  createdAt: number;
}

export interface BooksReaderSettings {
  /** Font option id (see BOOK_FONTS). "original" keeps the publisher fonts. */
  fontId: string;
  /** Body font size as a percentage (100 = default). */
  fontSizePct: number;
  /** Column layout mode. "auto" follows the reader width. */
  columnMode: BooksColumnMode;
  /**
   * Reading theme override. "auto" follows the OS dark-mode setting; "accent"
   * derives page colors from the OS accent color.
   */
  themeOverride: BooksThemeOverride;
  /** Custom theme: page background color (hex). */
  customThemeBackground: string;
  /** Custom theme: text (foreground) color (hex). */
  customThemeText: string;
  /**
   * Custom theme: render the page background transparent so the window
   * material (e.g. Aqua Glass) shows through. The picked background color is
   * kept so toggling transparency off restores it.
   */
  customThemeTransparent: boolean;
  /** Optional live conversion for Chinese text in the rendered EPUB. */
  chineseScript: BooksChineseScript;
  /** Text flow override. "book" preserves the EPUB's own writing mode. */
  textLayout: BooksTextLayout;
  /** Line height multiplier. */
  lineHeight: number;
  /** Horizontal gutter (px) around the text column. */
  gutterPx: number;
  /** Read-aloud (browser TTS) speaking rate multiplier. */
  speechRate: number;
}

export const DEFAULT_BOOKS_SETTINGS: BooksReaderSettings = {
  fontId: "original",
  fontSizePct: 100,
  columnMode: "auto",
  themeOverride: "auto",
  customThemeBackground: "#fdfdfb",
  customThemeText: "#1c1c1c",
  customThemeTransparent: false,
  chineseScript: "original",
  textLayout: "book",
  lineHeight: 1.5,
  gutterPx: 24,
  speechRate: 1,
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether a value is a #rgb / #rrggbb hex color string. */
export function isBooksCustomHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim());
}

/**
 * Coerce a persisted/synced custom theme color to a safe lowercase #rrggbb
 * value, falling back when the input is not a valid hex color.
 */
export function normalizeBooksCustomColor(
  value: unknown,
  fallback: string
): string {
  if (!isBooksCustomHexColor(value)) return fallback;
  let hex = value.trim().toLowerCase();
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

export const BOOKS_SPEECH_RATE_MIN = 0.5;
export const BOOKS_SPEECH_RATE_MAX = 2;
export const BOOKS_SPEECH_RATE_OPTIONS = [0.8, 1, 1.2, 1.5] as const;

/**
 * Coerce a persisted/synced speech rate to a safe utterance rate. Guards
 * against `undefined`/NaN (e.g. pre-v5 persisted settings that predate the
 * field): assigning a non-finite rate to SpeechSynthesisUtterance throws.
 */
export function normalizeBooksSpeechRate(rate: unknown): number {
  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate < BOOKS_SPEECH_RATE_MIN ||
    rate > BOOKS_SPEECH_RATE_MAX
  ) {
    return DEFAULT_BOOKS_SETTINGS.speechRate;
  }
  return rate;
}

export const BOOKS_FONT_SIZE_MIN = 70;
export const BOOKS_FONT_SIZE_MAX = 180;
export const BOOKS_FONT_SIZE_STEP = 10;

export const BOOKS_LINE_HEIGHT_MIN = 1.5;
export const BOOKS_LINE_HEIGHT_MAX = 2.4;
export const BOOKS_LINE_HEIGHT_STEP = 0.05;

export function clampBooksLineHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BOOKS_SETTINGS.lineHeight;
  return Math.min(
    BOOKS_LINE_HEIGHT_MAX,
    Math.max(BOOKS_LINE_HEIGHT_MIN, value)
  );
}

export const BOOKS_GUTTER_MIN = 0;
export const BOOKS_GUTTER_MAX = 96;
export const BOOKS_GUTTER_STEP = 4;

export function clampBooksGutter(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BOOKS_SETTINGS.gutterPx;
  return Math.min(BOOKS_GUTTER_MAX, Math.max(BOOKS_GUTTER_MIN, value));
}

interface BooksStoreState {
  progressByPath: Record<string, BookProgress>;
  /**
   * Text highlights per book. Device-local (not cloud-synced): the bookshelf
   * sync namespace can't grow new keys without older clients inferring
   * deletions, so annotations stay on the device that made them.
   */
  highlightsByPath: Record<string, BookHighlight[]>;
  /** Page bookmarks per book. Device-local, same reasoning as highlights. */
  bookmarksByPath: Record<string, BookBookmark[]>;
  settings: BooksReaderSettings;
  shelfView: BooksShelfView;
  lastOpenedPath: string | null;
  /**
   * Book left open in the reader (`null` = shelf). Device-local: reopening
   * Books restores this path (and its saved CFI) or the shelf, without
   * syncing the in-app view across devices.
   */
  openPath: string | null;
  /** Paths explicitly pinned to the top of the shelf (first = highest). */
  pinnedTop: string[];
  /** Paths explicitly pinned to the bottom of the shelf (last = lowest). */
  pinnedBottom: string[];
  setProgress: (path: string, progress: BookProgress) => void;
  getProgress: (path: string) => BookProgress | undefined;
  clearProgress: (path: string) => void;
  /**
   * Forget all synced reading state for a removed book: progress, shelf
   * ordering, last-opened, and the device-local open session path. Used when
   * a book is deleted so the bookshelf codec stops emitting stale docs (and
   * the engine tombstones the dropped progress key cross-device via shadow
   * diff).
   */
  removeBook: (path: string) => void;
  addHighlight: (path: string, highlight: BookHighlight) => void;
  setHighlightColor: (
    path: string,
    id: string,
    color: BooksHighlightColor
  ) => void;
  removeHighlight: (path: string, id: string) => void;
  addBookmark: (path: string, bookmark: BookBookmark) => void;
  removeBookmark: (path: string, cfi: string) => void;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  setShelfView: (view: BooksShelfView) => void;
  setLastOpenedPath: (path: string | null) => void;
  /** Set/clear the book currently open in the reader (null = shelf). */
  setOpenPath: (path: string | null) => void;
  /** Move progress when a file is renamed/moved in the VFS. */
  renameProgressPath: (oldPath: string, newPath: string) => void;
  /** Pin a book to the top of the shelf (removes it from the bottom). */
  moveBookToTop: (path: string) => void;
  /** Pin a book to the bottom of the shelf (removes it from the top). */
  moveBookToBottom: (path: string) => void;
}

const without = (list: string[], path: string) =>
  list.filter((p) => p !== path);

export const useBooksStore = create<BooksStoreState>()(
  persist(
    (set, get) => ({
      progressByPath: {},
      highlightsByPath: {},
      bookmarksByPath: {},
      settings: { ...DEFAULT_BOOKS_SETTINGS },
      shelfView: "grid",
      lastOpenedPath: null,
      openPath: null,
      pinnedTop: [],
      pinnedBottom: [],
      setProgress: (path, progress) =>
        set((state) => ({
          progressByPath: { ...state.progressByPath, [path]: progress },
        })),
      getProgress: (path) => get().progressByPath[path],
      clearProgress: (path) =>
        set((state) => {
          if (!(path in state.progressByPath)) return state;
          const next = { ...state.progressByPath };
          delete next[path];
          return { progressByPath: next };
        }),
      removeBook: (path) =>
        set((state) => {
          const hadProgress = path in state.progressByPath;
          const hadHighlights = path in state.highlightsByPath;
          const hadBookmarks = path in state.bookmarksByPath;
          const inTop = state.pinnedTop.includes(path);
          const inBottom = state.pinnedBottom.includes(path);
          const wasLastOpened = state.lastOpenedPath === path;
          const wasOpen = state.openPath === path;
          if (
            !hadProgress &&
            !hadHighlights &&
            !hadBookmarks &&
            !inTop &&
            !inBottom &&
            !wasLastOpened &&
            !wasOpen
          ) {
            return state;
          }
          let progressByPath = state.progressByPath;
          if (hadProgress) {
            progressByPath = { ...state.progressByPath };
            delete progressByPath[path];
          }
          let highlightsByPath = state.highlightsByPath;
          if (hadHighlights) {
            highlightsByPath = { ...state.highlightsByPath };
            delete highlightsByPath[path];
          }
          let bookmarksByPath = state.bookmarksByPath;
          if (hadBookmarks) {
            bookmarksByPath = { ...state.bookmarksByPath };
            delete bookmarksByPath[path];
          }
          return {
            progressByPath,
            highlightsByPath,
            bookmarksByPath,
            pinnedTop: inTop ? without(state.pinnedTop, path) : state.pinnedTop,
            pinnedBottom: inBottom
              ? without(state.pinnedBottom, path)
              : state.pinnedBottom,
            lastOpenedPath: wasLastOpened ? null : state.lastOpenedPath,
            openPath: wasOpen ? null : state.openPath,
          };
        }),
      addHighlight: (path, highlight) =>
        set((state) => ({
          highlightsByPath: {
            ...state.highlightsByPath,
            [path]: [
              ...(state.highlightsByPath[path] ?? []).filter(
                (h) => h.id !== highlight.id
              ),
              highlight,
            ],
          },
        })),
      setHighlightColor: (path, id, color) =>
        set((state) => {
          const list = state.highlightsByPath[path];
          if (!list?.some((h) => h.id === id)) return state;
          return {
            highlightsByPath: {
              ...state.highlightsByPath,
              [path]: list.map((h) => (h.id === id ? { ...h, color } : h)),
            },
          };
        }),
      removeHighlight: (path, id) =>
        set((state) => {
          const list = state.highlightsByPath[path];
          if (!list?.some((h) => h.id === id)) return state;
          const next = list.filter((h) => h.id !== id);
          const highlightsByPath = { ...state.highlightsByPath };
          if (next.length > 0) {
            highlightsByPath[path] = next;
          } else {
            delete highlightsByPath[path];
          }
          return { highlightsByPath };
        }),
      addBookmark: (path, bookmark) =>
        set((state) => ({
          bookmarksByPath: {
            ...state.bookmarksByPath,
            [path]: [
              ...(state.bookmarksByPath[path] ?? []).filter(
                (b) => b.cfi !== bookmark.cfi
              ),
              bookmark,
            ],
          },
        })),
      removeBookmark: (path, cfi) =>
        set((state) => {
          const list = state.bookmarksByPath[path];
          if (!list?.some((b) => b.cfi === cfi)) return state;
          const next = list.filter((b) => b.cfi !== cfi);
          const bookmarksByPath = { ...state.bookmarksByPath };
          if (next.length > 0) {
            bookmarksByPath[path] = next;
          } else {
            delete bookmarksByPath[path];
          }
          return { bookmarksByPath };
        }),
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      setShelfView: (view) => set({ shelfView: view }),
      setLastOpenedPath: (path) => set({ lastOpenedPath: path }),
      setOpenPath: (path) => set({ openPath: path }),
      renameProgressPath: (oldPath, newPath) =>
        set((state) => {
          const existing = state.progressByPath[oldPath];
          const existingHighlights = state.highlightsByPath[oldPath];
          const existingBookmarks = state.bookmarksByPath[oldPath];
          const inTop = state.pinnedTop.includes(oldPath);
          const inBottom = state.pinnedBottom.includes(oldPath);
          const wasLastOpened = state.lastOpenedPath === oldPath;
          const wasOpen = state.openPath === oldPath;
          if (
            !existing &&
            !existingHighlights &&
            !existingBookmarks &&
            !inTop &&
            !inBottom &&
            !wasLastOpened &&
            !wasOpen
          ) {
            return state;
          }
          const next = { ...state.progressByPath };
          if (existing) {
            delete next[oldPath];
            next[newPath] = existing;
          }
          let highlightsByPath = state.highlightsByPath;
          if (existingHighlights) {
            highlightsByPath = { ...state.highlightsByPath };
            delete highlightsByPath[oldPath];
            highlightsByPath[newPath] = existingHighlights;
          }
          let bookmarksByPath = state.bookmarksByPath;
          if (existingBookmarks) {
            bookmarksByPath = { ...state.bookmarksByPath };
            delete bookmarksByPath[oldPath];
            bookmarksByPath[newPath] = existingBookmarks;
          }
          return {
            progressByPath: next,
            highlightsByPath,
            bookmarksByPath,
            pinnedTop: inTop
              ? state.pinnedTop.map((p) => (p === oldPath ? newPath : p))
              : state.pinnedTop,
            pinnedBottom: inBottom
              ? state.pinnedBottom.map((p) => (p === oldPath ? newPath : p))
              : state.pinnedBottom,
            lastOpenedPath: wasLastOpened ? newPath : state.lastOpenedPath,
            openPath: wasOpen ? newPath : state.openPath,
          };
        }),
      moveBookToTop: (path) =>
        set((state) => ({
          pinnedTop: [path, ...without(state.pinnedTop, path)],
          pinnedBottom: without(state.pinnedBottom, path),
        })),
      moveBookToBottom: (path) =>
        set((state) => ({
          pinnedTop: without(state.pinnedTop, path),
          pinnedBottom: [...without(state.pinnedBottom, path), path],
        })),
    }),
    {
      name: "ryos:books",
      storage: createJSONStorage(() => localStorage),
      // v5+: backfill `settings.speechRate` (added in v4 without a version
      // bump, so persisted settings were missing it after the shallow merge).
      // v6: raised line-height floor.
      // v7: backfill custom theme fields (customThemeBackground / -Text /
      // -Transparent) via the DEFAULT_BOOKS_SETTINGS spread below.
      // v8: device-local `openPath` for reader/shelf session restore.
      // v9: device-local `highlightsByPath` / `bookmarksByPath` annotations.
      version: 9,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<BooksStoreState>;
        const settings = {
          ...DEFAULT_BOOKS_SETTINGS,
          ...(state.settings ?? {}),
        };
        // v6 raised the line-height floor from 1.1 to 1.5.
        settings.lineHeight = clampBooksLineHeight(settings.lineHeight);
        return {
          ...state,
          settings,
          openPath:
            typeof state.openPath === "string" ? state.openPath : null,
          highlightsByPath: state.highlightsByPath ?? {},
          bookmarksByPath: state.bookmarksByPath ?? {},
        } as BooksStoreState;
      },
      partialize: (state) => ({
        progressByPath: state.progressByPath,
        highlightsByPath: state.highlightsByPath,
        bookmarksByPath: state.bookmarksByPath,
        settings: state.settings,
        shelfView: state.shelfView,
        lastOpenedPath: state.lastOpenedPath,
        openPath: state.openPath,
        pinnedTop: state.pinnedTop,
        pinnedBottom: state.pinnedBottom,
      }),
    }
  )
);
