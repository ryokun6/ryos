import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type BooksColumnMode = "auto" | "single" | "double";
export type BooksThemeOverride =
  | "auto"
  | "light"
  | "paper"
  | "sepia"
  | "gray"
  | "green"
  | "dark"
  | "night"
  | "black";
export const BOOKS_THEME_OVERRIDES: readonly BooksThemeOverride[] = [
  "auto",
  "light",
  "paper",
  "sepia",
  "gray",
  "green",
  "dark",
  "night",
  "black",
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

export interface BooksReaderSettings {
  /** Font option id (see BOOK_FONTS). "original" keeps the publisher fonts. */
  fontId: string;
  /** Body font size as a percentage (100 = default). */
  fontSizePct: number;
  /** Column layout mode. "auto" follows the reader width. */
  columnMode: BooksColumnMode;
  /** Reading theme override. "auto" follows the OS dark-mode setting. */
  themeOverride: BooksThemeOverride;
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
  chineseScript: "original",
  textLayout: "book",
  lineHeight: 1.5,
  gutterPx: 24,
  speechRate: 1,
};

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
  settings: BooksReaderSettings;
  shelfView: BooksShelfView;
  lastOpenedPath: string | null;
  /** Paths explicitly pinned to the top of the shelf (first = highest). */
  pinnedTop: string[];
  /** Paths explicitly pinned to the bottom of the shelf (last = lowest). */
  pinnedBottom: string[];
  setProgress: (path: string, progress: BookProgress) => void;
  getProgress: (path: string) => BookProgress | undefined;
  clearProgress: (path: string) => void;
  /**
   * Forget all synced reading state for a removed book: progress, shelf
   * ordering, and last-opened. Used when a book is deleted so the bookshelf
   * codec stops emitting stale docs (and the engine tombstones the dropped
   * progress key cross-device via shadow diff).
   */
  removeBook: (path: string) => void;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  setShelfView: (view: BooksShelfView) => void;
  setLastOpenedPath: (path: string | null) => void;
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
      settings: { ...DEFAULT_BOOKS_SETTINGS },
      shelfView: "grid",
      lastOpenedPath: null,
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
          const inTop = state.pinnedTop.includes(path);
          const inBottom = state.pinnedBottom.includes(path);
          const wasLastOpened = state.lastOpenedPath === path;
          if (!hadProgress && !inTop && !inBottom && !wasLastOpened) {
            return state;
          }
          let progressByPath = state.progressByPath;
          if (hadProgress) {
            progressByPath = { ...state.progressByPath };
            delete progressByPath[path];
          }
          return {
            progressByPath,
            pinnedTop: inTop ? without(state.pinnedTop, path) : state.pinnedTop,
            pinnedBottom: inBottom
              ? without(state.pinnedBottom, path)
              : state.pinnedBottom,
            lastOpenedPath: wasLastOpened ? null : state.lastOpenedPath,
          };
        }),
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      setShelfView: (view) => set({ shelfView: view }),
      setLastOpenedPath: (path) => set({ lastOpenedPath: path }),
      renameProgressPath: (oldPath, newPath) =>
        set((state) => {
          const existing = state.progressByPath[oldPath];
          const inTop = state.pinnedTop.includes(oldPath);
          const inBottom = state.pinnedBottom.includes(oldPath);
          if (!existing && !inTop && !inBottom) return state;
          const next = { ...state.progressByPath };
          if (existing) {
            delete next[oldPath];
            next[newPath] = existing;
          }
          return {
            progressByPath: next,
            pinnedTop: inTop
              ? state.pinnedTop.map((p) => (p === oldPath ? newPath : p))
              : state.pinnedTop,
            pinnedBottom: inBottom
              ? state.pinnedBottom.map((p) => (p === oldPath ? newPath : p))
              : state.pinnedBottom,
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
      version: 6,
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
        } as BooksStoreState;
      },
      partialize: (state) => ({
        progressByPath: state.progressByPath,
        settings: state.settings,
        shelfView: state.shelfView,
        lastOpenedPath: state.lastOpenedPath,
        pinnedTop: state.pinnedTop,
        pinnedBottom: state.pinnedBottom,
      }),
    }
  )
);
