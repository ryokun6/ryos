import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useFileSystem, dbOperations } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { usePaintStore } from "@/stores/usePaintStore";
import type { Filter } from "../components/PaintFiltersMenu";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { helpItems } from "..";
import type { PaintInitialData } from "../../base/types";

interface PaintCanvasHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportCanvas: () => Promise<Blob>;
  importImage: (dataUrl: string) => void;
  cut: () => Promise<void>;
  copy: () => Promise<void>;
  paste: () => Promise<void>;
  applyFilter: (filter: Filter) => void;
}

export interface UsePaintLogicProps {
  initialData?: PaintInitialData;
  instanceId?: string;
}

export function usePaintLogic({ initialData, instanceId }: UsePaintLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("paint", helpItems);
  const [selectedTool, setSelectedTool] = useState<string>("pencil");
  const [selectedPattern, setSelectedPattern] = useState<string>("pattern-1");
  const [strokeWidth, setStrokeWidth] = useState<number>(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const currentFilePath = usePaintStore((state) => state.lastFilePath);
  const setLastFilePath = usePaintStore((state) => state.setLastFilePath);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(589);
  const [canvasHeight, setCanvasHeight] = useState(418);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<PaintCanvasHandle | null>(null);
  const { saveFile } = useFileSystem("/Images");
  const launchApp = useLaunchApp();
  const contentChangeTimeoutRef = useRef<number | null>(null);
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );
  const lastConsumedBlobUrl = useRef<string | null>(null);
  const [initialFileLoaded, setInitialFileLoaded] = useState(false);

  const handleToolSelect = (tool: string) => {
    if (tool === "spray" && strokeWidth < 10) {
      setStrokeWidth(10);
    } else if (tool === "brush" && strokeWidth < 4) {
      setStrokeWidth(4);
    } else if (tool === "pencil" && strokeWidth > 1) {
      setStrokeWidth(1);
    }
    setSelectedTool(tool);
  };

  const handleCanvasRef = useCallback((ref: PaintCanvasHandle | null) => {
    canvasRef.current = ref;
  }, []);

  const handleFileOpen = useCallback(
    (path: string, blobUrl: string) => {
      const img = new Image();
      img.onload = () => {
        let newWidth = img.width;
        let newHeight = img.height;
        if (newWidth > 589) {
          const ratio = 589 / newWidth;
          newWidth = 589;
          newHeight = Math.round(img.height * ratio);
        }
        setCanvasWidth(newWidth);
        setCanvasHeight(newHeight);
        setIsLoadingFile(true);
        canvasRef.current?.importImage(blobUrl);
        setLastFilePath(path);
        setHasUnsavedChanges(false);
        setIsLoadingFile(false);
        setError(null);

        console.log("[Paint] Revoking Blob URL after successful load:", blobUrl);
        URL.revokeObjectURL(blobUrl);
        if (lastConsumedBlobUrl.current === blobUrl) {
          lastConsumedBlobUrl.current = null;
        }
      };

      img.onerror = (errorEvent) => {
        console.error(
          "Error loading image for import:",
          errorEvent,
          "URL:",
          blobUrl
        );
        setError("Failed to load image content.");

        console.log("[Paint] Revoking Blob URL after load error:", blobUrl);
        URL.revokeObjectURL(blobUrl);
        if (lastConsumedBlobUrl.current === blobUrl) {
          lastConsumedBlobUrl.current = null;
        }
      };

      img.src = blobUrl;
    },
    [setLastFilePath]
  );

  useEffect(() => {
    if (initialData?.path && initialData?.content && canvasRef.current) {
      const { path, content } = initialData;
      console.log("[Paint] Loading content from initialData:", path);

      if (content instanceof Blob) {
        const blobUrl = URL.createObjectURL(content);
        console.log("[Paint] Created Blob URL from initialData:", blobUrl);

        if (lastConsumedBlobUrl.current) {
          URL.revokeObjectURL(lastConsumedBlobUrl.current);
        }
        lastConsumedBlobUrl.current = blobUrl;

        handleFileOpen(path, blobUrl);
      } else {
        console.error("[Paint] Received initialData content is not a Blob:", content);
      }
      if (instanceId) {
        clearInstanceInitialData(instanceId);
      }
    }
  }, [initialData, handleFileOpen, clearInstanceInitialData, instanceId]);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (hasUnsavedChanges && currentFilePath && !isLoadingFile) {
      const timeoutId = window.setTimeout(async () => {
        if (!canvasRef.current) return;

        try {
          const blob = await canvasRef.current.exportCanvas();
          const fileName =
            currentFilePath.split("/").pop() || `${t("apps.paint.untitled")}.png`;

          saveFile({
            name: fileName,
            path: currentFilePath,
            content: blob,
          });

          const saveEvent = new CustomEvent("saveFile", {
            detail: {
              name: fileName,
              path: currentFilePath,
              content: blob,
            },
          });
          window.dispatchEvent(saveEvent);

          setHasUnsavedChanges(false);
        } catch (err) {
          console.error("Error auto-saving file:", err);
        }
      }, 2000);

      return () => window.clearTimeout(timeoutId);
    }
  }, [hasUnsavedChanges, currentFilePath, isLoadingFile, saveFile, t]);

  const handleUndo = () => {
    canvasRef.current?.undo();
  };

  const handleRedo = () => {
    canvasRef.current?.redo();
  };

  const handleClear = () => {
    canvasRef.current?.clear();
    setLastFilePath(null);
    setHasUnsavedChanges(false);
    setCanvasWidth(589);
    setCanvasHeight(418);
  };

  const handleNewFile = () => {
    if (hasUnsavedChanges) {
      setIsConfirmNewDialogOpen(true);
      return;
    }
    handleClear();
    setLastFilePath(null);
    setHasUnsavedChanges(false);
  };

  const handleConfirmNew = useCallback(() => {
    handleClear();
    setIsConfirmNewDialogOpen(false);
  }, [handleClear]);

  const handleSave = async () => {
    if (!canvasRef.current) return;

    if (!currentFilePath) {
      // New file - prompt for filename first
      const canvasName = `${t("apps.paint.untitled")}.png`;
      setIsSaveDialogOpen(true);
      setSaveFileName(canvasName);
    } else {
      // Existing file - save directly
      try {
        const blob = await canvasRef.current.exportCanvas();
        const fileName =
          currentFilePath.split("/").pop() || `${t("apps.paint.untitled")}.png`;

        await saveFile({
          name: fileName,
          path: currentFilePath,
          content: blob,
          type: "png",
        });

        setHasUnsavedChanges(false);
        toast.success(t("apps.paint.dialogs.imageSavedSuccessfully"));
      } catch (err) {
        console.error("Error saving image:", err);
        toast.error(t("apps.paint.dialogs.failedToSaveImage"));
      }
    }
  };

  const handleSaveSubmit = async (fileName: string) => {
    if (!canvasRef.current) return;

    try {
      const blob = await canvasRef.current.exportCanvas();
      const filePath = `/Images/${fileName}${
        fileName.endsWith(".png") ? "" : ".png"
      }`;

      await saveFile({
        name: fileName,
        path: filePath,
        content: blob,
        type: "png",
      });

      const saveEvent = new CustomEvent("saveFile", {
        detail: {
          name: fileName,
          path: filePath,
          content: blob,
        },
      });
      window.dispatchEvent(saveEvent);

      setLastFilePath(filePath);
      setHasUnsavedChanges(false);
      setIsSaveDialogOpen(false);
      toast.success("Image saved successfully");
    } catch (err) {
      console.error("Error saving file:", err);
      toast.error("Failed to save image");
    }
  };

  const handleImportFile = () => {
    launchApp("finder", { initialPath: "/Images" });
  };

  const handleExportFile = async () => {
    if (!canvasRef.current) return;

    try {
      const blob = await canvasRef.current.exportCanvas();
      const blobUrl = URL.createObjectURL(blob);
      const fileName =
        currentFilePath?.split("/").pop() || `${t("apps.paint.untitled")}.png`;

      const link = document.createElement("a");
      link.download = fileName;
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (err) {
      console.error("Error exporting file:", err);
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          let newWidth = img.width;
          let newHeight = img.height;
          if (newWidth > 589) {
            const ratio = 589 / newWidth;
            newWidth = 589;
            newHeight = Math.round(img.height * ratio);
          }
          setCanvasWidth(newWidth);
          setCanvasHeight(newHeight);
          setIsLoadingFile(true);
          canvasRef.current?.importImage(dataUrl);
          setIsLoadingFile(false);
          setSaveFileName(file.name);
          setIsSaveDialogOpen(true);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCut = () => {
    canvasRef.current?.cut();
  };

  const handleCopy = () => {
    canvasRef.current?.copy();
  };

  const handlePaste = () => {
    canvasRef.current?.paste();
  };

  const handleContentChange = useCallback(() => {
    if (contentChangeTimeoutRef.current) {
      clearTimeout(contentChangeTimeoutRef.current);
    }

    contentChangeTimeoutRef.current = window.setTimeout(() => {
      if (!isLoadingFile) {
        setHasUnsavedChanges(true);
      }
      contentChangeTimeoutRef.current = null;
    }, 300) as unknown as number;
  }, [isLoadingFile]);

  useEffect(() => {
    return () => {
      if (contentChangeTimeoutRef.current) {
        window.clearTimeout(contentChangeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (lastConsumedBlobUrl.current) {
        console.warn(
          "[Paint] Revoking leftover Blob URL on unmount (should have been revoked earlier):",
          lastConsumedBlobUrl.current
        );
        URL.revokeObjectURL(lastConsumedBlobUrl.current);
        lastConsumedBlobUrl.current = null;
      }
    };
  }, []);

  // Load last opened file (persisted path) on first mount
  useEffect(() => {
    const loadPersistedFile = async () => {
      if (initialFileLoaded) return;
      if (!currentFilePath || !canvasRef.current) return;

      const fileName = currentFilePath.split("/").pop();
      if (!fileName) return;

      try {
        // Import the file store to get UUID
        const { useFilesStore } = await import("@/stores/useFilesStore");
        const fileStore = useFilesStore.getState();
        const fileMetadata = fileStore.getItem(currentFilePath);

        if (fileMetadata && fileMetadata.uuid) {
          const record: { content?: Blob } | undefined =
            await dbOperations.get<{
              content?: Blob;
            }>(STORES.IMAGES, fileMetadata.uuid);
          if (record && record.content instanceof Blob) {
            const blobUrl = URL.createObjectURL(record.content);
            console.log("[Paint] Loading persisted file", currentFilePath);
            handleFileOpen(currentFilePath, blobUrl);
            setInitialFileLoaded(true);
          }
        } else {
          console.warn(
            "[Paint] File metadata or UUID not found for:",
            currentFilePath
          );
        }
      } catch (e) {
        console.warn("[Paint] Could not load persisted file", e);
      }
    };

    loadPersistedFile();
  }, [currentFilePath, initialFileLoaded, handleFileOpen]);

  const handleApplyFilter = useCallback((filter: Filter) => {
    canvasRef.current?.applyFilter(filter);
  }, []);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const windowTitle = currentFilePath
    ? currentFilePath.split("/").pop() || t("apps.paint.untitled")
    : `${t("apps.paint.untitled")}${hasUnsavedChanges ? " •" : ""}`;

  return {
    t,
    translatedHelpItems,
    selectedTool,
    handleToolSelect,
    selectedPattern,
    setSelectedPattern,
    strokeWidth,
    setStrokeWidth,
    canUndo,
    setCanUndo,
    canRedo,
    setCanRedo,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmNewDialogOpen,
    setIsConfirmNewDialogOpen,
    hasUnsavedChanges,
    currentFilePath,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    canvasWidth,
    canvasHeight,
    error,
    windowTitle,
    currentTheme,
    isXpTheme,
    handleUndo,
    handleRedo,
    handleClear,
    handleNewFile,
    handleConfirmNew,
    handleSave,
    handleSaveSubmit,
    handleImportFile,
    handleExportFile,
    handleFileSelect,
    handleCut,
    handleCopy,
    handlePaste,
    handleContentChange,
    handleApplyFilter,
    handleCanvasRef,
  };
}
