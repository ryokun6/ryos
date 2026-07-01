import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/config/appRegistry";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { readContentForPath } from "@/services/vfs/FileContentRepository";
import { useVfsFileOperations } from "@/services/vfs/useVfsFileOperations";
import { useAppStore } from "@/stores/useAppStore";
import { emitFileSaved } from "@/utils/appEventBus";
import {
  getFileExtension,
  getOpenWithApps,
  resolvePreviewKind,
  type PreviewKind,
} from "@/utils/fileAssociations";
import {
  openNativeFile,
  saveBlobToDevice,
} from "@/utils/nativeFileDialogs";
import type { PreviewInitialData } from "..";
import { helpItems } from "../metadata";

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

function blobFromArrayBuffer(path: string, content: ArrayBuffer): Blob {
  const extension = getFileExtension(path);
  const type =
    extension === "pdf"
      ? "application/pdf"
      : IMAGE_MIME_TYPES[extension] || "application/octet-stream";
  return new Blob([content], { type });
}

function formatTextPreview(path: string, content: string): string {
  if (getFileExtension(path) !== "json") return content;
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

interface UsePreviewLogicOptions {
  initialData?: PreviewInitialData;
  instanceId: string;
  isWindowOpen: boolean;
}

export function usePreviewLogic({
  initialData,
  instanceId,
  isWindowOpen,
}: UsePreviewLogicOptions) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("preview", helpItems);
  const { isWindowsTheme, isMacOSTheme, isAquaGlass } = useThemeFlags();
  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const launchApp = useLaunchApp();
  const { saveFile } = useVfsFileOperations("/");
  const updateInstanceInitialData = useAppStore(
    (state) => state.updateInstanceInitialData,
  );

  const [currentPath, setCurrentPath] = useState("");
  const [content, setContent] = useState<string | Blob | null>(null);
  const [kind, setKind] = useState<PreviewKind>("unsupported");
  const [objectUrl, setObjectUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitToWindow, setFitToWindow] = useState(true);
  const [isSaveAsDialogOpen, setIsSaveAsDialogOpen] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedPathRef = useRef("");

  const loadPreview = useCallback(
    async (
      path: string,
      suppliedContent?: string | Blob | ArrayBuffer,
      rememberPath = true,
    ): Promise<void> => {
      setIsLoading(true);
      setError(null);
      setZoom(100);
      setFitToWindow(true);

      try {
        let nextContent = suppliedContent;
        if (nextContent === undefined) {
          const stored = await readContentForPath(path);
          nextContent = stored?.content;
        }
        if (nextContent instanceof ArrayBuffer) {
          nextContent = blobFromArrayBuffer(path, nextContent);
        }
        if (nextContent === undefined) {
          throw new Error(t("apps.preview.status.notFound"));
        }

        const nextKind = resolvePreviewKind(path, nextContent);
        if (
          nextContent instanceof Blob &&
          (nextKind === "html" ||
            nextKind === "markdown" ||
            nextKind === "text")
        ) {
          nextContent = await nextContent.text();
        }

        setCurrentPath(path);
        setKind(nextKind);
        setContent(nextContent);
        loadedPathRef.current = path;
        if (rememberPath) {
          updateInstanceInitialData(instanceId, { path });
        }
      } catch (loadError) {
        console.error("[Preview] Failed to load file:", loadError);
        setCurrentPath(path);
        setContent(null);
        setKind("unsupported");
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("apps.preview.status.loadFailed"),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [instanceId, t, updateInstanceInitialData],
  );

  useEffect(() => {
    if (!isWindowOpen || (!initialData?.path && !initialData?.content)) return;
    const path = initialData.path || t("apps.preview.untitled");
    if (initialData.content === undefined && loadedPathRef.current === path) {
      return;
    }
    void loadPreview(path, initialData.content, Boolean(initialData.path));
  }, [
    initialData,
    isWindowOpen,
    loadPreview,
    t,
  ]);

  useEffect(() => {
    if (!(content instanceof Blob) || (kind !== "image" && kind !== "pdf")) {
      setObjectUrl("");
      return;
    }

    const url = URL.createObjectURL(content);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content, kind]);

  const importFile = useCallback(
    async (file: File) => {
      const importedKind = resolvePreviewKind(file.name, file);
      if (importedKind === "unsupported") {
        toast.error(t("apps.preview.status.unsupported"));
        return;
      }

      try {
        const importedContent =
          importedKind === "image" || importedKind === "pdf"
            ? new Blob([await file.arrayBuffer()], {
                type: file.type || undefined,
              })
            : await file.text();
        const directory = importedKind === "image" ? "/Images" : "/Documents";
        const path = `${directory}/${file.name}`;

        await saveFile({
          name: file.name,
          path,
          content: importedContent,
          type: getFileExtension(file.name),
        });
        emitFileSaved({ name: file.name, path, content: importedContent });
        await loadPreview(path, importedContent);
        toast.success(t("apps.preview.toasts.imported"), {
          description: file.name,
        });
      } catch (importError) {
        console.error("[Preview] Failed to import file:", importError);
        toast.error(t("apps.preview.toasts.importFailed"));
      }
    },
    [loadPreview, saveFile, t],
  );

  const handleOpen = useCallback(() => {
    launchApp("finder", { initialPath: "/" });
  }, [launchApp]);

  const handleImport = useCallback(async () => {
    const nativeFile = await openNativeFile({
      title: t("apps.preview.menu.importFromDevice"),
      filters: [
        {
          name: t("apps.preview.supportedFiles"),
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "svg",
            "pdf",
            "html",
            "htm",
            "txt",
            "md",
            "json",
            "csv",
            "xml",
          ],
        },
      ],
    });
    if (nativeFile) {
      await importFile(nativeFile);
      return;
    }
    fileInputRef.current?.click();
  }, [importFile, t]);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void importFile(file);
      event.target.value = "";
    },
    [importFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) void importFile(file);
    },
    [importFile],
  );

  const handleSaveAs = useCallback(() => {
    if (content === null) return;
    const currentName =
      currentPath.split("/").filter(Boolean).pop() || t("apps.preview.untitled");
    setSaveAsFileName(currentName);
    setIsSaveAsDialogOpen(true);
  }, [content, currentPath, t]);

  const handleSaveAsSubmit = useCallback(
    async (requestedName: string) => {
      if (content === null) return;
      const trimmedName = requestedName.trim().replace(/[\\/]/g, "-");
      if (!trimmedName) return;

      const currentExtension = getFileExtension(currentPath);
      const fileName =
        currentExtension && !getFileExtension(trimmedName)
          ? `${trimmedName}.${currentExtension}`
          : trimmedName;
      const directory = kind === "image" ? "/Images" : "/Documents";
      const path = `${directory}/${fileName}`;

      setIsSaving(true);
      try {
        await saveFile({
          name: fileName,
          path,
          content,
          type: getFileExtension(fileName),
        });
        emitFileSaved({ name: fileName, path, content });
        setCurrentPath(path);
        loadedPathRef.current = path;
        updateInstanceInitialData(instanceId, { path });
        setIsSaveAsDialogOpen(false);
        toast.success(t("apps.preview.toasts.saved"), {
          description: path,
        });
      } catch (saveError) {
        console.error("[Preview] Failed to save file:", saveError);
        toast.error(t("apps.preview.toasts.saveFailed"));
      } finally {
        setIsSaving(false);
      }
    },
    [
      content,
      currentPath,
      instanceId,
      kind,
      saveFile,
      t,
      updateInstanceInitialData,
    ],
  );

  const handleExport = useCallback(async () => {
    if (content === null) return;

    const fileName =
      currentPath.split("/").filter(Boolean).pop() || t("apps.preview.untitled");
    const extension = getFileExtension(fileName);
    const mimeType =
      kind === "html"
        ? "text/html"
        : kind === "markdown"
          ? "text/markdown"
          : kind === "text"
            ? "text/plain"
            : "application/octet-stream";
    const blob =
      content instanceof Blob ? content : new Blob([content], { type: mimeType });

    try {
      await saveBlobToDevice(blob, fileName, {
        filters: extension
          ? [{ name: extension.toUpperCase(), extensions: [extension] }]
          : undefined,
      });
    } catch (exportError) {
      console.error("[Preview] Failed to export file:", exportError);
      toast.error(t("apps.preview.toasts.exportFailed"));
    }
  }, [content, currentPath, kind, t]);

  const openWithApps = useMemo(
    () =>
      currentPath
        ? getOpenWithApps({ path: currentPath }).filter(
            (appId) => appId !== "preview",
          )
        : [],
    [currentPath],
  );

  const handleOpenWith = useCallback(
    async (appId: AppId) => {
      if (!currentPath || content === null) return;

      if (appId === "paint" && content instanceof Blob) {
        launchApp("paint", {
          initialData: { path: currentPath, content },
        });
        return;
      }

      if (appId === "textedit") {
        const text =
          typeof content === "string" ? content : await content.text();
        launchApp("textedit", {
          initialData: { path: currentPath, content: text },
        });
        return;
      }

      if (appId === "applet-viewer") {
        const text =
          typeof content === "string" ? content : await content.text();
        launchApp("applet-viewer", {
          initialData: { path: currentPath, content: text },
        });
      }
    },
    [content, currentPath, launchApp],
  );

  const displayName =
    currentPath.split("/").filter(Boolean).pop() || t("apps.preview.title");
  const displayText =
    typeof content === "string" ? formatTextPreview(currentPath, content) : "";

  return {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isAquaGlass,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    currentPath,
    displayName,
    displayText,
    kind,
    objectUrl,
    isLoading,
    error,
    zoom,
    setZoom,
    fitToWindow,
    setFitToWindow,
    isSaveAsDialogOpen,
    setIsSaveAsDialogOpen,
    saveAsFileName,
    setSaveAsFileName,
    isSaving,
    fileInputRef,
    handleOpen,
    handleImport,
    handleSaveAs,
    handleSaveAsSubmit,
    handleExport,
    handleFileInputChange,
    handleDrop,
    openWithApps,
    handleOpenWith,
  };
}
