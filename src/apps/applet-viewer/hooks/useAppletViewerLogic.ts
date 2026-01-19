import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { helpItems, AppletViewerInitialData } from "../index";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppletStore } from "@/stores/useAppletStore";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAuth } from "@/hooks/useAuth";
import { useAppletUpdates } from "./useAppletUpdates";
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
import { STORES } from "@/utils/indexedDB";
import { track } from "@vercel/analytics";
import { APPLET_ANALYTICS } from "@/utils/analytics";
import { extractMetadataFromHtml } from "@/utils/appletMetadata";
import { exportAppletAsHtml } from "@/utils/appletImportExport";

interface UseAppletViewerLogicProps {
  instanceId?: string;
  initialData?: AppletViewerInitialData;
}

export function useAppletViewerLogic({
  instanceId,
  initialData,
}: UseAppletViewerLogicProps) {
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

  const { updateCount, updatesAvailable, checkForUpdates } = useAppletUpdates();
  const actions = useAppletActions();

  const checkForAppletUpdate = useCallback(
    async (shareId: string) => {
      try {
        const response = await fetch(getApiUrl("/api/share-applet?list=true"));
        if (!response.ok) return null;

        const data = await response.json();
        const applet = (data.applets || []).find(
          (a: Applet) => a.id === shareId
        );

        if (!applet) return null;

        if (actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)) {
          return applet;
        }

        return null;
      } catch (error) {
        console.error("[AppletViewer] Error checking for applet update:", error);
        return null;
      }
    },
    [actions]
  );

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
                    error instanceof Error
                      ? error.message
                      : "Please try again later.",
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

      if (
        typeof navigator !== "undefined" &&
        "onLine" in navigator &&
        !navigator.onLine
      ) {
        console.warn("[AppletViewer] Cannot fetch applet: offline");
        return null;
      }

      try {
        const response = await fetch(
          `/api/share-applet?id=${encodeURIComponent(shareId)}`
        );

        if (!response.ok) {
          console.error(
            `[AppletViewer] Failed to fetch applet content for shareId ${shareId}: ${response.status}`
          );
          return null;
        }

        const data = await response.json();
        const content = typeof data.content === "string" ? data.content : "";

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

  const htmlContent =
    shareCode && !appletPath
      ? ""
      : loadedContent || typedInitialData?.content || sharedContent || "";
  const hasAppletContent = htmlContent.trim().length > 0;

  useEffect(() => {
    sendAuthPayload(iframeRef.current?.contentWindow);
  }, [sendAuthPayload, htmlContent]);

  useEffect(() => {
    const loadContentFromIndexedDB = async () => {
      if (!appletPath || appletPath.startsWith("/Applets/") === false) {
        setLoadedContent("");
        return;
      }

      if (
        typedInitialData?.content &&
        typedInitialData.content.trim().length > 0
      ) {
        setLoadedContent(typedInitialData.content);
        if (instanceId) {
          const appStore = useAppStore.getState();
          appStore.updateInstanceInitialData(instanceId, {
            ...typedInitialData,
            content: "",
          });
        }
        return;
      }

      try {
        const fileMetadata = fileStore.getItem(appletPath);
        if (fileMetadata?.uuid) {
          const contentData = await dbOperations.get<DocumentContent>(
            STORES.APPLETS,
            fileMetadata.uuid
          );

          if (contentData?.content) {
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

              if (instanceId && fetched.windowWidth && fetched.windowHeight) {
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
            setLoadedContent("");
          }
        } else {
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

  useEffect(() => {
    console.log("[AppletViewer] Loaded applet:", {
      path: appletPath,
      contentLength: htmlContent.length,
      hasContent: !!htmlContent,
      loadedFromIndexedDB: !!loadedContent,
    });
  }, [appletPath, htmlContent, loadedContent]);

  const fileItem = appletPath ? fileStore.getItem(appletPath) : undefined;

  const trackedViewsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!appletPath || !htmlContent || htmlContent.trim().length === 0) {
      return;
    }

    if (trackedViewsRef.current.has(appletPath)) {
      return;
    }

    trackedViewsRef.current.add(appletPath);

    const shareId = fileItem?.shareId;
    const parts = appletPath.split("/");
    const fileName = parts[parts.length - 1];
    const title = fileItem?.name || fileName.replace(/\.(html|app)$/i, "");
    const createdBy = fileItem?.createdBy || "";

    track(APPLET_ANALYTICS.VIEW, {
      appletId: shareId || appletPath,
      title: title,
      createdBy: createdBy,
    });
  }, [appletPath, htmlContent, fileItem]);

  const updateCheckedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!appletPath) return;

    const checkUpdate = async (retryCount: number = 0) => {
      const currentFileItem = fileStore.getItem(appletPath);
      const shareId = currentFileItem?.shareId;
      if (!shareId) {
        if (retryCount < 5) {
          setTimeout(() => checkUpdate(retryCount + 1), 500);
        }
        return;
      }

      if (updateCheckedRef.current.has(shareId)) return;

      updateCheckedRef.current.add(shareId);

      const updateApplet = await checkForAppletUpdate(shareId);

      if (updateApplet) {
        const appletName =
          updateApplet.title ||
          updateApplet.name ||
          t("apps.applet-viewer.dialogs.untitledApplet");
        toast.info(t("apps.applet-viewer.dialogs.appletUpdateAvailable"), {
          description: t(
            "apps.applet-viewer.dialogs.appletUpdateAvailableDescription",
            { appletName }
          ),
          action: {
            label: t("apps.applet-viewer.status.update"),
            onClick: async () => {
              const loadingToastId = toast.loading(
                t("apps.applet-viewer.dialogs.updatingApplet"),
                {
                  duration: Infinity,
                }
              );

              try {
                await actions.handleInstall(updateApplet);

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

                updateCheckedRef.current.delete(shareId);
              } catch (error) {
                console.error("Error updating applet:", error);
                toast.error(t("apps.applet-viewer.dialogs.failedToUpdateApplet"), {
                  description:
                    error instanceof Error
                      ? error.message
                      : t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
                  id: loadingToastId,
                });
                updateCheckedRef.current.delete(shareId);
              }
            },
          },
          duration: 8000,
        });
      }
    };

    const timeoutId = setTimeout(() => checkUpdate(0), 1000);
    return () => clearTimeout(timeoutId);
  }, [appletPath, loadedContent, checkForAppletUpdate, actions, fileStore, t]);

  const { getAppletWindowSize, setAppletWindowSize } = useAppletStore();

  const savedSizeFromMetadata =
    fileItem?.windowWidth && fileItem?.windowHeight
      ? { width: fileItem.windowWidth, height: fileItem.windowHeight }
      : undefined;
  const savedSizeFromAppletStore = appletPath
    ? getAppletWindowSize(appletPath)
    : undefined;
  const savedSize = savedSizeFromMetadata || savedSizeFromAppletStore;

  const currentWindowState = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : state.apps["applet-viewer"]
  );

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

  useEffect(() => {
    if (!appletPath || !currentWindowState?.size) return;
    const next = currentWindowState.size;
    const shouldUpdate =
      !savedSize ||
      savedSize.width !== next.width ||
      savedSize.height !== next.height;

    if (shouldUpdate) {
      if (fileItem) {
        fileStore.updateItemMetadata(appletPath, {
          windowWidth: next.width,
          windowHeight: next.height,
        });
      }
      setAppletWindowSize(appletPath, next);
    }
  }, [
    appletPath,
    currentWindowState?.size,
    savedSize,
    fileItem,
    fileStore,
    setAppletWindowSize,
  ]);

  const getFileName = (path: string): string => {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(html|app)$/i, "");
  };

  const getAppletTitle = (content: string, isShared = false): string => {
    if (!content) return "";
    const titleMatch = content.match(/<!--\s*TITLE:\s*([^>]+)-->/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    const titleTagMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      return titleTagMatch[1].trim();
    }
    if (isShared && !appletPath) return "";
    return appletPath ? getFileName(appletPath) : "Untitled";
  };

  const ensureMacFonts = (content: string): string => {
    if (!isMacTheme || !content) return content;
    const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
    const fontStyle = `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>`;

    const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
    if (headCloseIdx !== -1) {
      return (
        content.slice(0, headCloseIdx) +
        preload +
        fontStyle +
        content.slice(headCloseIdx)
      );
    }

    const headOpenMatch = /<head[^>]*>/i.exec(content);
    if (headOpenMatch) {
      const idx = headOpenMatch.index + headOpenMatch[0].length;
      return content.slice(0, idx) + preload + fontStyle + content.slice(idx);
    }

    const htmlOpenMatch = /<html[^>]*>/i.exec(content);
    if (htmlOpenMatch) {
      const idx = htmlOpenMatch.index + htmlOpenMatch[0].length;
      return (
        content.slice(0, idx) +
        `<head>${preload}${fontStyle}</head>` +
        content.slice(idx)
      );
    }

    return `<!DOCTYPE html><html><head>${preload}${fontStyle}</head><body>${content}</body></html>`;
  };

  const injectAppletAuthScript = useCallback((content: string): string => {
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
  }, []);

  const launchApp = useLaunchApp();
  const { saveFile, files } = useFileSystem("/Applets");

  const extractEmojiIcon = (
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

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        let fileText: string;

        const fileExtension = file.name.toLowerCase();
        if (fileExtension.endsWith(".app") || fileExtension.endsWith(".gz")) {
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

            const totalLength = chunks.reduce(
              (acc, chunk) => acc + chunk.length,
              0
            );
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }

            const decoder = new TextDecoder();
            fileText = decoder.decode(combined);
          } catch (decompressError) {
            console.warn(
              "Failed to decompress, treating as plain text:",
              decompressError
            );
            fileText = await file.text();
          }
        } else {
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

        try {
          const jsonData = JSON.parse(fileText);
          if (jsonData.content && typeof jsonData.content === "string") {
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
            content = fileText;
            importFileName = file.name;
          }
        } catch {
          const { metadata, content: extractedContent } =
            extractMetadataFromHtml(fileText);
          content = extractedContent;
          importFileName = file.name;

          if (metadata.shareId) shareId = metadata.shareId;
          if (metadata.name) importFileName = metadata.name;
          if (metadata.icon) icon = metadata.icon;
          if (metadata.createdBy) createdBy = metadata.createdBy;
          if (metadata.windowWidth !== undefined) {
            windowWidth = metadata.windowWidth;
          }
          if (metadata.windowHeight !== undefined) {
            windowHeight = metadata.windowHeight;
          }
          if (metadata.createdAt !== undefined) createdAt = metadata.createdAt;
          if (metadata.modifiedAt !== undefined) {
            modifiedAt = metadata.modifiedAt;
          }
        }

        const { emoji, remainingText } = extractEmojiIcon(importFileName);

        if (!icon && emoji) {
          icon = emoji;
        }
        importFileName = remainingText;

        if (
          importFileName.endsWith(".html") ||
          importFileName.endsWith(".htm") ||
          importFileName.endsWith(".json") ||
          importFileName.endsWith(".gz")
        ) {
          importFileName = importFileName.replace(
            /\.(html|htm|json|gz)$/i,
            ".app"
          );
        } else if (!importFileName.endsWith(".app")) {
          importFileName = `${importFileName}.app`;
        }

        const filePath = `/Applets/${importFileName}`;
        const fileStore = useFilesStore.getState();

        await saveFile({
          name: importFileName,
          path: filePath,
          content: content,
          type: "html",
          icon: icon,
          shareId: shareId,
          createdBy: createdBy || username || undefined,
        });

        if (windowWidth || windowHeight || createdAt || modifiedAt) {
          fileStore.updateItemMetadata(filePath, {
            ...(windowWidth && { windowWidth }),
            ...(windowHeight && { windowHeight }),
            ...(createdAt && { createdAt }),
            ...(modifiedAt && { modifiedAt }),
          });
        }

        const saveEvent = new CustomEvent("saveFile", {
          detail: {
            name: importFileName,
            path: filePath,
            content: content,
            icon: icon,
          },
        });
        window.dispatchEvent(saveEvent);

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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExportAsApp = async () => {
    if (!hasAppletContent) return;

    let filename = appletPath
      ? appletPath
          .split("/")
          .pop()
          ?.replace(/\.(html|app)$/i, "") || "Untitled"
      : "Untitled";

    const fileStore = useFilesStore.getState();
    const currentFile = fileStore.getItem(appletPath);

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

    const fileIcon = currentFile?.icon;
    const isEmojiIcon =
      fileIcon &&
      !fileIcon.startsWith("/") &&
      !fileIcon.startsWith("http") &&
      fileIcon.length <= 10;
    const emojiPrefix = isEmojiIcon ? fileIcon : "📦";
    filename = `${emojiPrefix} ${filename}`;

    try {
      if (typeof CompressionStream === "undefined") {
        throw new Error("CompressionStream API not available in this browser");
      }

      const encoder = new TextEncoder();
      const jsonString = JSON.stringify(exportData, null, 2);
      const inputData = encoder.encode(jsonString);

      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });

      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);

      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }

      const compressedBlob = new Blob(chunks as BlobPart[], {
        type: "application/gzip",
      });

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
        description:
          compressionError instanceof Error
            ? compressionError.message
            : "Could not compress the applet file.",
      });
    }
  };

  const handleExportAsHtml = () => {
    if (!hasAppletContent) return;
    exportAppletAsHtml(htmlContent, appletPath);
  };

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
      const currentFile = files.find((f) => f.path === appletPath);
      const fileItem = appletPath ? fileStore.getItem(appletPath) : null;
      const existingShareId = fileItem?.shareId;
      const fileCreatedBy = fileItem?.createdBy;

      const isAuthor =
        fileCreatedBy &&
        username &&
        fileCreatedBy.toLowerCase() === username.toLowerCase();

      if (existingShareId && !isAuthor) {
        setShareId(existingShareId);
        setIsShareDialogOpen(true);
        toast.success("Applet already shared", {
          description: "Showing existing share link.",
        });
        return;
      }

      const appletTitle = getAppletTitle(htmlContent);
      const appletIcon = currentFile?.icon;
      const appletName =
        currentFile?.name ||
        (appletPath ? getFileName(appletPath) : undefined);

      const windowDimensions = currentWindowState?.size;

      const response = await fetch(getApiUrl("/api/share-applet"), {
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
          shareId: existingShareId && isAuthor ? existingShareId : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to share applet");
      }

      const data = await response.json();
      setShareId(data.id);
      setIsShareDialogOpen(true);

      if (appletPath && data.id) {
        const currentFileItem = fileStore.getItem(appletPath);
        if (currentFileItem) {
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

  useEffect(() => {
    if (shareCode && appletPath) {
      setSharedContent("");

      const fetchSharedApplet = async () => {
        try {
          const response = await fetch(
            getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareCode)}`)
          );

          if (!response.ok) {
            if (response.status === 404) {
              toast.error("Applet not found", {
                description:
                  "The shared applet may have been deleted or the link is invalid.",
              });
            } else {
              throw new Error("Failed to fetch shared applet");
            }
            return;
          }

          const data = await response.json();
          setSharedContent(data.content);
          setSharedName(data.name);
          setSharedTitle(data.title);

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

          if (instanceId && (data.icon || data.name)) {
            const appStore = useAppStore.getState();
            const inst = appStore.instances[instanceId];
            if (inst) {
              const currentData =
                inst.initialData as AppletViewerInitialData | undefined;
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

          const displayName = data.title || data.name || "Shared Applet";
          toast.success("Shared applet loaded", {
            description: displayName,
            action: {
              label: "Save",
              onClick: async () => {
                try {
                  let defaultName = data.name || data.title || "shared-applet";

                  const { remainingText } = extractEmojiIcon(defaultName);
                  defaultName = remainingText;

                  const nameWithExtension = defaultName.endsWith(".app")
                    ? defaultName
                    : `${defaultName}.app`;

                  const filePath = `/Applets/${nameWithExtension}`;

                  const existingApplet = shareCode
                    ? files.find((f) => {
                        const fileItem = fileStore.getItem(f.path);
                        return fileItem?.shareId === shareCode;
                      })
                    : null;

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

                  if (data.windowWidth && data.windowHeight) {
                    fileStore.updateItemMetadata(finalPath, {
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

                  toast.success("Applet saved", {
                    description: `Saved to /Applets/${finalName}`,
                  });
                } catch (error) {
                  console.error("Error saving shared applet:", error);
                  toast.error("Failed to save applet", {
                    description:
                      error instanceof Error
                        ? error.message
                        : "Please try again.",
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
      setSharedContent("");
      setSharedName(undefined);
      setSharedTitle(undefined);
    }
  }, [shareCode]);

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

  const windowTitle = hasAppletContent
    ? shareCode
      ? getAppletTitle(htmlContent, true) ||
        sharedTitle ||
        sharedName ||
        t("apps.applet-viewer.dialogs.sharedApplet")
      : appletPath
      ? getFileName(appletPath)
      : getAppletTitle(htmlContent, false) ||
        t("common.dock.appletStore")
    : t("common.dock.appletStore");

  return {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    shareId,
    setShareId,
    iframeRef,
    currentTheme,
    isXpTheme,
    isMacTheme,
    hasAppletContent,
    htmlContent,
    shareCode,
    windowTitle,
    injectAppletAuthScript,
    ensureMacFonts,
    sendAuthPayload,
    focusWindow,
    handleExportAsApp,
    handleExportAsHtml,
    handleShareApplet,
    handleFileSelect,
    promptSetUsername,
    promptVerifyToken,
    logout,
    updateCount,
    handleCheckForUpdates,
    handleUpdateAll,
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
    getAppletTitle,
  };
}
