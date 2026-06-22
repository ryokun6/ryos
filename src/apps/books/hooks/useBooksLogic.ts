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
import { emitFileSaved } from "@/utils/appEventBus";
import { helpItems } from "../metadata";
import type { BooksInitialData } from "@/apps/base/types";

const BOOKS_PATH = "/Books";

export interface BooksLibraryEntry {
  path: string;
  /** Display name (file name without the .epub extension). */
  name: string;
  fileName: string;
  modifiedAt?: number;
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

  const saveProgress = useCallback(
    (path: string, cfi: string, percentage: number) => {
      setProgressAction(path, { cfi, percentage, updatedAt: Date.now() });
    },
    [setProgressAction]
  );

  const { saveFile } = useVfsFileOperations(BOOKS_PATH);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const library = useMemo<BooksLibraryEntry[]>(() => {
    const prefix = `${BOOKS_PATH}/`;
    return Object.values(items)
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
      }))
      .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
  }, [items]);

  const openBook = useCallback(
    (path: string) => {
      setActiveBookPath(path);
      setLastOpenedPath(path);
    },
    [setLastOpenedPath]
  );

  const closeBook = useCallback(() => {
    setActiveBookPath(null);
  }, []);

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

  // If the active book disappears (deleted/trashed), drop back to the shelf.
  useEffect(() => {
    if (activeBookPath && !items[activeBookPath]) {
      setActiveBookPath(null);
    }
  }, [activeBookPath, items]);

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
    activeBookPath,
    openBook,
    closeBook,
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
