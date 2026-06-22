import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BooksColumnMode = "auto" | "single" | "double";
export type BooksThemeOverride = "auto" | "light" | "sepia" | "dark";
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
  /** Line height multiplier. */
  lineHeight: number;
}

export const DEFAULT_BOOKS_SETTINGS: BooksReaderSettings = {
  fontId: "original",
  fontSizePct: 100,
  columnMode: "auto",
  themeOverride: "auto",
  lineHeight: 1.5,
};

export const BOOKS_FONT_SIZE_MIN = 70;
export const BOOKS_FONT_SIZE_MAX = 180;
export const BOOKS_FONT_SIZE_STEP = 10;

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
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<BooksStoreState>;
        if (version < 2) {
          state.pinnedTop = state.pinnedTop ?? [];
          state.pinnedBottom = state.pinnedBottom ?? [];
        }
        return state as BooksStoreState;
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
