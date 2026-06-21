import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BooksColumnMode = "auto" | "single" | "double";
export type BooksThemeOverride = "auto" | "light" | "sepia" | "dark";

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
  lastOpenedPath: string | null;
  setProgress: (path: string, progress: BookProgress) => void;
  getProgress: (path: string) => BookProgress | undefined;
  clearProgress: (path: string) => void;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  setLastOpenedPath: (path: string | null) => void;
  /** Move progress when a file is renamed/moved in the VFS. */
  renameProgressPath: (oldPath: string, newPath: string) => void;
}

export const useBooksStore = create<BooksStoreState>()(
  persist(
    (set, get) => ({
      progressByPath: {},
      settings: { ...DEFAULT_BOOKS_SETTINGS },
      lastOpenedPath: null,
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
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      setLastOpenedPath: (path) => set({ lastOpenedPath: path }),
      renameProgressPath: (oldPath, newPath) =>
        set((state) => {
          const existing = state.progressByPath[oldPath];
          if (!existing) return state;
          const next = { ...state.progressByPath };
          delete next[oldPath];
          next[newPath] = existing;
          return { progressByPath: next };
        }),
    }),
    {
      name: "ryos:books",
      version: 1,
      partialize: (state) => ({
        progressByPath: state.progressByPath,
        settings: state.settings,
        lastOpenedPath: state.lastOpenedPath,
      }),
    }
  )
);
