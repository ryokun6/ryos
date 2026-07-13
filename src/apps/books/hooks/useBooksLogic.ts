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
import { usePersistHydrated } from "@/hooks/usePersistHydrated";
import { useFilesStore } from "@/stores/useFilesStore";
import { useAppStore } from "@/stores/useAppStore";
import { useBooksStore } from "@/stores/useBooksStore";
import { useVfsFileOperations } from "@/services/vfs/useVfsFileOperations";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";
import { openNativeFile } from "@/utils/nativeFileDialogs";
import { emitFileSaved, onFileRenamed } from "@/utils/appEventBus";
import {
  filenameMd5FromPath,
  partialMd5Hex,
} from "@/shared/kosync/md5";
import { helpItems } from "../metadata";
import { useBookCover } from "../utils/useBookCover";
import type {
  BookBookmark,
  BookHighlight,
  BooksHighlightColor,
} from "@/stores/useBooksStore";
import type { BooksInitialData } from "@/apps/base/types";

const BOOKS_PATH = "/Books";

const EMPTY_HIGHLIGHTS: BookHighlight[] = [];
const EMPTY_BOOKMARKS: BookBookmark[] = [];

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
  const hasFilesHydrated = usePersistHydrated(useFilesStore.persist);
  const hasBooksHydrated = usePersistHydrated(useBooksStore.persist);
  const clearInstanceInitialData = useAppStore(
    (s) => s.clearInstanceInitialData
  );

  const settings = useBooksStore((s) => s.settings);
  const updateSettings = useBooksStore((s) => s.updateSettings);
  const shelfView = useBooksStore((s) => s.shelfView);
  const setShelfView = useBooksStore((s) => s.setShelfView);
  const progressByPath = useBooksStore((s) => s.progressByPath);
  const setLastOpenedPath = useBooksStore((s) => s.setLastOpenedPath);
  const setOpenPath = useBooksStore((s) => s.setOpenPath);
  const setProgressAction = useBooksStore((s) => s.setProgress);
  const setDocMapAction = useBooksStore((s) => s.setDocMap);
  const renameProgressPath = useBooksStore((s) => s.renameProgressPath);
  const pinnedTop = useBooksStore((s) => s.pinnedTop);
  const pinnedBottom = useBooksStore((s) => s.pinnedBottom);
  const moveBookToTop = useBooksStore((s) => s.moveBookToTop);
  const moveBookToBottom = useBooksStore((s) => s.moveBookToBottom);
  const removeBook = useBooksStore((s) => s.removeBook);
  const highlightsByPath = useBooksStore((s) => s.highlightsByPath);
  const bookmarksByPath = useBooksStore((s) => s.bookmarksByPath);
  const addHighlightAction = useBooksStore((s) => s.addHighlight);
  const setHighlightColorAction = useBooksStore((s) => s.setHighlightColor);
  const removeHighlightAction = useBooksStore((s) => s.removeHighlight);
  const addBookmarkAction = useBooksStore((s) => s.addBookmark);
  const removeBookmarkAction = useBooksStore((s) => s.removeBookmark);

  const saveProgress = useCallback(
    (path: string, cfi: string, percentage: number) => {
      setProgressAction(path, { cfi, percentage, updatedAt: Date.now() });
    },
    [setProgressAction]
  );

  // Keep KOReader document-id maps in sync so kosync can match books by
  // filename MD5 (and partial content MD5 when bytes are available).
  useEffect(() => {
    if (!hasBooksHydrated) return;
    let cancelled = false;
    const libraryPaths = library.map((entry) => entry.path);

    const ensureFilenameMaps = () => {
      const currentMaps = useBooksStore.getState().docMapByPath;
      for (const path of libraryPaths) {
        const filenameMd5 = filenameMd5FromPath(path);
        const existing = currentMaps[path];
        if (!existing || existing.filenameMd5 !== filenameMd5) {
          setDocMapAction(path, {
            filenameMd5,
            partialMd5: existing?.partialMd5,
          });
        }
      }
    };
    ensureFilenameMaps();

    const fillPartialMaps = async () => {
      for (const path of libraryPaths) {
        if (cancelled) return;
        const existing = useBooksStore.getState().docMapByPath[path];
        if (existing?.partialMd5) continue;
        try {
          const blob = await readBookBlobContent(path);
          if (!blob || cancelled) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (cancelled || bytes.length === 0) continue;
          const partialMd5 = partialMd5Hex(bytes);
          const latest = useBooksStore.getState().docMapByPath[path];
          setDocMapAction(path, {
            filenameMd5: latest?.filenameMd5 ?? filenameMd5FromPath(path),
            partialMd5,
          });
        } catch {
          // Best-effort: filename matching still works without partial MD5.
        }
      }
    };

    const idle =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback(() => {
            void fillPartialMaps();
          })
        : window.setTimeout(() => {
            void fillPartialMaps();
          }, 750);

    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idle as number);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [library, hasBooksHydrated, setDocMapAction]);

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

  // Annotations for the active book, with actions pre-bound to its path.
  const activeBookHighlights = activeBookPath
    ? highlightsByPath[activeBookPath] ?? EMPTY_HIGHLIGHTS
    : EMPTY_HIGHLIGHTS;
  const activeBookBookmarks = activeBookPath
    ? bookmarksByPath[activeBookPath] ?? EMPTY_BOOKMARKS
    : EMPTY_BOOKMARKS;
  const addHighlight = useCallback(
    (highlight: BookHighlight) => {
      const path = activeBookPathRef.current;
      if (path) addHighlightAction(path, highlight);
    },
    [addHighlightAction]
  );
  const setHighlightColor = useCallback(
    (id: string, color: BooksHighlightColor) => {
      const path = activeBookPathRef.current;
      if (path) setHighlightColorAction(path, id, color);
    },
    [setHighlightColorAction]
  );
  const removeHighlight = useCallback(
    (id: string) => {
      const path = activeBookPathRef.current;
      if (path) removeHighlightAction(path, id);
    },
    [removeHighlightAction]
  );
  const addBookmark = useCallback(
    (bookmark: BookBookmark) => {
      const path = activeBookPathRef.current;
      if (path) addBookmarkAction(path, bookmark);
    },
    [addBookmarkAction]
  );
  const removeBookmark = useCallback(
    (cfi: string) => {
      const path = activeBookPathRef.current;
      if (path) removeBookmarkAction(path, cfi);
    },
    [removeBookmarkAction]
  );
  // Deferred openPath clear after an involuntary drop, kept outside the drop
  // effect's cleanup so setting activeBookPath to null doesn't cancel it.
  const clearOpenPathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const openBook = useCallback(
    (path: string, originRect?: BookOriginRect | null) => {
      // Cancel any in-flight closing zoom (rapid close -> open).
      setClosingBook(null);
      setOpenOriginRect(originRect ?? null);
      setActiveBookPath(path);
      setLastOpenedPath(path);
      // Persist the in-reader session so reopening Books restores this book
      // (and its CFI via progressByPath) instead of always landing on the shelf.
      setOpenPath(path);
    },
    [setLastOpenedPath, setOpenPath]
  );

  const closeBook = useCallback(() => {
    const current = activeBookRef.current;
    setActiveBookPath(null);
    setOpenOriginRect(null);
    // Returning to the shelf clears the session book so app reopen stays on
    // the shelf rather than auto-resuming the last reader.
    setOpenPath(null);
    // Hand the book off to the closing-zoom overlay (cleared when it finishes).
    setClosingBook(current);
  }, [setOpenPath]);

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
        // Forget the book's synced reading state (progress, shelf ordering,
        // last-opened) so the bookshelf codec stops emitting stale docs for
        // a book that no longer exists; the engine tombstones the dropped
        // progress key across devices via its shadow diff. Only done on an
        // explicit delete — the drop-to-shelf effect also fires for renames
        // and moves (handled by renameProgressPath), where state must be kept.
        removeBook(entry.path);
        toast.success(t("apps.books.toasts.deleted"), {
          description: entry.fileName,
        });
      } catch (err) {
        console.error("[Books] Failed to delete book:", err);
        toast.error(t("apps.books.toasts.deleteFailed"));
      }
    },
    [moveToTrash, removeBook, t]
  );

  // Explicit launch / re-target (Finder, open-with) always wins over session restore.
  useEffect(() => {
    if (!isWindowOpen) return;
    if (!initialData?.path) return;
    openBook(initialData.path);
    clearInstanceInitialData(instanceId);
  }, [isWindowOpen, initialData, instanceId, openBook, clearInstanceInitialData]);

  // Restore the prior reader/shelf session once stores have hydrated. Null
  // openPath means the shelf; a path resumes that book at its saved CFI.
  const didRestoreSessionRef = useRef(false);
  useEffect(() => {
    if (!isWindowOpen) return;
    if (!hasBooksHydrated || !hasFilesHydrated) return;
    if (didRestoreSessionRef.current) return;
    // A launch path is being applied by the effect above; skip session resume.
    if (initialData?.path) {
      didRestoreSessionRef.current = true;
      return;
    }
    didRestoreSessionRef.current = true;

    const path = useBooksStore.getState().openPath;
    if (!path) return;

    const item = items[path];
    if (!item || item.status !== "active" || !isBooksEpubPath(path)) {
      // Book is gone — fall back to the shelf and forget the stale session.
      setOpenPath(null);
      return;
    }

    // Resume without a shelf-zoom origin (there is no cover click to animate from).
    setActiveBookPath(path);
  }, [
    isWindowOpen,
    hasBooksHydrated,
    hasFilesHydrated,
    initialData,
    items,
    setOpenPath,
  ]);

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
  const activeBookAuthor = activeBookInfo?.author || null;

  // If the active book is no longer a valid ACTIVE file, drop back to the shelf.
  // Covers hard delete (missing from items), move-to-Trash and move-away (item
  // present but status !== "active", or path no longer under /Books) — all of
  // which the `library` memo already excludes, leaving a null activeBook while
  // viewMode would otherwise stay "reader". Wait for files hydration so a restore
  // isn't misread as a vanished book before `/Books` items are available.
  useEffect(() => {
    if (!activeBookPath) return;
    if (!hasFilesHydrated) return;
    const item = items[activeBookPath];
    if (!item || item.status !== "active") {
      const droppedPath = activeBookPath;
      recentlyDroppedRef.current = { path: droppedPath, at: Date.now() };
      setActiveBookPath(null);
      setOpenOriginRect(null);
      // Keep openPath during the rename grace window so a fileRenamed recovery
      // can still treat this as the session book; clear only once rename loses.
      if (useBooksStore.getState().openPath === droppedPath) {
        if (clearOpenPathTimerRef.current != null) {
          clearTimeout(clearOpenPathTimerRef.current);
        }
        clearOpenPathTimerRef.current = setTimeout(() => {
          clearOpenPathTimerRef.current = null;
          if (
            useBooksStore.getState().openPath === droppedPath &&
            activeBookPathRef.current !== droppedPath
          ) {
            setOpenPath(null);
          }
        }, 3000);
      }
    }
  }, [activeBookPath, items, hasFilesHydrated, setOpenPath]);

  // Migrate cached reading progress when an EPUB under /Books is renamed (the
  // VFS rename emits `fileRenamed`; moves don't emit it, so only renames are
  // covered). If the renamed book is the one currently being read — or one that
  // was just dropped by the effect above because its old path vanished — follow
  // it to the new path so the open reader keeps working.
  useEffect(() => {
    return onFileRenamed((event) => {
      const { oldPath, newPath } = event.detail;
      if (!isBooksEpubPath(oldPath)) return;
      // Updates progress, pin order, lastOpenedPath, and openPath in one write.
      renameProgressPath(oldPath, newPath);
      const wasActive = activeBookPathRef.current === oldPath;
      const dropped = recentlyDroppedRef.current;
      const wasJustReading =
        !!dropped && dropped.path === oldPath && Date.now() - dropped.at < 3000;
      if ((wasActive || wasJustReading) && isBooksEpubPath(newPath)) {
        recentlyDroppedRef.current = null;
        if (clearOpenPathTimerRef.current != null) {
          clearTimeout(clearOpenPathTimerRef.current);
          clearOpenPathTimerRef.current = null;
        }
        setActiveBookPath(newPath);
        setLastOpenedPath(newPath);
        setOpenPath(newPath);
      }
    });
  }, [renameProgressPath, setLastOpenedPath, setOpenPath]);

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
    activeBookAuthor,
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
    activeBookHighlights,
    activeBookBookmarks,
    addHighlight,
    setHighlightColor,
    removeHighlight,
    addBookmark,
    removeBookmark,
    handleImport,
    fileInputRef,
    handleFileInputChange,
  };
}

export type BooksController = ReturnType<typeof useBooksLogic>;
