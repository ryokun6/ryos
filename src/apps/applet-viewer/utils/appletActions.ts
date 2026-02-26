import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFilesStore } from "@/stores/useFilesStore";
import { track } from "@/lib/analytics";
import { APPLET_ANALYTICS } from "@/utils/analytics";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

export interface Applet {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt?: number;
  featured?: boolean;
  createdBy?: string;
}

// Helper function to extract emoji from start of string
export const extractEmojiIcon = (
  text: string
): { emoji: string | null; remainingText: string } => {
  const emojiRegex =
    /^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]+)\s*/u;
  const match = text.match(emojiRegex);

  if (match) {
    return {
      emoji: match[1],
      remainingText: text.slice(match[0].length),
    };
  }

  return {
    emoji: null,
    remainingText: text,
  };
};

export const useAppletActions = () => {
  const { saveFile, files, handleFileOpen } = useFileSystem("/Applets");
  const launchApp = useLaunchApp();
  const getFileItem = useFilesStore((state) => state.getItem);
  const updateFileItemMetadata = useFilesStore(
    (state) => state.updateItemMetadata
  );

  // Check if an applet is installed
  const isAppletInstalled = useCallback((appletId: string): boolean => {
    return files.some((f) => {
      const fileItem = getFileItem(f.path);
      return fileItem?.shareId === appletId;
    });
  }, [files, getFileItem]);

  // Get installed applet file item
  const getInstalledApplet = useCallback((appletId: string) => {
    return files.find((f) => {
      const fileItem = getFileItem(f.path);
      return fileItem?.shareId === appletId;
    });
  }, [files, getFileItem]);

  // Check if installed applet needs update
  const pendingStoreCreatedAtUpdates = useRef<Set<string>>(new Set());

  const scheduleStoreCreatedAtUpdate = useCallback(
    (filePath: string, createdAt: number | undefined) => {
      if (!filePath || !createdAt) return;
      if (pendingStoreCreatedAtUpdates.current.has(filePath)) return;
      pendingStoreCreatedAtUpdates.current.add(filePath);

      // Defer metadata write until after render to avoid React update loops
      setTimeout(() => {
        try {
          const latestItem = getFileItem(filePath);
          if (latestItem && !latestItem.storeCreatedAt) {
            updateFileItemMetadata(filePath, {
              storeCreatedAt: createdAt,
            });
          }
        } finally {
          pendingStoreCreatedAtUpdates.current.delete(filePath);
        }
      }, 0);
    },
    [getFileItem, updateFileItemMetadata]
  );

  const needsUpdate = useCallback(
    (applet: Applet): boolean => {
      if (!isAppletInstalled(applet.id)) return false;
      const installedFile = getInstalledApplet(applet.id);
      if (!installedFile) return false;
      const fileItem = getFileItem(installedFile.path);
      if (!fileItem) return false;

      const currentCreatedAt = applet.createdAt || 0;

      if (!fileItem.storeCreatedAt && currentCreatedAt) {
        scheduleStoreCreatedAtUpdate(installedFile.path, currentCreatedAt);
      }

      if (!currentCreatedAt) {
        return false;
      }

      const baselineCreatedAt =
        fileItem.storeCreatedAt ??
        fileItem.createdAt ??
        fileItem.modifiedAt ??
        0;

      return currentCreatedAt - baselineCreatedAt > 1000;
    },
    [getFileItem, getInstalledApplet, isAppletInstalled, scheduleStoreCreatedAtUpdate]
  );

  // Handle clicking on an applet
  const handleAppletClick = async (applet: Applet) => {
    const installed = isAppletInstalled(applet.id);
    
    if (installed) {
      const installedApplet = files.find((f) => {
        const fileItem = getFileItem(f.path);
        return fileItem?.shareId === applet.id;
      });

      if (installedApplet) {
        try {
          await handleFileOpen(installedApplet);
        } catch (error) {
          console.error("Error launching applet from disk:", error);
          toast.error("Failed to launch applet");
        }
      }
    } else {
      // Return applet for detail view
      return applet;
    }
  };

  const handleInstall = async (applet: Applet, onSuccess?: () => void) => {
    // Check if offline
    if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
      throw new Error("Applet installation requires an internet connection");
    }

    try {
      const isUpdate = isAppletInstalled(applet.id);
      
      const response = await abortableFetch(
        getApiUrl(`/api/share-applet?id=${encodeURIComponent(applet.id)}`),
        {
          timeout: 15000,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch applet");
      }

      const data = await response.json();
      
      let defaultName = data.name || data.title || "shared-applet";
      const { remainingText } = extractEmojiIcon(defaultName);
      defaultName = remainingText;
      
      const nameWithExtension = defaultName.endsWith(".app") 
        ? defaultName 
        : `${defaultName}.app`;
      
      const existingApplet = files.find((f) => {
        const fileItem = getFileItem(f.path);
        return fileItem?.shareId === applet.id;
      });
      
      const finalPath = existingApplet?.path || `/Applets/${nameWithExtension}`;
      const finalName = existingApplet?.name || nameWithExtension;
      
      await saveFile({
        path: finalPath,
        name: finalName,
        content: data.content,
        type: "html",
        icon: data.icon || undefined,
        shareId: applet.id,
        createdBy: data.createdBy || applet.createdBy,
      });
      
      const storeCreatedAtValue = data.createdAt || Date.now();
      updateFileItemMetadata(finalPath, {
        storeCreatedAt: storeCreatedAtValue,
      });
      
      if (data.windowWidth && data.windowHeight) {
        updateFileItemMetadata(finalPath, {
          windowWidth: data.windowWidth,
          windowHeight: data.windowHeight,
        });
      }
      
      const event = new CustomEvent("saveFile", {
        detail: {
          name: finalName,
          path: finalPath,
          content: data.content,
          icon: data.icon || undefined,
        },
      });
      window.dispatchEvent(event);
      
      // Track analytics for install or update
      if (isUpdate) {
        track(APPLET_ANALYTICS.UPDATE, {
          appletId: applet.id,
          title: applet.title || applet.name || "Untitled Applet",
          createdBy: applet.createdBy || data.createdBy || "",
        });
      } else {
        track(APPLET_ANALYTICS.INSTALL, {
          appletId: applet.id,
          title: applet.title || applet.name || "Untitled Applet",
          createdBy: applet.createdBy || data.createdBy || "",
          featured: applet.featured || false,
        });
      }
      
      toast.success(isUpdate ? "Applet updated" : "Applet installed", {
        description: `Saved to /Applets/${finalName}`,
        duration: 3000,
        action: {
          label: "Open",
          onClick: () => {
            launchApp("applet-viewer", {
              initialData: {
                path: finalPath,
                content: data.content,
              },
            });
          },
        },
      });
      
      // Automatically open the applet in a new window instance (only for new installs, not updates)
      if (!isUpdate) {
        launchApp("applet-viewer", {
          initialData: {
            path: finalPath,
            content: data.content,
            forceNewInstance: true,
          },
        });
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error installing applet:", error);
      toast.error("Failed to install applet", {
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    }
  };

  return {
    isAppletInstalled,
    getInstalledApplet,
    needsUpdate,
    handleAppletClick,
    handleInstall,
  };
};
