/**
 * Shared client-side tool-call dispatch.
 *
 * Both the Chats app (useAiChat) and the floating desktop assistant
 * (useAssistantChat) stream tool calls from /api/chat. This module executes
 * client-side tools and reports outputs back through `addToolOutput`, so all
 * AI surfaces share one implementation.
 */

import { useAppStore } from "@/stores/useAppStore";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import { getDefaultFileApp } from "@/utils/fileAssociations";
import type { DocumentContent } from "@/apps/finder/hooks/useFileSystem";
import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "@/apps/chats/utils/fuzzySearch";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  getIpodTracksForLibrary,
  type IpodLibrarySelection,
  useIpodStore,
} from "@/stores/useIpodStore";
import { markdownToHtml } from "@/utils/markdown";
import { generateJsonFromHtml } from "@/utils/tiptapHtml";
import i18n from "@/lib/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { createClientLogger } from "@/utils/logger";
import { emitAppletUpdated, emitDocumentUpdated } from "@/utils/appEventBus";
import {
  persistChatApplet,
  persistChatDocument,
  type SaveFileHandler,
} from "../utils/chatFilePersistence";
import {
  handleLaunchApp,
  handleCloseApp,
  handleSettings,
  handleMediaControl,
  handleStickiesControl,
  handleInfiniteMacControl,
  handleCalendarControl,
  handleContactsControl,
  type ToolContext,
  type ToolOutputPayload,
  type LaunchAppInput,
  type CloseAppInput,
  type SettingsInput,
  type MediaControlInput,
  type StickiesControlInput,
  type InfiniteMacControlInput,
  type CalendarControlInput,
  type ContactsControlInput,
} from "./index";
import { SERVER_EXECUTED_TOOL_NAME_SET } from "@/shared/tools/serverExecuted";
import {
  createToolOpenResultTracker,
  type DispatchToolCallResult,
} from "./toolOpenResult";

const log = createClientLogger("AIChat");

export interface SharedToolCall {
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface DispatchToolCallContext {
  addToolOutput: (payload: ToolOutputPayload) => void;
  launchApp: ToolContext["launchApp"];
  saveFile: SaveFileHandler;
  onOpenAttempt?: (instanceId: string) => void;
}

async function storedContentToText(
  content: DocumentContent["content"]
): Promise<string> {
  if (typeof content === "string") return content;
  if (content instanceof Blob) return content.text();
  return new TextDecoder().decode(content);
}

const recentlyCreatedTextEditInstances = new Map<
  string,
  { instanceId: string; path: string; timestamp: number }
>();

// Helper to add a newly created instance to tracking
export const trackNewTextEditInstance = (instanceId: string, path: string) => {
  recentlyCreatedTextEditInstances.set(instanceId, {
    instanceId,
    path,
    timestamp: Date.now(),
  });
  // Clean up old entries (older than 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of recentlyCreatedTextEditInstances.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      recentlyCreatedTextEditInstances.delete(id);
    }
  }
};

const getRecentTextEditInstanceForPath = (path: string): string | null => {
  const appStore = useAppStore.getState();
  let newestMatch: { instanceId: string; timestamp: number } | null = null;

  for (const [id, tracked] of recentlyCreatedTextEditInstances.entries()) {
    if (tracked.path !== path) {
      continue;
    }

    const instance = appStore.instances[id];
    if (!instance || !instance.isOpen || instance.appId !== "textedit") {
      recentlyCreatedTextEditInstances.delete(id);
      continue;
    }

    if (!newestMatch || tracked.timestamp > newestMatch.timestamp) {
      newestMatch = { instanceId: id, timestamp: tracked.timestamp };
    }
  }

  return newestMatch?.instanceId ?? null;
};

/**
 * Execute one client-side tool call and report its output back through
 * `addToolOutput`. Server-executed tools are ignored (their results arrive
 * in the stream).
 */
export async function dispatchToolCall(
  toolCall: SharedToolCall,
  ctx: DispatchToolCallContext
): Promise<DispatchToolCallResult> {
  const openResultTracker = createToolOpenResultTracker({
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    context: {
      addToolOutput: ctx.addToolOutput,
      launchApp: ctx.launchApp,
    },
    onOpenAttempt: ctx.onOpenAttempt,
  });
  const { addToolOutput, launchApp } = openResultTracker.context;
  const { saveFile } = ctx;

  // Short delay to allow the UI to render the "call" state
  await new Promise<void>((resolve) => setTimeout(resolve, 120));

  log.debug("Executing client-side tool", {
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
  });

  // Create tool context for extracted handlers
  const toolContext: ToolContext = {
    launchApp,
    addToolOutput,
  };

  try {
    let result: string = "Tool executed successfully";

    if (SERVER_EXECUTED_TOOL_NAME_SET.has(toolCall.toolName)) {
      log.debug("Server-side tool call observed", {
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
      return openResultTracker.getResult();
    }

    switch (toolCall.toolName) {
      case "aquarium": {
        // Visual renders in the message bubble; nothing to do here.
        result = "Aquarium displayed";
        break;
      }
      case "launchApp": {
        result = handleLaunchApp(
          toolCall.input as LaunchAppInput,
          toolCall.toolCallId,
          toolContext
        );
        break;
      }
      case "closeApp": {
        result = handleCloseApp(
          toolCall.input as CloseAppInput,
          toolCall.toolCallId,
          toolContext
        );
        break;
      }
      case "mediaControl": {
        await handleMediaControl(
          toolCall.input as MediaControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "list": {
        const { path, query, limit, librarySource } = toolCall.input as {
          path: string;
          query?: string;
          limit?: number;
          librarySource?: IpodLibrarySelection;
        };

        if (!path) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
          });
          result = "";
          break;
        }

        log.debug("Tool list", { path, query, limit });

        try {
          // Route based on path
          if (path === "/Music") {
            // List the selected iPod library. Karaoke asks for the YouTube
            // slice even when the iPod UI is currently showing Apple Music.
            const ipodStore = useIpodStore.getState();
            const selectedLibrary = librarySource ?? "active";
            const normalizedQuery = query
              ? normalizeSearchText(query.trim())
              : "";
            const queryTokens = normalizedQuery
              ? normalizedQuery.split(/\s+/).filter(Boolean)
              : [];
            const hasQuery = normalizedQuery.length > 0;
            const maxResults = limit
              ? Math.min(Math.max(limit, 1), 50)
              : 25;
            const activeTracks = getIpodTracksForLibrary(ipodStore, selectedLibrary);
            const scoredTracks = activeTracks.map((track) => {
              const fields = [
                track.id,
                track.title,
                track.artist ?? "",
                track.album ?? "",
              ].map(normalizeSearchText);
              const score = hasQuery
                ? fields.reduce(
                    (best, field) =>
                      Math.max(
                        best,
                        computeMatchScore(field, normalizedQuery, queryTokens)
                      ),
                    0
                  )
                : 1;
              return { track, score };
            });
            const scoreThreshold = hasQuery
              ? deriveScoreThreshold(normalizedQuery.length)
              : 0;
            const matchingTracks = scoredTracks
              .filter(({ score }) => score >= scoreThreshold)
              .sort((a, b) => (hasQuery ? b.score - a.score : 0));
            const library = matchingTracks
              .slice(0, maxResults)
              .map(({ track }) => ({
                path: `/Music/${track.id}`,
                id: track.id,
                title: track.title,
                artist: track.artist,
                source:
                  track.source ??
                  (selectedLibrary === "active"
                    ? ipodStore.librarySource
                    : selectedLibrary),
              }));
            const hiddenCount = Math.max(matchingTracks.length - library.length, 0);
            const resolvedLibrary =
              selectedLibrary === "active" ? ipodStore.librarySource : selectedLibrary;
            const libraryName =
              resolvedLibrary === "appleMusic" ? "Apple Music" : "YouTube";

            const resultMessage =
              library.length > 0
                ? `${library.length === 1 
                    ? i18n.t("apps.chats.toolCalls.foundSongsInMusic", { count: library.length })
                    : i18n.t("apps.chats.toolCalls.foundSongsInMusicPlural", { count: library.length })} (${libraryName})${
                    hiddenCount > 0
                      ? `; showing ${library.length} of ${matchingTracks.length}. Use query or limit to narrow results.`
                      : ""
                  }:\n${JSON.stringify(library, null, 2)}`
                : hasQuery
                  ? `No songs matched "${query}" in ${libraryName}.`
                  : i18n.t("apps.chats.toolCalls.musicLibraryEmpty");

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: resultMessage,
            });
            result = "";
          } else if (path === "/Applets Store") {
            // List shared applets from store
            const normalizedKeyword = query
              ? normalizeSearchText(query.trim())
              : "";
            const keywordTokens = normalizedKeyword
              ? normalizedKeyword.split(/\s+/).filter(Boolean)
              : [];
            const hasKeyword = normalizedKeyword.length > 0;
            const maxResults = limit
              ? Math.min(Math.max(limit, 1), 100)
              : 50;

            const response = await abortableFetch(
              getApiUrl("/api/share-applet?list=true"),
              {
                timeout: 15000,
                retry: { maxAttempts: 2, initialDelayMs: 500 },
              }
            );

            const data = await response.json();
            const allApplets: Array<{
              id: string;
              title?: string;
              name?: string;
              icon?: string;
              createdAt?: number;
              createdBy?: string;
            }> = Array.isArray(data?.applets) ? data.applets : [];

            const scoreThreshold = hasKeyword
              ? deriveScoreThreshold(normalizedKeyword.length)
              : 0;

            const scoredApplets = allApplets.map((applet) => {
              const normalizedFields = [
                typeof applet.title === "string" ? normalizeSearchText(applet.title) : "",
                typeof applet.name === "string" ? normalizeSearchText(applet.name) : "",
                typeof applet.createdBy === "string" ? normalizeSearchText(applet.createdBy) : "",
              ].filter((value) => value.length > 0);

              const score = hasKeyword
                ? normalizedFields.reduce((best, field) => {
                    const fieldScore = computeMatchScore(field, normalizedKeyword, keywordTokens);
                    return fieldScore > best ? fieldScore : best;
                  }, 0)
                : 1;

              return { applet, score };
            });

            const filteredApplets = hasKeyword
              ? scoredApplets.filter(({ score }) => score >= scoreThreshold)
              : scoredApplets;

            filteredApplets.sort((a, b) => {
              if (hasKeyword && b.score !== a.score) return b.score - a.score;
              return (b.applet.createdAt ?? 0) - (a.applet.createdAt ?? 0);
            });

            const limitedApplets = filteredApplets.slice(0, maxResults).map(({ applet }) => ({
              path: `/Applets Store/${applet.id}`,
              id: applet.id,
              title: applet.title ?? applet.name ?? "Untitled",
              name: applet.name,
            }));

            const resultMessage = limitedApplets.length > 0
              ? `${limitedApplets.length === 1
                  ? i18n.t("apps.chats.toolCalls.foundSharedApplets", { count: limitedApplets.length })
                  : i18n.t("apps.chats.toolCalls.foundSharedAppletsPlural", { count: limitedApplets.length })}:\n${JSON.stringify(limitedApplets, null, 2)}`
              : hasKeyword
                ? i18n.t("apps.chats.toolCalls.noSharedAppletsMatched", { query })
                : i18n.t("apps.chats.toolCalls.noSharedAppletsAvailable");

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: resultMessage,
            });
            result = "";
          } else if (path === "/Applications") {
            // List installed applications
            const apps = Object.entries(appRegistry).reduce<
              { path: string; name: string }[]
            >((acc, [id, app]) => {
              if (id !== "finder") {
                acc.push({
                  path: `/Applications/${id}`,
                  name: app.name,
                });
              }
              return acc;
            }, []);

            const appsMessage = apps.length === 1
              ? i18n.t("apps.chats.toolCalls.foundApplicationsList", { count: apps.length })
              : i18n.t("apps.chats.toolCalls.foundApplicationsListPlural", { count: apps.length });
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: `${appsMessage}:\n${JSON.stringify(apps, null, 2)}`,
            });
            result = "";
          } else if (path === "/Applets" || path === "/Documents") {
            // List files from file system
            const filesStore = useFilesStore.getState();
            const allItems = Object.values(filesStore.items);

            const files = allItems.filter(
              (item) =>
                item.status === "active" &&
                item.path.startsWith(`${path}/`) &&
                !item.isDirectory &&
                item.path !== `${path}/`,
            );

            const fileList = files.map((file) => ({
              path: file.path,
              name: file.name,
              type: file.type,
            }));

            const fileType = path === "/Applets" ? "applet" : "document";
            const resultMessage = fileList.length > 0
              ? `${fileList.length === 1
                  ? i18n.t("apps.chats.toolCalls.foundFileType", { count: fileList.length, fileType })
                  : i18n.t("apps.chats.toolCalls.foundFileTypePlural", { count: fileList.length, fileType })}:\n${JSON.stringify(fileList, null, 2)}`
              : i18n.t("apps.chats.toolCalls.noFileTypeFound", { fileType, path });

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: resultMessage,
            });
            result = "";
          } else {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: i18n.t("apps.chats.toolCalls.invalidPathForList", { path }),
            });
            result = "";
          }
        } catch (err) {
          console.error("list error:", err);
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.failedToListItems"),
          });
          result = "";
        }
        break;
      }
      case "open": {
        const { path } = toolCall.input as { path: string };

        if (!path) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
          });
          result = "";
          break;
        }

        log.debug("Tool open", { path });

        try {
          // Route based on path prefix
          if (path.startsWith("/Music/")) {
            const songId = path.replace("/Music/", "");
            await handleMediaControl(
              {
                target: "music",
                action: "playKnown",
                id: songId,
              },
              toolCall.toolCallId,
              toolContext,
              toolCall.toolName
            );
            result = "";
          } else if (path.startsWith("/Applets Store/")) {
            // Open shared applet preview
            const shareId = path.replace("/Applets Store/", "");
            
            // Fetch applet metadata to get the name
            let appletName = shareId;
            try {
              const response = await abortableFetch(
                getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`),
                {
                  timeout: 15000,
                  retry: { maxAttempts: 1, initialDelayMs: 250 },
                }
              );
              const data = await response.json();
              appletName = data.title || data.name || shareId;
            } catch {
              // Fall back to shareId if fetch fails
            }
            
            launchApp("applet-viewer", {
              initialData: { path: "", content: "", shareCode: shareId },
            });

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.openedApplet", { appletName }),
            });
            result = "";
          } else if (path.startsWith("/Applications/")) {
            // Launch application
            const appId = path.replace("/Applications/", "") as AppId;
            if (!appRegistry[appId]) {
              throw new Error(`Application not found: ${appId}`);
            }

            launchApp(appId);
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.launchedApp", { appName: getTranslatedAppName(appId) }),
            });
            result = "";
          } else if (path.startsWith("/Applets/")) {
            // Open applet in viewer
            const filesStore = useFilesStore.getState();
            const fileItem = filesStore.items[path];

            if (!fileItem || fileItem.status !== "active") {
              throw new Error(`Applet not found: ${path}`);
            }

            if (!fileItem.uuid) {
              throw new Error(`Applet missing content: ${path}`);
            }

            const contentData = await dbOperations.get<DocumentContent>(
              STORES.APPLETS,
              fileItem.uuid,
            );

            if (!contentData || !contentData.content) {
              throw new Error(`Failed to read applet content: ${path}`);
            }

            const content = await storedContentToText(contentData.content);

            launchApp("applet-viewer", {
              initialData: { path, content },
            });

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.openedFile", { fileName: fileItem.name }),
            });
            result = "";
          } else if (path.startsWith("/Documents/")) {
            // Open document in TextEdit
            const filesStore = useFilesStore.getState();
            const fileItem = filesStore.items[path];
            const appStore = useAppStore.getState();
            const textEditStore = useTextEditStore.getState();

            if (!fileItem || fileItem.status !== "active") {
              throw new Error(`Document not found: ${path}`);
            }

            if (getDefaultFileApp(fileItem) === "preview") {
              launchApp("preview", {
                initialData: { path },
              });
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: i18n.t("apps.chats.toolCalls.openedDocument", {
                  fileName: fileItem.name,
                }),
              });
              result = "";
              break;
            }

            const existingInstanceId = textEditStore.getInstanceIdByPath(path);
            if (existingInstanceId) {
              if (appStore.instances[existingInstanceId]) {
                appStore.bringInstanceToForeground(existingInstanceId);
                openResultTracker.recordOpenedInstance(existingInstanceId);
                addToolOutput({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.openedDocument", {
                    fileName: fileItem.name,
                  }),
                });
                result = "";
                break;
              }

              // Stale reference in TextEdit store; clean it up and continue.
              textEditStore.removeInstance(existingInstanceId);
            }

            // Fallback for write->open races: a freshly launched TextEdit window
            // may not have registered its file path yet.
            const recentInstanceId = getRecentTextEditInstanceForPath(path);
            if (recentInstanceId) {
              appStore.bringInstanceToForeground(recentInstanceId);
              openResultTracker.recordOpenedInstance(recentInstanceId);
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: i18n.t("apps.chats.toolCalls.openedDocument", {
                  fileName: fileItem.name,
                }),
              });
              result = "";
              break;
            }

            if (!fileItem.uuid) {
              throw new Error(`Document missing content: ${path}`);
            }

            const contentData = await dbOperations.get<DocumentContent>(
              STORES.DOCUMENTS,
              fileItem.uuid,
            );

            if (!contentData || !contentData.content) {
              throw new Error(`Failed to read document content: ${path}`);
            }

            const content = await storedContentToText(contentData.content);

            // Pass initialData directly to launchApp (consistent with Terminal/Finder approach).
            // TextEdit handles markdown-to-HTML conversion internally.
            launchApp("textedit", {
              multiWindow: true,
              initialData: { path, content },
            });

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.openedDocument", { fileName: fileItem.name }),
            });
            result = "";
          } else {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: i18n.t("apps.chats.toolCalls.invalidPath", { path }),
            });
            result = "";
          }
        } catch (err) {
          console.error("open error:", err);
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.failedToOpen"),
          });
          result = "";
        }
        break;
      }
      case "read": {
        const { path } = toolCall.input as { path: string };

        if (!path) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
          });
          result = "";
          break;
        }

        log.debug("Tool read", { path });

        try {
          if (path.startsWith("/Applets Store/")) {
            // Fetch shared applet content
            const shareId = path.replace("/Applets Store/", "");
            const response = await abortableFetch(
              getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`),
              {
                timeout: 15000,
                retry: { maxAttempts: 2, initialDelayMs: 500 },
              }
            );

            const data = await response.json();
            const filesStore = useFilesStore.getState();
            const installedEntry = Object.values(filesStore.items).find(
              (item) =>
                item.status === "active" &&
                typeof item.shareId === "string" &&
                item.shareId.toLowerCase() === shareId.toLowerCase(),
            );

            const payload = {
              id: shareId,
              title: data?.title ?? null,
              name: data?.name ?? null,
              icon: data?.icon ?? null,
              createdBy: data?.createdBy ?? null,
              installedPath: installedEntry?.path ?? null,
              content: typeof data?.content === "string" ? data.content : "",
            };

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: JSON.stringify(payload, null, 2),
            });
            result = "";
          } else if (path.startsWith("/Applets/") || path.startsWith("/Documents/")) {
            // Read local file content
            const isApplet = path.startsWith("/Applets/");
            const filesStore = useFilesStore.getState();
            const fileItem = filesStore.items[path];

            if (!fileItem || fileItem.status !== "active") {
              throw new Error(`File not found: ${path}`);
            }

            if (!fileItem.uuid) {
              throw new Error(`File missing content: ${path}`);
            }

            const storeName = isApplet ? STORES.APPLETS : STORES.DOCUMENTS;
            const contentData = await dbOperations.get<DocumentContent>(storeName, fileItem.uuid);

            if (!contentData || contentData.content == null) {
              throw new Error(`Failed to read file content: ${path}`);
            }

            const content = await storedContentToText(contentData.content);

            const fileLabel = isApplet ? i18n.t("apps.chats.toolCalls.applet") : i18n.t("apps.chats.toolCalls.document");
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.fileContent", { fileLabel, fileName: fileItem.name, charCount: content.length }) + `\n\n${content}`,
            });
            result = "";
          } else {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: i18n.t("apps.chats.toolCalls.invalidPathForRead", { path }),
            });
            result = "";
          }
        } catch (err) {
          console.error("read error:", err);
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.failedToReadFile"),
          });
          result = "";
        }
        break;
      }
      case "write": {
        const { path, content, mode = "overwrite" } = toolCall.input as {
          path: string;
          content: string;
          mode?: "overwrite" | "append" | "prepend";
        };

        if (!path) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
          });
          result = "";
          break;
        }

        // Validate path format for documents
        if (!path.startsWith("/Documents/")) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.invalidPathForWrite", { path }),
          });
          result = "";
          break;
        }

        // Validate filename has .md extension
        const fileName = path.split("/").pop() || "";
        if (!fileName.endsWith(".md")) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.invalidFilename", { fileName }),
          });
          result = "";
          break;
        }

        if (!content && mode === "overwrite") {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.noContentProvided"),
          });
          result = "";
          break;
        }

        log.debug("Tool write", { path, mode, contentLength: content?.length });

        try {
          const appStore = useAppStore.getState();
          const textEditStore = useTextEditStore.getState();

          // Check if file exists for append/prepend modes
          const existingItem = useFilesStore.getState().items[path];
          const isNewFile = !existingItem || existingItem.status !== "active";

          // Determine final content based on mode
          let finalContent = content || "";
          if (!isNewFile && mode !== "overwrite" && existingItem?.uuid) {
            const existingData = await dbOperations.get<DocumentContent>(STORES.DOCUMENTS, existingItem.uuid);
            if (existingData?.content) {
              const existingContent = await storedContentToText(
                existingData.content
              );
              finalContent = mode === "prepend"
                ? content + existingContent
                : existingContent + content;
            }
          }

          await persistChatDocument({
            saveFile,
            path,
            fileName,
            content: finalContent,
            icon: existingItem?.icon || "📄",
          });

          // Find existing TextEdit instance for this file
          let targetInstanceId: string | null = null;
          for (const [instanceId, instance] of Object.entries(textEditStore.instances)) {
            if (instance.filePath === path) {
              // Verify instance actually exists in AppStore
              if (appStore.instances[instanceId]) {
                targetInstanceId = instanceId;
              } else {
                // Stale instance reference - clean it up
                textEditStore.removeInstance(instanceId);
              }
              break;
            }
          }

          if (targetInstanceId) {
            // Update existing TextEdit instance with content
            const htmlFragment = markdownToHtml(finalContent);
            const contentJson = await generateJsonFromHtml(htmlFragment);

            textEditStore.updateInstance(targetInstanceId, {
              filePath: path,
              contentJson,
              hasUnsavedChanges: false, // Already saved to disk
            });

            // Dispatch event to update the editor content
            emitDocumentUpdated({
              path,
              content: JSON.stringify(contentJson),
            });

            appStore.bringInstanceToForeground(targetInstanceId);
          } else {
            // Create new TextEdit instance with initialData (same pattern as Finder)
            const windowTitle = fileName.replace(/\.md$/, "") || "Untitled";
            targetInstanceId = appStore.launchApp(
              "textedit",
              { path, content: finalContent },
              windowTitle,
              true
            );
            trackNewTextEditInstance(targetInstanceId, path);
          }

          openResultTracker.recordOpenedInstance(targetInstanceId);
          const outputKey = isNewFile ? "createdDocument" : "updatedDocument";
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: i18n.t(`apps.chats.toolCalls.${outputKey}`, { path }),
          });
          result = "";
        } catch (err) {
          console.error("write error:", err);
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.failedToWriteFile"),
          });
          result = "";
        }
        break;
      }
      case "edit": {
        const { path, old_string, new_string } = toolCall.input as {
          path: string;
          old_string: string;
          new_string: string;
        };

        if (!path || typeof old_string !== "string" || typeof new_string !== "string") {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: i18n.t("apps.chats.toolCalls.missingEditParameters"),
          });
          result = "";
          break;
        }

        log.debug("Tool edit", {
          path,
          oldStringLength: old_string.length,
          newStringLength: new_string.length,
        });

        // Normalize line endings
        const normalizedOldString = old_string.replace(/\r\n?/g, "\n");
        const normalizedNewString = new_string.replace(/\r\n?/g, "\n");

        try {
          if (path.startsWith("/Documents/")) {
            // Edit document - read directly from file system (independent of TextEdit instances)
            const filesStore = useFilesStore.getState();
            const fileItem = filesStore.items[path];

            if (!fileItem || fileItem.status !== "active" || !fileItem.uuid) {
              throw new Error(`Document not found: ${path}. Use write tool to create new documents, or list({ path: "/Documents" }) to see available files.`);
            }

            // Read existing content from IndexedDB
            const contentData = await dbOperations.get<DocumentContent>(STORES.DOCUMENTS, fileItem.uuid);
            if (!contentData?.content) {
              throw new Error(`Failed to read document content: ${path}`);
            }

            const existingContent = await storedContentToText(
              contentData.content
            );

            // Normalize existing content
            const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

            // Check for uniqueness - count occurrences
            const occurrences = normalizedExisting.split(normalizedOldString).length - 1;
            
            if (occurrences === 0) {
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
              });
              result = "";
              break;
            }

            if (occurrences > 1) {
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.oldStringMultipleMatches", { count: occurrences }),
              });
              result = "";
              break;
            }

            // Replace exactly one occurrence
            const updatedContent = normalizedExisting.replace(normalizedOldString, normalizedNewString);

            await persistChatDocument({
              saveFile,
              path,
              fileName: fileItem.name,
              content: updatedContent,
              icon: fileItem.icon || "📄",
            });

            // Also update any open TextEdit instance showing this file
            const textEditState = useTextEditStore.getState();
            for (const [instanceId, instance] of Object.entries(textEditState.instances)) {
              if (instance.filePath === path) {
                const updatedHtml = markdownToHtml(updatedContent);
                const updatedJson = await generateJsonFromHtml(updatedHtml);

                textEditState.updateInstance(instanceId, {
                  contentJson: updatedJson,
                  hasUnsavedChanges: false, // Already saved to disk
                });
                break;
              }
            }

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.editedDocument", { path }),
            });
            result = "";
          } else if (path.startsWith("/Applets/")) {
            // Edit applet HTML
            const filesStore = useFilesStore.getState();
            const fileItem = filesStore.items[path];

            if (!fileItem || fileItem.status !== "active" || !fileItem.uuid) {
              throw new Error(`Applet not found: ${path}. Use generateHtml tool to create new applets, or list({ path: "/Applets" }) to see available files.`);
            }

            const contentData = await dbOperations.get<DocumentContent>(STORES.APPLETS, fileItem.uuid);
            if (!contentData?.content) {
              throw new Error(`Failed to read applet content: ${path}`);
            }

            const existingContent = await storedContentToText(
              contentData.content
            );

            // Normalize existing content
            const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

            // Check for uniqueness - count occurrences
            const occurrences = normalizedExisting.split(normalizedOldString).length - 1;
            
            if (occurrences === 0) {
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
              });
              result = "";
              break;
            }

            if (occurrences > 1) {
              addToolOutput({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.oldStringMultipleMatches", { count: occurrences }),
              });
              result = "";
              break;
            }

            // Replace exactly one occurrence
            const updatedContent = normalizedExisting.replace(normalizedOldString, normalizedNewString);

            await persistChatApplet({
              saveFile,
              fileItem,
              content: updatedContent,
            });

            // Let any open applet viewers hot-reload this edited applet.
            emitAppletUpdated({
              path,
              content: updatedContent,
            });

            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: i18n.t("apps.chats.toolCalls.editedApplet", { path }),
            });
            result = "";
          } else {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: i18n.t("apps.chats.toolCalls.invalidPathForEdit", { path }),
            });
            result = "";
          }
        } catch (err) {
          console.error("edit error:", err);
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.failedToEditFile"),
          });
          result = "";
        }
        break;
      }
      case "settings": {
        handleSettings(
          toolCall.input as SettingsInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "stickiesControl": {
        handleStickiesControl(
          toolCall.input as StickiesControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "infiniteMacControl": {
        await handleInfiniteMacControl(
          toolCall.input as InfiniteMacControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "calendarControl": {
        handleCalendarControl(
          toolCall.input as CalendarControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      case "contactsControl": {
        handleContactsControl(
          toolCall.input as ContactsControlInput,
          toolCall.toolCallId,
          toolContext
        );
        result = "";
        break;
      }
      default:
        console.warn("Unhandled tool call:", toolCall.toolName);
        // Report as error rather than false success to avoid masking
        // missing handler wiring or new server-side tools
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: `Unhandled tool: ${toolCall.toolName}`,
        });
        result = "";
        break;
    }

    if (result) {
      log.debug("Adding client-side tool result", {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        resultLength: result.length,
      });
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      });
    }
    return openResultTracker.getResult();
  } catch (err) {
    console.error("Error executing tool call:", err);
    addToolOutput({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      state: "output-error",
      errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.unknownError"),
    });
    return openResultTracker.getResult();
  }
}
