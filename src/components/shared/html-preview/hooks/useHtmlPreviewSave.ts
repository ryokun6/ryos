import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useFilesStore } from "@/stores/useFilesStore";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { emitFileUpdated } from "@/utils/appEventBus";
import { saveBlobToDevice } from "@/utils/nativeFileDialogs";

function extractEmojiIcon(text: string): {
  emoji: string | null;
  remainingText: string;
} {
  const emojiRegex =
    /^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]+)\s*/u;
  const match = text.match(emojiRegex);
  if (match) {
    return { emoji: match[1], remainingText: text.slice(match[0].length) };
  }
  return { emoji: null, remainingText: text };
}

export function useHtmlPreviewSave(
  appletTitle: string,
  appletIcon: string,
  getProcessedHtmlContent: () => string,
  getProcessedHtmlContentForSave: () => string
) {
  const { t } = useTranslation();
  const { saveFile } = useFileSystem("/", { skipLoad: true });
  const launchApp = useLaunchApp();
  const username = useChatsStore((state) => state.username);
  const [isSaveAppletDialogOpen, setIsSaveAppletDialogOpen] = useState(false);
  const [appletFileName, setAppletFileName] = useState("");

  const handleSaveAppletSubmit = async (fileName: string) => {
    if (!fileName || !fileName.trim()) return;

    const trimmedName = fileName.trim();
    const nameWithExtension =
      trimmedName.endsWith(".app") || trimmedName.endsWith(".html")
        ? trimmedName
        : `${trimmedName}.app`;

    const appletPath = `/Applets/${nameWithExtension}`;

    try {
      const fileStore = useFilesStore.getState();
      const existingFile = fileStore.getItem(appletPath);

      let finalIcon = existingFile?.icon || appletIcon;
      if (!finalIcon || finalIcon === "/icons/default/app.png") {
        const { emoji } = extractEmojiIcon(trimmedName);
        finalIcon = emoji || "/icons/default/app.png";
      }

      const shareId = existingFile?.shareId;
      const existingCreatedBy = existingFile?.createdBy;
      const windowWidth = existingFile?.windowWidth;
      const windowHeight = existingFile?.windowHeight;

      const processedHtmlContentForSave = getProcessedHtmlContentForSave();

      await saveFile({
        path: appletPath,
        name: nameWithExtension,
        content: processedHtmlContentForSave,
        type: "html",
        icon: finalIcon,
        shareId: shareId,
        createdBy: existingCreatedBy || username || undefined,
      });

      if (windowWidth && windowHeight) {
        fileStore.updateItemMetadata(appletPath, { windowWidth, windowHeight });
      }

      emitFileUpdated({ name: nameWithExtension, path: appletPath });
      setIsSaveAppletDialogOpen(false);

      toast.success(t("common.htmlPreview.toastSaved"), {
        description: nameWithExtension,
        action: {
          label: t("common.htmlPreview.toastOpenAction"),
          onClick: () => {
            launchApp("applet-viewer", {
              initialData: {
                path: appletPath,
                content: processedHtmlContentForSave,
              },
            });
          },
        },
        duration: 5000,
      });
    } catch (err) {
      console.error("Failed to save applet:", err);
      toast.error(t("common.htmlPreview.toastSaveFailed"), {
        description: t("common.htmlPreview.toastSaveFailedDescription"),
      });
    }
  };

  const handleSaveAsApplet = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const defaultName = appletTitle ? appletTitle : "applet";
    const candidateName =
      defaultName.endsWith(".app") || defaultName.endsWith(".html")
        ? defaultName
        : `${defaultName}.app`;
    const appletPath = `/Applets/${candidateName}`;

    const existing = useFilesStore.getState().getItem(appletPath);
    if (existing) {
      setAppletFileName(defaultName);
      setIsSaveAppletDialogOpen(true);
    } else {
      try {
        await handleSaveAppletSubmit(defaultName);
      } catch (err) {
        console.error("Quick save applet failed, showing naming dialog:", err);
        setAppletFileName(defaultName);
        setIsSaveAppletDialogOpen(true);
      }
    }
  };

  const handleSaveToDisk = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([getProcessedHtmlContent()], { type: "text/html" });
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .substring(0, 19);
    void saveBlobToDevice(blob, `ryOS-generated-${timestamp}.html`, {
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
  };

  return {
    isSaveAppletDialogOpen,
    setIsSaveAppletDialogOpen,
    appletFileName,
    setAppletFileName,
    handleSaveAppletSubmit,
    handleSaveAsApplet,
    handleSaveToDisk,
  };
}
