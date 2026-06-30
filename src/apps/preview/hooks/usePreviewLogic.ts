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
import type { AppId } from "@/config/appRegistry";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { readContentForPath } from "@/services/vfs/FileContentRepository";
import { useAppStore } from "@/stores/useAppStore";
import {
  getFileExtension,
  getOpenWithApps,
  resolvePreviewKind,
  type PreviewKind,
} from "@/utils/fileAssociations";
import { openNativeFile } from "@/utils/nativeFileDialogs";
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
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const launchApp = useLaunchApp();
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData,
  );

  const [currentPath, setCurrentPath] = useState("");
  const [content, setContent] = useState<string | Blob | null>(null);
  const [kind, setKind] = useState<PreviewKind>("unsupported");
  const [objectUrl, setObjectUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitToWindow, setFitToWindow] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPreview = useCallback(
    async (
      path: string,
      suppliedContent?: string | Blob | ArrayBuffer,
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
    [t],
  );

  useEffect(() => {
    if (!isWindowOpen || (!initialData?.path && !initialData?.content)) return;
    const path = initialData.path || t("apps.preview.untitled");
    void loadPreview(path, initialData.content);
    clearInstanceInitialData(instanceId);
  }, [
    clearInstanceInitialData,
    initialData,
    instanceId,
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

  const openFile = useCallback(
    async (file: File) => {
      await loadPreview(file.name, file);
    },
    [loadPreview],
  );

  const handleOpen = useCallback(async () => {
    const nativeFile = await openNativeFile({
      title: t("apps.preview.menu.open"),
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
      await openFile(nativeFile);
      return;
    }
    fileInputRef.current?.click();
  }, [openFile, t]);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void openFile(file);
      event.target.value = "";
    },
    [openFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

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
    fileInputRef,
    handleOpen,
    handleFileInputChange,
    handleDrop,
    openWithApps,
    handleOpenWith,
  };
}
