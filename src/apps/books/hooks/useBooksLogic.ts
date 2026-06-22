import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useFilesStore } from "@/stores/useFilesStore";
import { useAppStore } from "@/stores/useAppStore";
import { useBooksStore } from "@/stores/useBooksStore";
import { useVfsFileOperations } from "@/services/vfs/useVfsFileOperations";
import { openNativeFile } from "@/utils/nativeFileDialogs";
import { emitFileSaved, onFileRenamed } from "@/utils/appEventBus";
import { helpItems } from "../metadata";
import { useBookCover } from "../utils/useBookCover";
import type { BooksInitialData } from "@/apps/base/types";

const BOOKS_PATH = "/Books";

/**
 * Whether a path is a top-level `.epub` directly under /Books — the same shape
 * the `library` memo considers a book (no nested sub-folders).
 */
function isBooksEpubPath(path: string): boolean {
  const prefix = `${BOOKS_PATH}/`;
  if (!path.startsWith(prefix)) return false;
  if (path.slice(prefix.length).includes("/")) return false;
  return path.toLowerCase().endsWith(".epub");
}

export interface BooksLibraryEntry {
  path: string;
  /** Display name (file name without the .epub extension). */
  name: string;
  fileName: string;
  modifiedAt?: number;
}

/**
 * Page-space rect of the cover that was clicked on the shelf. Used to drive the
 * "zoom into the cover" open transition from the exact book that was tapped.
 */
export interface BookOriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UseBooksLogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
  instanceId: string;
  initialData?: BooksInitialData;
}

export function useBooksLogic({
  isWindowOpen,
  instanceId,
  initialData,
}: UseBooksLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("books", helpItems);
  const themeFlags = useThemeFlags();
  const { isWindowsTheme, isMacOSTheme, isDarkMode } = themeFlags;

  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();

  const [activeBookPath, setActiveBookPath] = useState<string | null>(null);
  // Origin rect of the clicked cover, captured at open time so the reader can
  // zoom in smoothly from the exact book on the shelf.
  const [openOriginRect, setOpenOriginRect] = useState<BookOriginRect | null>(
    null
  );
  // Book currently playing the closing (full-bleed -> shelf) zoom. Set on
  // closeBook so a transient overlay can render above the shelf after the
  // reader unmounts, then cleared when the zoom finishes.
  const [closingBook, setClosingBook] = useState<BooksLibraryEntry | null>(
    null
  );

  const items = useFilesStore((s) => s.items);
  const clearInstanceInitialData = useAppStore(
    (s) => s.clearInstanceInitialData
  );

  const settings = useBooksStore((s) => s.settings);
  const updateSettings = useBooksStore((s) => s.updateSettings);
  const shelfView = useBooksStore((s) => s.shelfView);
  const setShelfView = useBooksStore((s) => s.setShelfView);
  const progressByPath = useBooksStore((s) => s.progressByPath);
  const setLastOpenedPath = useBooksStore((s) => s.setLastOpenedPath);
  const setProgressAction = useBooksStore((s) => s.setProgress);
  const renameProgressPath = useBooksStore((s) => s.renameProgressPath);
  const pinnedTop = useBooksStore((s) => s.pinnedTop);
  const pinnedBottom = useBooksStore((s) => s.pinnedBottom);
  const moveBookToTop = useBooksStore((s) => s.moveBookToTop);
  const moveBookToBottom = useBooksStore((s) => s.moveBookToBottom);

  const saveProgress = useCallback(
    (path: string, cfi: string, percentage: number) => {
      setProgressAction(path, { cfi, percentage, updatedAt: Date.now() });
    },
    [setProgressAction]
  );

  const { saveFile, moveToTrash } = useVfsFileOperations(BOOKS_PATH);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const library = useMemo<BooksLibraryEntry[]>(() => {
    const prefix = `${BOOKS_PATH}/`;
    const entries = Object.values(items)
      .filter((item) => {
        if (item.isDirectory) return false;
        if (item.status !== "active") return false;
        if (!item.path.startsWith(prefix)) return false;
        // Exclude items nested in sub-folders of /Books.
        if (item.path.slice(prefix.length).includes("/")) return false;
        return item.name.toLowerCase().endsWith(".epub");
      })
      .map((item) => ({
        path: item.path,
        fileName: item.name,
        name: item.name.replace(/\.epub$/i, ""),
        modifiedAt: item.modifiedAt,
      }));

    // Pinned-top books come first (in pin order), pinned-bottom last (in pin
    // order), and everything else in the middle sorted by recency. This lets
    // "Move to Top/Bottom" hold regardless of import dates.
    const topRank = new Map(pinnedTop.map((p, i) => [p, i]));
    const bottomRank = new Map(pinnedBottom.map((p, i) => [p, i]));
    const groupOf = (path: string) =>
      topRank.has(path) ? 0 : bottomRank.has(path) ? 2 : 1;

    return entries.sort((a, b) => {
      const ga = groupOf(a.path);
      const gb = groupOf(b.path);
      if (ga !== gb) return ga - gb;
      if (ga === 0) return topRank.get(a.path)! - topRank.get(b.path)!;
      if (ga === 2) return bottomRank.get(a.path)! - bottomRank.get(b.path)!;
      return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
    });
  }, [items, pinnedTop, pinnedBottom]);

  // Always-current active book, so closeBook can capture it without taking a
  // dependency on the (later-declared) memoized value.
  const activeBookRef = useRef<BooksLibraryEntry | null>(null);
  // Current active path + the path most recently dropped involuntarily (file
  // vanished), so the rename listener can follow a book that was being read.
  const activeBookPathRef = useRef<string | null>(null);
  activeBookPathRef.current = activeBookPath;
  const recentlyDroppedRef = useRef<{ path: string; at: number } | null>(null);

  const openBook = useCallback(
    (path: string, originRect?: BookOriginRect | null) => {
      // Cancel any in-flight closing zoom (rapid close -> open).
      setClosingBook(null);
      setOpenOriginRect(originRect ?? null);
      setActiveBookPath(path);
      setLastOpenedPath(path);
    },
    [setLastOpenedPath]
  );

  const closeBook = useCallback(() => {
    const current = activeBookRef.current;
    setActiveBookPath(null);
    setOpenOriginRect(null);
    // Hand the book off to the closing-zoom overlay (cleared when it finishes).
    setClosingBook(current);
  }, []);

  const finishClosing = useCallback(() => {
    setClosingBook(null);
  }, []);

  // Move the book to Trash (same mechanism as Finder — marks the VFS item
  // "trashed"). If it's the open book, the drop-to-shelf effect handles it.
  const deleteBook = useCallback(
    (entry: BooksLibraryEntry) => {
      try {
        moveToTrash({
          path: entry.path,
          name: entry.fileName,
        } as Parameters<typeof moveToTrash>[0]);
        toast.success(t("apps.books.toasts.deleted"), {
          description: entry.fileName,
        });
      } catch (err) {
        console.error("[Books] Failed to delete book:", err);
        toast.error(t("apps.books.toasts.deleteFailed"));
      }
    },
    [moveToTrash, t]
  );

  // Handle being launched / re-targeted with a specific book path.
  useEffect(() => {
    if (!isWindowOpen) return;
    if (initialData?.path) {
      openBook(initialData.path);
      clearInstanceInitialData(instanceId);
    }
  }, [isWindowOpen, initialData, instanceId, openBook, clearInstanceInitialData]);

  const importEpubFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".epub")) {
        toast.error(t("apps.books.toasts.invalidFile"), {
          description: t("apps.books.toasts.invalidFileDesc"),
        });
        return;
      }
      try {
        const path = `${BOOKS_PATH}/${file.name}`;
        // Persist the raw bytes as a fresh Blob. Storing the File reference
        // from the picker directly can make IndexedDB reads fail later with
        // "Internal error" once the OS-file backing is gone.
        const bytes = await file.arrayBuffer();
        const blob = new Blob([bytes], { type: "application/epub+zip" });
        await saveFile({
          name: file.name,
          path,
          content: blob,
          type: "epub",
        });
        emitFileSaved({ name: file.name, path });
        toast.success(t("apps.books.toasts.imported"), {
          description: file.name,
        });
      } catch (err) {
        console.error("[Books] Failed to import EPUB:", err);
        toast.error(t("apps.books.toasts.importFailed"));
      }
    },
    [saveFile, t]
  );

  const handleImport = useCallback(async () => {
    const file = await openNativeFile({
      title: t("apps.books.import.title"),
      filters: [{ name: "EPUB", extensions: ["epub"] }],
    });
    if (file) {
      await importEpubFile(file);
      return;
    }
    fileInputRef.current?.click();
  }, [importEpubFile, t]);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        await importEpubFile(file);
      }
      event.target.value = "";
    },
    [importEpubFile]
  );

  const activeBook = useMemo(
    () => library.find((b) => b.path === activeBookPath) ?? null,
    [library, activeBookPath]
  );
  activeBookRef.current = activeBook;

  // Resolve the active book's metadata title for the window titlebar. Called
  // unconditionally with a safe empty fallback (the hook no-ops on ""), and the
  // cover cache dedupes against the reader/shelf loads — no extra EPUB parse.
  const { info: activeBookInfo } = useBookCover(
    activeBook?.path ?? "",
    activeBook?.modifiedAt
  );
  const activeBookTitle =
    activeBookInfo?.title || activeBook?.name || null;

  // If the active book is no longer a valid ACTIVE file, drop back to the shelf.
  // Covers hard delete (missing from items), move-to-Trash and move-away (item
  // present but status !== "active", or path no longer under /Books) — all of
  // which the `library` memo already excludes, leaving a null activeBook while
  // viewMode would otherwise stay "reader".
  useEffect(() => {
    if (!activeBookPath) return;
    const item = items[activeBookPath];
    if (!item || item.status !== "active") {
      recentlyDroppedRef.current = { path: activeBookPath, at: Date.now() };
      setActiveBookPath(null);
      setOpenOriginRect(null);
    }
  }, [activeBookPath, items]);

  // Migrate cached reading progress when an EPUB under /Books is renamed (the
  // VFS rename emits `fileRenamed`; moves don't emit it, so only renames are
  // covered). If the renamed book is the one currently being read — or one that
  // was just dropped by the effect above because its old path vanished — follow
  // it to the new path so the open reader keeps working.
  useEffect(() => {
    return onFileRenamed((event) => {
      const { oldPath, newPath } = event.detail;
      if (!isBooksEpubPath(oldPath)) return;
      renameProgressPath(oldPath, newPath);
      if (useBooksStore.getState().lastOpenedPath === oldPath) {
        setLastOpenedPath(newPath);
      }
      const wasActive = activeBookPathRef.current === oldPath;
      const dropped = recentlyDroppedRef.current;
      const wasJustReading =
        !!dropped && dropped.path === oldPath && Date.now() - dropped.at < 3000;
      if ((wasActive || wasJustReading) && isBooksEpubPath(newPath)) {
        recentlyDroppedRef.current = null;
        setActiveBookPath(newPath);
        setLastOpenedPath(newPath);
      }
    });
  }, [renameProgressPath, setLastOpenedPath]);

  const viewMode: "shelf" | "reader" = activeBookPath ? "reader" : "shelf";

  return {
    t,
    translatedHelpItems,
    themeFlags,
    isWindowsTheme,
    isMacOSTheme,
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    library,
    viewMode,
    activeBook,
    activeBookTitle,
    activeBookPath,
    openOriginRect,
    closingBook,
    openBook,
    closeBook,
    finishClosing,
    deleteBook,
    moveBookToTop,
    moveBookToBottom,
    settings,
    updateSettings,
    shelfView,
    setShelfView,
    progressByPath,
    saveProgress,
    handleImport,
    fileInputRef,
    handleFileInputChange,
  };
}

export type BooksController = ReturnType<typeof useBooksLogic>;
