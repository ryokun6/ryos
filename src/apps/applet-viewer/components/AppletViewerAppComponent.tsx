import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { useState, useRef, useEffect, useCallback } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { AppletViewerMenuBar } from "./AppletViewerMenuBar";
import { AppStore } from "./AppStore";
import { appMetadata, helpItems, AppletViewerInitialData } from "../index";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppletStore } from "@/stores/useAppletStore";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAuth } from "@/hooks/useAuth";
import { useAppletUpdates } from "../hooks/useAppletUpdates";
import { useAppletActions, type Applet } from "../utils/appletActions";
import { toast } from "sonner";
import { getApiUrl } from "@/utils/platform";
import {
  APPLET_AUTH_BRIDGE_SCRIPT,
  APPLET_AUTH_MESSAGE_TYPE,
} from "@/utils/appletAuthBridge";
import {
  useFileSystem,
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { useFilesStore, FileSystemItem } from "@/stores/useFilesStore";
import { generateAppletShareUrl } from "@/utils/sharedUrl";
import { STORES } from "@/utils/indexedDB";
import { track } from "@vercel/analytics";
import { APPLET_ANALYTICS } from "@/utils/analytics";
import { extractMetadataFromHtml } from "@/utils/appletMetadata";
import { exportAppletAsHtml } from "@/utils/appletImportExport";
import { useTranslation } from "react-i18next";

export function AppletViewerAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<AppletViewerInitialData>) {
  const translatedHelpItems = useTranslatedHelpItems("applet-viewer", helpItems);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareId, setShareId] = useState<string>("");
  const [sharedContent, setSharedContent] = useState<string>("");
  const [sharedName, setSharedName] = useState<string | undefined>(undefined);
  const [sharedTitle, setSharedTitle] = useState<string | undefined>(undefined);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const { t } = useTranslation();
  
  // Use auth hook for authentication functionality
  const authResult = useAuth();
  const {
    promptSetUsername,
    promptVerifyToken,
    logout,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = authResult;

  // Use applet updates hook
  const { updateCount, updatesAvailable, checkForUpdates } = useAppletUpdates();
  const actions = useAppletActions();

  // Check for update for a specific applet by shareId
  const checkForAppletUpdate = useCallback(async (shareId: string) => {
    try {
      const response = await fetch(getApiUrl("/api/applets?list=true"));
      if (!response.ok) return null;
      
      const responseData = await response.json();
      // Handle both old format and new format {success: true, data: {...}}
      const data = responseData.data || responseData;
      const applet = (data.applets || []).find((a: Applet) => a.id === shareId);
      
      if (!applet) return null;
      
      // Check if update is needed using the same logic as AppStore
      if (actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)) {
        return applet;
      }
      
      return null;
    } catch (error) {
      console.error("[AppletViewer] Error checking for applet update:", error);
      return null;
    }
  }, [actions]);

  // Handler for checking updates
  const handleCheckForUpdates = useCallback(async () => {
    const result = await checkForUpdates();
    if (result.count > 0) {
      const appletNames = result.updates
        .map((applet) => applet.title || applet.name || "Untitled Applet")
        .join(", ");
      toast.info(
        `${result.count} new applet update${result.count > 1 ? "s" : ""}`,
        {
          description: appletNames,
          action: {
            label: "Update",
            onClick: async () => {
              // Use the updates from the check result
              const updateCount = result.updates.length;
              const loadingMessage =
                updateCount === 1
                  ? "Updating 1 applet..."
                  : `Updating ${updateCount} applets...`;
              const loadingToastId = toast.loading(loadingMessage, {
                duration: Infinity,
              });

              try {
                for (const applet of result.updates) {
                  await actions.handleInstall(applet);
                }

                await checkForUpdates();

                toast.success(
                  updateCount === 1
                    ? "Applet updated"
                    : `${updateCount} applets updated`,
                  {
                    id: loadingToastId,
                    duration: 3000,
                  }
                );
              } catch (error) {
                console.error("Error updating applets:", error);
                toast.error("Failed to update applets", {
                  description:
                    error instanceof Error ? error.message : "Please try again later.",
                  id: loadingToastId,
                });
              }
            },
          },
          duration: 8000,
        }
      );
    } else {
      toast.success("All applets are up to date");
    }
  }, [checkForUpdates, actions]);

  // Handler for updating all applets
  const handleUpdateAll = useCallback(async () => {
    if (updatesAvailable.length === 0) return;

    const updateCount = updatesAvailable.length;
    const loadingMessage =
      updateCount === 1
        ? "Updating 1 applet..."
        : `Updating ${updateCount} applets...`;
    const loadingToastId = toast.loading(loadingMessage, {
      duration: Infinity,
    });

    try {
      for (const applet of updatesAvailable) {
        await actions.handleInstall(applet);
      }

      await checkForUpdates();

      toast.success(
        updateCount === 1
          ? "Applet updated"
          : `${updateCount} applets updated`,
        {
          id: loadingToastId,
          duration: 3000,
        }
      );
    } catch (error) {
      console.error("Error updating applets:", error);
      toast.error("Failed to update applets", {
        description:
          error instanceof Error ? error.message : "Please try again later.",
        id: loadingToastId,
      });
    }
  }, [updatesAvailable, actions, checkForUpdates]);

  const sendAuthPayload = useCallback(
    (target: Window | null | undefined) => {
      if (!target) return;
      try {
        target.postMessage(
          {
            type: APPLET_AUTH_MESSAGE_TYPE,
            action: "response",
            payload: {
              username: username ?? null,
              authToken: authToken ?? null,
            },
          },
          "*"
        );
      } catch (error) {
        console.warn("[applet-viewer] Failed to post auth payload:", error);
      }
    },
    [username, authToken]
  );

  const focusWindow = useCallback(() => {
    const state = useAppStore.getState();

    if (instanceId) {
      const inst = state.instances[instanceId];
      if (!inst || !inst.isForeground) {
        state.bringInstanceToForeground(instanceId);
      }
    } else {
      const appState = state.apps["applet-viewer"];
      if (!appState || !appState.isForeground) {
        state.bringToForeground("applet-viewer");
      }
    }
  }, [instanceId]);

  const typedInitialData = initialData as AppletViewerInitialData | undefined;
  const appletPath = typedInitialData?.path || "";
  const shareCode = typedInitialData?.shareCode;
  const [loadedContent, setLoadedContent] = useState<string>("");
  
  // Get file metadata and applet store (moved before useEffect)
  const fileStore = useFilesStore();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (
        !data ||
        data.type !== APPLET_AUTH_MESSAGE_TYPE ||
        data.action !== "request"
      ) {
        return;
      }

      const sourceWindow = event.source as Window | null;
      if (!sourceWindow) {
        return;
      }

      if (sourceWindow !== iframeRef.current?.contentWindow) {
        return;
      }

      sendAuthPayload(sourceWindow);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [sendAuthPayload]);

  const fetchAndCacheAppletContent = useCallback(
    async (
      filePath: string,
      metadata: FileSystemItem
    ): Promise<
      | {
          content: string;
          windowWidth?: number;
          windowHeight?: number;
        }
      | null
    > => {
      const { shareId, uuid, name } = metadata;

      if (!shareId || !uuid) {
        console.warn(
          `[AppletViewer] Cannot fetch shared applet for ${filePath}: missing shareId or uuid`
        );
        return null;
      }

      // Check if offline
      if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
        console.warn("[AppletViewer] Cannot fetch applet: offline");
        return null;
      }

      try {
        const response = await fetch(
          `/api/applets/${encodeURIComponent(shareId)}`
        );

        if (!response.ok) {
          console.error(
            `[AppletViewer] Failed to fetch applet content for shareId ${shareId}: ${response.status}`
          );
          return null;
        }

        const data = await response.json();
        const content =
          typeof data.content === "string" ? data.content : "";

        await dbOperations.put<DocumentContent>(
          STORES.APPLETS,
          {
            name: name || filePath.split("/").pop() || shareId,
            content,
          },
          uuid
        );

        const metadataUpdates: Partial<FileSystemItem> = {};

        if (typeof data.icon === "string" && data.icon !== metadata.icon) {
          metadataUpdates.icon = data.icon;
        }
        if (
          typeof data.createdBy === "string" &&
          data.createdBy !== metadata.createdBy
        ) {
          metadataUpdates.createdBy = data.createdBy;
        }
        if (
          typeof data.windowWidth === "number" &&
          typeof data.windowHeight === "number"
        ) {
          metadataUpdates.windowWidth = data.windowWidth;
          metadataUpdates.windowHeight = data.windowHeight;
        }
        if (typeof data.createdAt === "number") {
          metadataUpdates.storeCreatedAt = data.createdAt;
        }

        if (Object.keys(metadataUpdates).length > 0) {
          fileStore.updateItemMetadata(filePath, metadataUpdates);
        }

        return {
          content,
          windowWidth:
            typeof data.windowWidth === "number"
              ? data.windowWidth
              : undefined,
          windowHeight:
            typeof data.windowHeight === "number"
              ? data.windowHeight
              : undefined,
        };
      } catch (error) {
        console.error(
          `[AppletViewer] Error fetching shared applet content for ${shareId}:`,
          error
        );
        return null;
      }
    },
    [fileStore]
  );
  
  // Load content from IndexedDB if path exists, otherwise use initialData.content or sharedContent
  // BUT: If shareCode exists without a path, don't load content - show App Store detail view instead
  const htmlContent = (shareCode && !appletPath) 
    ? "" 
    : loadedContent || typedInitialData?.content || sharedContent || "";
  const hasAppletContent = htmlContent.trim().length > 0;

  useEffect(() => {
    sendAuthPayload(iframeRef.current?.contentWindow);
  }, [sendAuthPayload, htmlContent]);

  // Load content from IndexedDB when appletPath exists
  // Skip if content is already provided in initialData (e.g., from Finder) to avoid double loading
  useEffect(() => {
    const loadContentFromIndexedDB = async () => {
      if (!appletPath || appletPath.startsWith("/Applets/") === false) {
        // No path or not an applet path, don't load from IndexedDB
        setLoadedContent("");
        return;
      }

      // If content is already provided in initialData, use it and skip IndexedDB load
      if (typedInitialData?.content && typedInitialData.content.trim().length > 0) {
        setLoadedContent(typedInitialData.content);
        // Clear content from initialData to prevent localStorage storage
        if (instanceId) {
          const appStore = useAppStore.getState();
          appStore.updateInstanceInitialData(instanceId, {
            ...typedInitialData,
            content: "", // Clear content - it's now in loadedContent state
          });
        }
        return;
      }

      // Only load from IndexedDB if content wasn't provided in initialData
      try {
        const fileMetadata = fileStore.getItem(appletPath);
        if (fileMetadata?.uuid) {
          const contentData = await dbOperations.get<DocumentContent>(
            STORES.APPLETS,
            fileMetadata.uuid
          );

          if (contentData?.content) {
            // Convert Blob to string if needed
            let contentStr: string;
            if (contentData.content instanceof Blob) {
              contentStr = await contentData.content.text();
            } else {
              contentStr = contentData.content;
            }
            setLoadedContent(contentStr);
          } else if (fileMetadata.shareId) {
            const fetched = await fetchAndCacheAppletContent(
              appletPath,
              fileMetadata
            );

            if (fetched) {
              setLoadedContent(fetched.content);

              if (
                instanceId &&
                fetched.windowWidth &&
                fetched.windowHeight
              ) {
                const appStore = useAppStore.getState();
                const inst = appStore.instances[instanceId];
                if (inst) {
                  const pos = inst.position || { x: 0, y: 0 };
                  appStore.updateInstanceWindowState(instanceId, pos, {
                    width: fetched.windowWidth,
                    height: fetched.windowHeight,
                  });
                }
              }
            } else {
              setLoadedContent("");
            }
          } else {
            // No content in IndexedDB and no shareId to fetch from
            setLoadedContent("");
          }
        } else {
          // No UUID
          setLoadedContent("");
        }
      } catch (error) {
        console.error("[AppletViewer] Error loading content from IndexedDB:", error);
        setLoadedContent("");
      }
    };
    loadContentFromIndexedDB();
  }, [
    appletPath,
    instanceId,
    fileStore,
    typedInitialData,
    fetchAndCacheAppletContent,
  ]);

  // Debug logging
  useEffect(() => {
    console.log("[AppletViewer] Loaded applet:", {
      path: appletPath,
      contentLength: htmlContent.length,
      hasContent: !!htmlContent,
      loadedFromIndexedDB: !!loadedContent,
    });
  }, [appletPath, htmlContent, loadedContent]);

  const fileItem = appletPath ? fileStore.getItem(appletPath) : undefined;

  // Track applet view analytics when content is loaded
  const trackedViewsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Only track if we have both a path and content (not store view)
    if (!appletPath || !htmlContent || htmlContent.trim().length === 0) {
      return;
    }

    // Track once per applet path per session
    if (trackedViewsRef.current.has(appletPath)) {
      return;
    }

    trackedViewsRef.current.add(appletPath);

    // Get metadata for tracking
    const shareId = fileItem?.shareId;
    // Extract filename from path (inline to avoid dependency issues)
    const parts = appletPath.split("/");
    const fileName = parts[parts.length - 1];
    const title = fileItem?.name || fileName.replace(/\.(html|app)$/i, "");
    const createdBy = fileItem?.createdBy || "";

    // Track applet view
    track(APPLET_ANALYTICS.VIEW, {
      appletId: shareId || appletPath,
      title: title,
      createdBy: createdBy,
    });
  }, [appletPath, htmlContent, fileItem]);

  // Check for updates when applet window is launched (only once per applet)
  const updateCheckedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!appletPath) return;
    
    // Check for updates asynchronously - wait for content to be loaded
    const checkUpdate = async (retryCount: number = 0) => {
      // Get fileItem directly from store to ensure we have the latest value
      const currentFileItem = fileStore.getItem(appletPath);
      const shareId = currentFileItem?.shareId;
      if (!shareId) {
        // If no shareId yet and we haven't exceeded max retries, try again
        if (retryCount < 5) {
          setTimeout(() => checkUpdate(retryCount + 1), 500);
        }
        return;
      }
      
      // Skip if we've already checked for this applet in this session
      if (updateCheckedRef.current.has(shareId)) return;
      
      // Mark as checked immediately to prevent duplicate checks
      updateCheckedRef.current.add(shareId);
      
      const updateApplet = await checkForAppletUpdate(shareId);
      
      if (updateApplet) {
        const appletName = updateApplet.title || updateApplet.name || t("apps.applet-viewer.dialogs.untitledApplet");
        toast.info(t("apps.applet-viewer.dialogs.appletUpdateAvailable"), {
          description: t("apps.applet-viewer.dialogs.appletUpdateAvailableDescription", { appletName }),
          action: {
            label: t("apps.applet-viewer.status.update"),
            onClick: async () => {
              const loadingToastId = toast.loading(t("apps.applet-viewer.dialogs.updatingApplet"), {
                duration: Infinity,
              });

              try {
                await actions.handleInstall(updateApplet);
                
                // Reload the content after update
                const updatedFileItem = fileStore.getItem(appletPath);
                if (updatedFileItem?.uuid) {
                  const contentData = await dbOperations.get<DocumentContent>(
                    STORES.APPLETS,
                    updatedFileItem.uuid
                  );
                  
                  if (contentData?.content) {
                    let contentStr: string;
                    if (contentData.content instanceof Blob) {
                      contentStr = await contentData.content.text();
                    } else {
                      contentStr = contentData.content;
                    }
                    setLoadedContent(contentStr);
                  }
                }

                toast.success(t("apps.applet-viewer.dialogs.appletUpdated"), {
                  id: loadingToastId,
                  duration: 3000,
                });
                
                // Remove from checked set so we can check again if needed
                updateCheckedRef.current.delete(shareId);
              } catch (error) {
                console.error("Error updating applet:", error);
                toast.error(t("apps.applet-viewer.dialogs.failedToUpdateApplet"), {
                  description:
                    error instanceof Error ? error.message : t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
                  id: loadingToastId,
                });
                // Remove from checked set on error so user can retry
                updateCheckedRef.current.delete(shareId);
              }
            },
          },
          duration: 8000,
        });
      }
    };
    
    // Delay to ensure fileItem is loaded from store (especially when opening from Finder)
    const timeoutId = setTimeout(() => checkUpdate(0), 1000);
    return () => clearTimeout(timeoutId);
  }, [appletPath, loadedContent, checkForAppletUpdate, actions, fileStore, t]);
  const { getAppletWindowSize, setAppletWindowSize } = useAppletStore();
  
  // Get saved size from file metadata first, fallback to applet store
  const savedSizeFromMetadata = fileItem?.windowWidth && fileItem?.windowHeight
    ? { width: fileItem.windowWidth, height: fileItem.windowHeight }
    : undefined;
  const savedSizeFromAppletStore = appletPath ? getAppletWindowSize(appletPath) : undefined;
  const savedSize = savedSizeFromMetadata || savedSizeFromAppletStore;

  // Get current window state from app store
  const currentWindowState = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : state.apps["applet-viewer"]
  );

  // Apply saved size to the window instance ONLY once when available
  const appliedInitialSizeRef = useRef(false);
  useEffect(() => {
    if (appliedInitialSizeRef.current) return;
    if (!instanceId || !savedSize) return;
    const appStore = useAppStore.getState();
    const inst = appStore.instances[instanceId];
    if (!inst) return;
    const currentSize = inst.size;
    if (
      !currentSize ||
      currentSize.width !== savedSize.width ||
      currentSize.height !== savedSize.height
    ) {
      const pos = inst.position || { x: 0, y: 0 };
      appStore.updateInstanceWindowState(instanceId, pos, savedSize);
    }
    appliedInitialSizeRef.current = true;
  }, [instanceId, savedSize]);

  // Save window size to file metadata and applet store whenever it changes in the app store (avoid loops)
  useEffect(() => {
    if (!appletPath || !currentWindowState?.size) return;
    const next = currentWindowState.size;
    // Only write when different from saved size to prevent infinite update loops
    const shouldUpdate =
      !savedSize ||
      savedSize.width !== next.width ||
      savedSize.height !== next.height;
    
    if (shouldUpdate) {
      // Save to file metadata
      if (fileItem) {
        fileStore.updateItemMetadata(appletPath, {
          windowWidth: next.width,
          windowHeight: next.height,
        });
      }
      // Also save to applet store for backward compatibility
      setAppletWindowSize(appletPath, next);
    }
  }, [appletPath, currentWindowState?.size, savedSize, fileItem, fileStore, setAppletWindowSize]);

  // Get filename from path for window title
  const getFileName = (path: string): string => {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(html|app)$/i, "");
  };

  // Extract title from HTML content if available
  const getAppletTitle = (content: string, isShared = false): string => {
    if (!content) return "";
    // Try to extract title from HTML comment (<!-- TITLE: ... -->)
    const titleMatch = content.match(/<!--\s*TITLE:\s*([^>]+)-->/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    // Try to extract from <title> tag
    const titleTagMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      return titleTagMatch[1].trim();
    }
    // For shared applets without path, return empty string (not "Untitled")
    // so we can fall back to sharedName/sharedTitle
    if (isShared && !appletPath) return "";
    // Fallback to filename or "Untitled"
    return appletPath ? getFileName(appletPath) : "Untitled";
  };

  // Ensure macOSX theme uses Lucida Grande/system/emoji-safe fonts inside iframe content
  const ensureMacFonts = (content: string): string => {
    if (!isMacTheme || !content) return content;
    // Ensure fonts.css is available and prefer Lucida Grande
    const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
    const fontStyle = `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>`;

    // If there's a </head>, inject before it
    const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
    if (headCloseIdx !== -1) {
      return (
        content.slice(0, headCloseIdx) +
        preload +
        fontStyle +
        content.slice(headCloseIdx)
      );
    }

    // If there's an <head>, inject after it
    const headOpenMatch = /<head[^>]*>/i.exec(content);
    if (headOpenMatch) {
      const idx = headOpenMatch.index + headOpenMatch[0].length;
      return content.slice(0, idx) + preload + fontStyle + content.slice(idx);
    }

    // If there's an <html>, create head and inject
    const htmlOpenMatch = /<html[^>]*>/i.exec(content);
    if (htmlOpenMatch) {
      const idx = htmlOpenMatch.index + htmlOpenMatch[0].length;
      return (
        content.slice(0, idx) +
        `<head>${preload}${fontStyle}</head>` +
        content.slice(idx)
      );
    }

    // Otherwise, wrap minimally
    return `<!DOCTYPE html><html><head>${preload}${fontStyle}</head><body>${content}</body></html>`;
  };

  const injectAppletAuthScript = useCallback(
    (content: string): string => {
      if (!content) return content;
      if (content.includes(APPLET_AUTH_MESSAGE_TYPE)) {
        return content;
      }

      const lower = content.toLowerCase();
      const headCloseIdx = lower.lastIndexOf("</head>");
      if (headCloseIdx !== -1) {
        return (
          content.slice(0, headCloseIdx) +
          APPLET_AUTH_BRIDGE_SCRIPT +
          content.slice(headCloseIdx)
        );
      }

      const headOpenMatch = /<head[^>]*>/i.exec(content);
      if (headOpenMatch) {
        const insertIdx = headOpenMatch.index + headOpenMatch[0].length;
        return (
          content.slice(0, insertIdx) +
          APPLET_AUTH_BRIDGE_SCRIPT +
          content.slice(insertIdx)
        );
      }

      const htmlOpenMatch = /<html[^>]*>/i.exec(content);
      if (htmlOpenMatch) {
        const insertIdx = htmlOpenMatch.index + htmlOpenMatch[0].length;
        return (
          content.slice(0, insertIdx) +
          `<head>${APPLET_AUTH_BRIDGE_SCRIPT}</head>` +
          content.slice(insertIdx)
        );
      }

      return `<!DOCTYPE html><html><head>${APPLET_AUTH_BRIDGE_SCRIPT}</head><body>${content}</body></html>`;
    },
    []
  );

  const launchApp = useLaunchApp();
  const { saveFile, files } = useFileSystem("/Applets");

  // Helper function to extract emoji from start of string
  const extractEmojiIcon = (
    text: string
  ): { emoji: string | null; remainingText: string } => {
    // Match emoji at the start of the string (including optional whitespace after)
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

  // Import handler
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        let fileText: string;

        // Check if file is gzipped (.app file or .gz file)
        const fileExtension = file.name.toLowerCase();
        if (fileExtension.endsWith(".app") || fileExtension.endsWith(".gz")) {
          // Try to decompress as gzip
          try {
            if (typeof DecompressionStream === "undefined") {
              throw new Error("DecompressionStream API not available");
            }

            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer]);
            const stream = blob.stream();
            const decompressionStream = new DecompressionStream("gzip");
            const decompressedStream = stream.pipeThrough(decompressionStream);
            
            const chunks: Uint8Array[] = [];
            const reader = decompressedStream.getReader();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
              }
            }
            
            // Combine chunks and convert to text
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }
            
            const decoder = new TextDecoder();
            fileText = decoder.decode(combined);
          } catch (decompressError) {
            // If decompression fails, treat as plain text
            // Read file again (File objects can be read multiple times)
            console.warn("Failed to decompress, treating as plain text:", decompressError);
            fileText = await file.text();
          }
        } else {
          // Not a gzipped file, read as text
          fileText = await file.text();
        }

        let content: string;
        let importFileName: string;
        let icon: string | undefined;
        let shareId: string | undefined;
        let createdBy: string | undefined;
        let windowWidth: number | undefined;
        let windowHeight: number | undefined;
        let createdAt: number | undefined;
        let modifiedAt: number | undefined;

        // Try to parse as JSON (full applet export)
        try {
          const jsonData = JSON.parse(fileText);
          if (jsonData.content && typeof jsonData.content === "string") {
            // Full JSON format
            content = jsonData.content;
            importFileName = jsonData.name || file.name;
            icon = jsonData.icon;
            shareId = jsonData.shareId;
            createdBy = jsonData.createdBy;
            windowWidth = jsonData.windowWidth;
            windowHeight = jsonData.windowHeight;
            createdAt = jsonData.createdAt;
            modifiedAt = jsonData.modifiedAt;
          } else {
            // Not a valid applet JSON, treat as plain HTML
            content = fileText;
            importFileName = file.name;
          }
        } catch {
          // Not JSON, treat as plain HTML/App file
          // Try to extract metadata from HTML comments
          const { metadata, content: extractedContent } = extractMetadataFromHtml(fileText);
          content = extractedContent;
          importFileName = file.name;
          
          // Use metadata from HTML comments if available
          if (metadata.shareId) shareId = metadata.shareId;
          if (metadata.name) importFileName = metadata.name;
          if (metadata.icon) icon = metadata.icon;
          if (metadata.createdBy) createdBy = metadata.createdBy;
          if (metadata.windowWidth !== undefined) windowWidth = metadata.windowWidth;
          if (metadata.windowHeight !== undefined) windowHeight = metadata.windowHeight;
          if (metadata.createdAt !== undefined) createdAt = metadata.createdAt;
          if (metadata.modifiedAt !== undefined) modifiedAt = metadata.modifiedAt;
        }

        // Extract emoji from filename BEFORE processing extension
        const { emoji, remainingText } = extractEmojiIcon(importFileName);

        // Use extracted emoji or JSON icon, or remaining text
        if (!icon && emoji) {
          icon = emoji;
        }
        importFileName = remainingText;

        // Ensure the file has .app extension
        if (importFileName.endsWith(".html") || importFileName.endsWith(".htm") || importFileName.endsWith(".json") || importFileName.endsWith(".gz")) {
          importFileName = importFileName.replace(/\.(html|htm|json|gz)$/i, ".app");
        } else if (!importFileName.endsWith(".app")) {
          importFileName = `${importFileName}.app`;
        }

        const filePath = `/Applets/${importFileName}`;
        const fileStore = useFilesStore.getState();
        
        // Save the file to the filesystem with all metadata
        await saveFile({
          name: importFileName,
          path: filePath,
          content: content,
          type: "html",
          icon: icon,
          shareId: shareId,
          createdBy: createdBy || username || undefined,
        });

        // Update additional metadata if present
        if (windowWidth || windowHeight || createdAt || modifiedAt) {
          fileStore.updateItemMetadata(filePath, {
            ...(windowWidth && { windowWidth }),
            ...(windowHeight && { windowHeight }),
            ...(createdAt && { createdAt }),
            ...(modifiedAt && { modifiedAt }),
          });
        }

        // Dispatch event to notify Finder of the new file
        const saveEvent = new CustomEvent("saveFile", {
          detail: {
            name: importFileName,
            path: filePath,
            content: content,
            icon: icon,
          },
        });
        window.dispatchEvent(saveEvent);

        // Launch a new applet viewer instance with the imported content
        launchApp("applet-viewer", {
          initialData: {
            path: filePath,
            content: content,
          },
        });

        toast.success("Applet imported!", {
          description: `${importFileName} saved to /Applets${
            icon ? ` with ${icon} icon` : ""
          }`,
        });
      } catch (error) {
        console.error("Import failed:", error);
        toast.error("Import failed", {
          description: "Could not import the file.",
        });
      }
    }

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Export as App handler (with full JSON metadata, gzipped)
  const handleExportAsApp = async () => {
    if (!hasAppletContent) return;

    // Get base filename without extension
    let filename = appletPath
      ? appletPath
          .split("/")
          .pop()
          ?.replace(/\.(html|app)$/i, "") || "Untitled"
      : "Untitled";

    // Get file metadata from the filesystem
    const fileStore = useFilesStore.getState();
    const currentFile = fileStore.getItem(appletPath);
    
    // Build full JSON export with all metadata
    const exportData = {
      name: currentFile?.name || filename,
      content: htmlContent,
      icon: currentFile?.icon,
      shareId: currentFile?.shareId,
      createdBy: currentFile?.createdBy,
      windowWidth: currentFile?.windowWidth,
      windowHeight: currentFile?.windowHeight,
      createdAt: currentFile?.createdAt,
      modifiedAt: currentFile?.modifiedAt,
    };

    // Use the file's actual icon emoji, or fallback to 📦
    const fileIcon = currentFile?.icon;
    const isEmojiIcon =
      fileIcon &&
      !fileIcon.startsWith("/") &&
      !fileIcon.startsWith("http") &&
      fileIcon.length <= 10;
    const emojiPrefix = isEmojiIcon ? fileIcon : "📦";
    filename = `${emojiPrefix} ${filename}`;

    try {
      // Check if CompressionStream is available
      if (typeof CompressionStream === "undefined") {
        throw new Error("CompressionStream API not available in this browser");
      }

      // Convert JSON string to Uint8Array for compression
      const encoder = new TextEncoder();
      const jsonString = JSON.stringify(exportData, null, 2);
      const inputData = encoder.encode(jsonString);

      // Create a ReadableStream from the data
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });

      // Compress the stream
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);

      // Convert the compressed stream to a blob
      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }

      // Combine chunks into a single blob
      const compressedBlob = new Blob(chunks as BlobPart[], { type: "application/gzip" });

      // Create download link
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.app`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Applet exported!", {
        description: `${filename}.app exported successfully.`,
      });
    } catch (compressionError) {
      console.error("Compression failed:", compressionError);
      toast.error("Export failed", {
        description: compressionError instanceof Error
          ? compressionError.message
          : "Could not compress the applet file.",
      });
    }
  };

  // Export as HTML handler (without emoji prefix)
  const handleExportAsHtml = () => {
    if (!hasAppletContent) return;
    exportAppletAsHtml(htmlContent, appletPath);
  };

  // Share applet handler
  const handleShareApplet = async () => {
    if (!hasAppletContent) {
      toast.error("No applet to share", {
        description: "Please open an applet first.",
      });
      return;
    }

    if (!username || !authToken) {
      toast.error("Login required", {
        description: "You must be logged in to share applets.",
      });
      return;
    }

    try {
      // Check if applet already has a shareId
      const currentFile = files.find((f) => f.path === appletPath);
      const fileItem = appletPath ? fileStore.getItem(appletPath) : null;
      const existingShareId = fileItem?.shareId;
      const fileCreatedBy = fileItem?.createdBy;

      // Check if user is the author (case-insensitive comparison)
      const isAuthor = fileCreatedBy && username && fileCreatedBy.toLowerCase() === username.toLowerCase();

      // If applet exists and user is not the author, just show existing share URL
      if (existingShareId && !isAuthor) {
        setShareId(existingShareId);
        setIsShareDialogOpen(true);
        toast.success("Applet already shared", {
          description: "Showing existing share link.",
        });
        return;
      }

      // If applet exists and user is the author, or no existing shareId, create/update share
      const appletTitle = getAppletTitle(htmlContent);
      const appletIcon = currentFile?.icon;
      const appletName = currentFile?.name || (appletPath ? getFileName(appletPath) : undefined);
      
      // Get current window dimensions to include in share
      const windowDimensions = currentWindowState?.size;
      
      const response = await fetch(getApiUrl("/api/applets"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        body: JSON.stringify({
          content: htmlContent,
          title: appletTitle || undefined,
          icon: appletIcon || undefined,
          name: appletName || undefined,
          windowWidth: windowDimensions?.width,
          windowHeight: windowDimensions?.height,
          shareId: existingShareId && isAuthor ? existingShareId : undefined, // Include shareId if updating
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle both old format {error: "..."} and new format {error: {message: "..."}}
        const errorMessage = typeof errorData.error === 'string' ? errorData.error : errorData.error?.message || "Failed to share applet";
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      // Handle both old format and new format {success: true, data: {...}}
      const data = responseData.data || responseData;
      setShareId(data.id);
      setIsShareDialogOpen(true);

      // Update the file metadata with the shareId (preserve existing createdBy)
      // Only update shareId if: (1) this was an update (user is author), or (2) there was no existing shareId
      // This preserves the original shareId from imported .app files when user is not the author
      if (appletPath && data.id) {
        const currentFileItem = fileStore.getItem(appletPath);
        if (currentFileItem) {
          // Only update shareId if it was successfully updated (user is author) or if there was no existing shareId
          const shouldUpdateShareId = data.updated || !existingShareId;
          
          await saveFile({
            path: appletPath,
            name: currentFileItem.name,
            content: htmlContent,
            type: "html",
            icon: currentFileItem.icon,
            shareId: shouldUpdateShareId ? data.id : existingShareId || data.id,
            createdBy: currentFileItem.createdBy || username,
          });
          
          // Update storeCreatedAt with the createdAt timestamp from the server response
          // This prevents false "update available" notifications after sharing/updating
          if (data.createdAt) {
            fileStore.updateItemMetadata(appletPath, {
              storeCreatedAt: data.createdAt,
            });
          }
        }
      }

      toast.success(data.updated ? "Applet updated!" : "Applet shared!", {
        description: data.updated 
          ? "Share link updated successfully." 
          : "Share link generated successfully.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error sharing applet:", error);
      toast.error("Failed to share applet", {
        description:
          error instanceof Error ? error.message : "Please try again later.",
      });
    }
  };

  // Handle shared applet fetching - only if we have a path (don't fetch if showing App Store detail view)
  useEffect(() => {
    if (shareCode && appletPath) {
      // Only fetch content if we have a path (legacy behavior)
      // If no path, App Store will handle showing the detail view
      setSharedContent("");
      
      const fetchSharedApplet = async () => {
        try {
          const response = await fetch(getApiUrl(`/api/applets/${encodeURIComponent(shareCode)}`));
          
          if (!response.ok) {
            if (response.status === 404) {
              toast.error("Applet not found", {
                description: "The shared applet may have been deleted or the link is invalid.",
              });
            } else {
              throw new Error("Failed to fetch shared applet");
            }
            return;
          }

          const responseData = await response.json();
          // Handle both old format and new format {success: true, data: {applet: {...}}}
          const data = responseData.data?.applet || responseData;
          setSharedContent(data.content);
          setSharedName(data.name);
          setSharedTitle(data.title);
          
          // Apply window dimensions if available
          if (instanceId && data.windowWidth && data.windowHeight) {
            const appStore = useAppStore.getState();
            const inst = appStore.instances[instanceId];
            if (inst) {
              const pos = inst.position || { x: 0, y: 0 };
              appStore.updateInstanceWindowState(instanceId, pos, {
                width: data.windowWidth,
                height: data.windowHeight,
              });
            }
          }
          
          // Update initialData with icon and name from shared applet
          if (instanceId && (data.icon || data.name)) {
            const appStore = useAppStore.getState();
            const inst = appStore.instances[instanceId];
            if (inst) {
              const currentData = inst.initialData as AppletViewerInitialData | undefined;
              const updatedInitialData: AppletViewerInitialData = {
                path: currentData?.path ?? "",
                content: currentData?.content ?? "",
                shareCode: currentData?.shareCode,
                icon: data.icon || currentData?.icon,
                name: data.name || currentData?.name,
              };
              appStore.updateInstanceInitialData(instanceId, updatedInitialData);
            }
          }
          
          // Show toast with Save button
          const displayName = data.title || data.name || "Shared Applet";
          toast.success("Shared applet loaded", {
            description: displayName,
            action: {
              label: "Save",
              onClick: async () => {
                try {
                  let defaultName = data.name || data.title || "shared-applet";
                  
                  // Strip emoji from name if present (emoji should be saved as icon metadata, not in filename)
                  const { remainingText } = extractEmojiIcon(defaultName);
                  defaultName = remainingText;
                  
                  const nameWithExtension = defaultName.endsWith(".app") 
                    ? defaultName 
                    : `${defaultName}.app`;
                  
                  const filePath = `/Applets/${nameWithExtension}`;
                  
                  // Check if an applet with this shareId already exists (by checking metadata)
                  const existingApplet = shareCode ? files.find((f) => {
                    const fileItem = fileStore.getItem(f.path);
                    return fileItem?.shareId === shareCode;
                  }) : null;
                  
                  // Use existing path if found, otherwise use new path with normal name
                  const finalPath = existingApplet?.path || filePath;
                  const finalName = existingApplet?.name || nameWithExtension;
                  
                  await saveFile({
                    path: finalPath,
                    name: finalName,
                    content: data.content,
                    type: "html",
                    icon: data.icon || undefined,
                    shareId: shareCode,
                    createdBy: data.createdBy,
                  });
                  
                  // Save window dimensions to metadata if available
                  if (data.windowWidth && data.windowHeight) {
                    fileStore.updateItemMetadata(finalPath, {
                      windowWidth: data.windowWidth,
                      windowHeight: data.windowHeight,
                    });
                  }
                  
                  // Notify that file was saved
                  const event = new CustomEvent("saveFile", {
                    detail: {
                      name: finalName,
                      path: finalPath,
                      content: data.content,
                      icon: data.icon || undefined,
                    },
                  });
                  window.dispatchEvent(event);
                  
                  toast.success("Applet saved", {
                    description: `Saved to /Applets/${finalName}`,
                  });
                } catch (error) {
                  console.error("Error saving shared applet:", error);
                  toast.error("Failed to save applet", {
                    description: error instanceof Error ? error.message : "Please try again.",
                  });
                }
              },
            },
            duration: 10000,
          });
        } catch (error) {
          console.error("Error fetching shared applet:", error);
          toast.error("Failed to load shared applet", {
            description: "Please check your connection and try again.",
          });
        }
      };

      fetchSharedApplet();
    } else if (!shareCode && sharedContent) {
      // Clear shared content when opening a regular applet
      setSharedContent("");
      setSharedName(undefined);
      setSharedTitle(undefined);
    }
  }, [shareCode]); // Only depend on shareCode - will re-run whenever it changes

  const menuBar = (
    <AppletViewerMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onExportAsApp={handleExportAsApp}
      onExportAsHtml={handleExportAsHtml}
      onShareApplet={handleShareApplet}
      hasAppletContent={hasAppletContent}
      handleFileSelect={handleFileSelect}
      instanceId={instanceId}
      onSetUsername={promptSetUsername}
      onVerifyToken={promptVerifyToken}
      onLogout={logout}
      updateCount={updateCount}
      onCheckForUpdates={handleCheckForUpdates}
      onUpdateAll={handleUpdateAll}
    />
  );

  // Bring window to foreground when interacting inside the iframe while it's in the back
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !instanceId) return;

    const attachInteractionListeners = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const frameWindow = iframe.contentWindow;
        const handleInteract = () => {
          focusWindow();
        };

        // Use capturing to ensure we catch early
        doc?.addEventListener("pointerdown", handleInteract, true);
        doc?.addEventListener("mousedown", handleInteract, true);
        doc?.addEventListener("touchstart", handleInteract, true);
        doc?.addEventListener("keydown", handleInteract, true);
        doc?.addEventListener("focusin", handleInteract, true);

        try {
          frameWindow?.addEventListener("focus", handleInteract);
        } catch {
          // Ignore cross-origin focus attachment errors
        }

        return () => {
          doc?.removeEventListener("pointerdown", handleInteract, true);
          doc?.removeEventListener("mousedown", handleInteract, true);
          doc?.removeEventListener("touchstart", handleInteract, true);
          doc?.removeEventListener("keydown", handleInteract, true);
          doc?.removeEventListener("focusin", handleInteract, true);
          try {
            frameWindow?.removeEventListener("focus", handleInteract);
          } catch {
            // Ignore cross-origin focus removal errors
          }
        };
      } catch {
        // If cross-origin or sandbox prevents access, silently ignore
        return;
      }
    };

    let detachListeners = attachInteractionListeners();

    const onLoad = () => {
      if (detachListeners) detachListeners();
      detachListeners = attachInteractionListeners();
    };

    const onIframeFocus = () => focusWindow();

    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("focus", onIframeFocus, true);

    return () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("focus", onIframeFocus, true);
      if (detachListeners) detachListeners();
    };
  }, [instanceId, focusWindow]);

  if (!isWindowOpen) return null;

  // Determine window title - prefer applet title, then shared name/title, then filename, then default
  const windowTitle = hasAppletContent
    ? shareCode
      ? getAppletTitle(htmlContent, true) || sharedTitle || sharedName || t("apps.applet-viewer.dialogs.sharedApplet")
      : appletPath
      ? getFileName(appletPath)
              : getAppletTitle(htmlContent, false) || t("common.dock.appletStore")
    : t("common.dock.appletStore");

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="applet-viewer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        >
            <div className="w-full h-full bg-white overflow-hidden">
            {hasAppletContent ? (
              <div className="relative h-full w-full">
                <iframe
                  ref={iframeRef}
                  srcDoc={injectAppletAuthScript(ensureMacFonts(htmlContent))}
                  title={windowTitle}
                  className="border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                  style={{
                    display: "block",
                    margin: 0,
                    padding: 0,
                    width: "calc(100% + 1px)",
                    height: "calc(100% + 1px)",
                  }}
                  onLoad={() =>
                    sendAuthPayload(iframeRef.current?.contentWindow || null)
                  }
                  onFocus={focusWindow}
                  onFocusCapture={focusWindow}
                />
                {!isForeground && (
                  <div
                    className="absolute inset-0 z-50 bg-transparent"
                    aria-hidden="true"
                    onClick={focusWindow}
                    onMouseDown={focusWindow}
                    onTouchStart={focusWindow}
                    onWheel={focusWindow}
                    onDragStart={focusWindow}
                    onKeyDown={focusWindow}
                  />
                )}
              </div>
            ) : (
                <div
                  className="relative h-full w-full"
                  style={
                    isMacTheme
                      ? {
                          backgroundColor: "var(--os-color-window-bg)",
                          backgroundImage: "var(--os-pinstripe-window)",
                        }
                      : undefined
                  }
                >
                  <AppStore
                    theme={currentTheme}
                    sharedAppletId={shareCode || undefined}
                    focusWindow={focusWindow}
                  />
                  {!isForeground && (
                    <div
                      className="absolute inset-0 z-50 bg-transparent"
                      aria-hidden="true"
                      onClick={focusWindow}
                      onMouseDown={focusWindow}
                      onTouchStart={focusWindow}
                      onWheel={focusWindow}
                      onDragStart={focusWindow}
                      onKeyDown={focusWindow}
                    />
                  )}
                </div>
            )}
          </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="applet-viewer"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="applet-viewer"
      />
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => {
          setIsShareDialogOpen(false);
          setShareId("");
        }}
        itemType="Applet"
        itemIdentifier={shareId}
        title={shareId ? getAppletTitle(htmlContent) : undefined}
        generateShareUrl={generateAppletShareUrl}
      />
      <LoginDialog
        initialTab={isVerifyDialogOpen ? "login" : "signup"}
        isOpen={isUsernameDialogOpen || isVerifyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsUsernameDialogOpen(false);
            setVerifyDialogOpen(false);
          }
        }}
        /* Login props */
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        /* Sign-up props */
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={submitUsernameDialog}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />
    </>
  );
}
