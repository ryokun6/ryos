import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chat, useChat, type UIMessage } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatInit,
} from "ai";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { getBrowserTimeZone, getBrowserTimeZoneHeaders } from "@/api/core";
import { getApiUrl } from "@/utils/platform";
import {
  getActiveIpodTracks,
  getIpodTracksForLibrary,
  type IpodLibrarySelection,
  setActiveIpodCurrentSongId,
  useIpodStore,
} from "@/stores/useIpodStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  useFileSystem,
  type DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "@/apps/chats/utils/fuzzySearch";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { markdownToHtml } from "@/utils/markdown";
import { generateJsonFromHtml } from "@/utils/tiptapHtml";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { abortableFetch } from "@/utils/abortableFetch";
import { createClientLogger } from "@/utils/logger";
import { tryInvokeParentStartGrindPlanning } from "@/utils/parentGrindPlanning";
import { showAiMessageNotification } from "@/utils/chatNotificationDisplay";
import { shouldShowNativeToastNotification } from "@/utils/nativeToastNotifications";
import {
  emitAppletUpdated,
  emitDocumentUpdated,
} from "@/utils/appEventBus";
import {
  persistChatApplet,
  persistChatDocument,
} from "../utils/chatFilePersistence";
import { getAssistantVisibleText } from "../utils/aiMessageText";
import { useChatSpeechSync } from "./useChatSpeechSync";
import { useSyncedAiMessages } from "./useSyncedAiMessages";
import { getSystemState } from "../utils/systemState";
import {
  handleLaunchApp,
  handleCloseApp,
  handleSettings,
  handleIpodControl,
  handleKaraokeControl,
  handleStickiesControl,
  handleInfiniteMacControl,
  handleCalendarControl,
  handleContactsControl,
  handleTvControl,
  type ToolContext,
  type LaunchAppInput,
  type CloseAppInput,
  type SettingsInput,
  type IpodControlInput,
  type KaraokeControlInput,
  type StickiesControlInput,
  type InfiniteMacControlInput,
  type CalendarControlInput,
  type ContactsControlInput,
  type TvControlInput,
} from "../tools";
import { SERVER_EXECUTED_TOOL_NAME_SET } from "@/shared/tools/serverExecuted";

const log = createClientLogger("AIChat");

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
const trackNewTextEditInstance = (instanceId: string, path: string) => {
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


// Helper to check if chats app is currently in the foreground
const isChatsInForeground = (): boolean => {
  const appStore = useAppStore.getState();
  const foregroundId = appStore.foregroundInstanceId;
  if (!foregroundId) return false;
  const foregroundInstance = appStore.instances[foregroundId];
  return foregroundInstance?.appId === "chats";
};

// Helper to show notification with assistant's message when chat is backgrounded
const showBackgroundedMessageNotification = (message: UIMessage) => {
  const textContent = getAssistantVisibleText(message);
  if (!textContent.trim()) return;

  showAiMessageNotification({
    content: textContent,
    messageId: message.id,
  });
};

// ---------------------------------------------------------------------------
// Shared AI chat instance
//
// Chats and Terminal both call useAiChat(). Each useChat() call used to spin
// up its OWN SDK Chat (separate transport, separate message state, separate
// tool execution) that fought over the single Zustand message store. All
// callers now attach to ONE module-level Chat instance, so messages, status,
// and in-flight streams are genuinely shared.
//
// Chat lifecycle callbacks (tool calls, finish, error) must be configured at
// construction time, but their implementations need per-instance React scope
// (launchApp, file saving, dialogs, toasts). The chat therefore delegates to
// a handler registry: each mounted useAiChat registers its latest handlers,
// and the chats app ("primary") wins over the terminal ("secondary") so
// rate-limit / auth UI state lands in the app that renders it.
// ---------------------------------------------------------------------------
type SharedChatInit = ChatInit<AIChatMessage>;
type SharedOnToolCall = NonNullable<SharedChatInit["onToolCall"]>;
type SharedOnFinish = NonNullable<SharedChatInit["onFinish"]>;
type SharedOnError = NonNullable<SharedChatInit["onError"]>;

interface SharedAiChatHandlers {
  onToolCall: SharedOnToolCall;
  onFinish: SharedOnFinish;
  onError: SharedOnError;
}

type SharedHandlerRole = "primary" | "secondary";

const sharedHandlerRegistry = new Map<
  SharedHandlerRole,
  { readonly current: SharedAiChatHandlers }
>();

const resolveSharedHandlers = (): SharedAiChatHandlers | null =>
  (sharedHandlerRegistry.get("primary") ?? sharedHandlerRegistry.get("secondary"))
    ?.current ?? null;

let sharedAiChat: Chat<AIChatMessage> | null = null;

function getSharedAiChat(): Chat<AIChatMessage> {
  if (!sharedAiChat) {
    sharedAiChat = new Chat<AIChatMessage>({
      // Initialize from the persisted store (hydrated synchronously before
      // first mount); useSyncedAiMessages reconciles afterwards.
      messages: useChatsStore.getState().aiMessages,

      transport: new DefaultChatTransport({
        api: getApiUrl("/api/chat"),
        headers: getBrowserTimeZoneHeaders,
        body: async () => ({
          systemState: getSystemState(),
          model: useAppStore.getState().aiModel,
        }),
      }),

      // Automatically submit when all tool outputs are available
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

      async onToolCall(options) {
        await resolveSharedHandlers()?.onToolCall(options);
      },
      onFinish(options) {
        resolveSharedHandlers()?.onFinish(options);
      },
      onError(error) {
        resolveSharedHandlers()?.onError(error);
      },
    });
  }
  return sharedAiChat;
}

export function useAiChat(onPromptSetUsername?: () => void) {
  const { aiMessages, setAiMessages, username, isAuthenticated } =
    useChatsStoreShallow((state) => ({
      aiMessages: state.aiMessages,
      setAiMessages: state.setAiMessages,
      username: state.username,
      isAuthenticated: state.isAuthenticated,
    }));
  const launchApp = useLaunchApp();
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAudioSettingsStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

  const { t } = useTranslation();
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");

  // Rate limit state
  const [rateLimitError, setRateLimitError] = useState<{
    isAuthenticated: boolean;
    count: number;
    limit: number;
    message: string;
  } | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  const speakFinalAssistantMessageRef = useRef<
    ((message: UIMessage) => void) | null
  >(null);

  // Per-id cache of timestamp-wrapped messages (see messagesWithTimestamps
  // below). Declared before useChat so onFinish can reuse pinned createdAt
  // values instead of minting fresh timestamps for streamed messages.
  const timestampedMessageCacheRef = useRef(
    new Map<
      string,
      { source: UIMessage; createdAt: Date; wrapped: AIChatMessage }
    >()
  );

  // --- AI Chat Hook (Vercel AI SDK v6) ---
  // Attach to the shared module-level Chat (see getSharedAiChat above).
  const {
    messages: currentSdkMessages,
    status,
    error,
    stop: sdkStop,
    clearError,
    setMessages: setSdkMessages,
    sendMessage,
    regenerate,
    addToolOutput,
  } = useChat<AIChatMessage>({
    chat: getSharedAiChat(),
    experimental_throttle: 50,
  });

  // --- Shared chat lifecycle handlers -------------------------------------
  // Defined as plain closures (not useCallback) and snapshotted into
  // handlersRef on every render, so the shared chat always invokes the
  // latest instance scope without giant dependency arrays.
  const handleSharedToolCall: SharedOnToolCall = async ({ toolCall }) => {
      // Client-side tool execution requires returning output to the chat.
      // Short delay to allow the UI to render the "call" state
      await new Promise<void>((resolve) => setTimeout(resolve, 120));

      log.debug("Executing client-side tool", {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
      });

      // Create tool context for extracted handlers
      const toolContext: ToolContext = {
        launchApp: (appId, options) => launchApp(appId as AppId, options),
        addToolOutput,
      };

      try {
        let result: string = "Tool executed successfully";

        if (SERVER_EXECUTED_TOOL_NAME_SET.has(toolCall.toolName)) {
          log.debug("Server-side tool call observed", {
            toolName: toolCall.toolName,
            input: toolCall.input,
          });
          return;
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
          case "ipodControl": {
            await handleIpodControl(
              toolCall.input as IpodControlInput,
              toolCall.toolCallId,
              toolContext
            );
            result = "";
            break;
          }
          case "karaokeControl": {
            await handleKaraokeControl(
              toolCall.input as KaraokeControlInput,
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
                // Play iPod song by ID
                const songId = path.replace("/Music/", "");
                const ipodState = useIpodStore.getState();
                const track = getActiveIpodTracks(ipodState).find((t) => t.id === songId);

                if (!track) {
                  throw new Error(`Song not found: ${songId}`);
                }

                // Ensure iPod is open
                const appState = useAppStore.getState();
                const ipodInstances = appState.getInstancesByAppId("ipod");
                if (!ipodInstances.some((inst) => inst.isOpen)) {
                  launchApp("ipod");
                }

                setActiveIpodCurrentSongId(ipodState, songId);
                ipodState.setIsPlaying(true);

                const playingMessage = track.artist
                  ? i18n.t("apps.chats.toolCalls.playingTrackByArtist", { title: track.title, artist: track.artist })
                  : i18n.t("apps.chats.toolCalls.playingTrack", { title: track.title });
                addToolOutput({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: playingMessage,
                });
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

                const existingInstanceId = textEditStore.getInstanceIdByPath(path);
                if (existingInstanceId) {
                  if (appStore.instances[existingInstanceId]) {
                    appStore.bringInstanceToForeground(existingInstanceId);
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
          case "tvControl": {
            await handleTvControl(
              toolCall.input as TvControlInput,
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
      } catch (err) {
        console.error("Error executing tool call:", err);
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.unknownError"),
        });
      }
    };

  const handleSharedFinish: SharedOnFinish = ({ messages, isError }) => {
      // Ensure all messages have metadata with createdAt. Prefer the
      // timestamp pinned while the message was streaming so it doesn't jump
      // to the finish time.
      const finalMessages: AIChatMessage[] = (messages as UIMessage[]).map(
        (msg) =>
          ({
            ...msg,
            metadata: {
              createdAt:
                (msg as AIChatMessage).metadata?.createdAt ||
                timestampedMessageCacheRef.current.get(msg.id)?.createdAt ||
                new Date(),
            },
          }) as AIChatMessage,
      );
      log.debug("AI finished, syncing messages", {
        messageCount: finalMessages.length,
      });
      setAiMessages(finalMessages);

      const lastMsg = finalMessages.at(-1);
      if (!lastMsg || lastMsg.role !== "assistant") return;

      // Recovery for AI SDK v6 bug (GitHub issue #10291):
      // When stopWhen + tool calls trigger a TypeValidationError, the SDK
      // sets isError=true and skips the built-in sendAutomaticallyWhen check.
      // For server-side tools whose results arrived via the stream, we need
      // to re-affirm them via addToolOutput so sendAutomaticallyWhen fires.
      // Only target server-side tools (client-side tools already called
      // addToolOutput from their handlers, so they don't need recovery).
      if (isError) {
        const toolParts = lastMsg.parts.filter(
          (part: { type?: string; state?: string }) =>
            typeof part.type === "string" &&
            part.type.startsWith("tool-") &&
            (part.state === "output-available" ||
              part.state === "output-error") &&
            SERVER_EXECUTED_TOOL_NAME_SET.has((part.type as string).replace(/^tool-/, "")),
        );
        if (toolParts.length > 0) {
          log.debug("Re-affirming server-side tool outputs after stream error", {
            toolPartCount: toolParts.length,
          });
          for (const part of toolParts) {
            const tp = part as {
              type: string;
              toolCallId: string;
              state: string;
              output?: unknown;
              errorText?: string;
            };
            const toolName = tp.type.replace(/^tool-/, "");
            if (tp.state === "output-error") {
              addToolOutput({
                tool: toolName,
                toolCallId: tp.toolCallId,
                state: "output-error",
                errorText: tp.errorText || "Tool execution failed",
              });
            } else {
              addToolOutput({
                tool: toolName,
                toolCallId: tp.toolCallId,
                output: tp.output,
              });
            }
          }
        }
      }

      void shouldShowNativeToastNotification().then((shouldShowDesktop) => {
        if (!isChatsInForeground() || shouldShowDesktop) {
          showBackgroundedMessageNotification(lastMsg);
        }
      });

      speakFinalAssistantMessageRef.current?.(lastMsg);
    };

  const handleSharedError: SharedOnError = (err) => {
      // Workaround for AI SDK v6 bug with stopWhen and tool calls (GitHub issue #10291)
      // The finish event emits {"type":"finish","finishReason":"tool-calls"} which fails validation
      // This is a known issue and the error can be safely ignored as the chat still works
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        errorMessage.includes("AI_TypeValidationError") ||
        errorMessage.includes("Type validation failed")
      ) {
        console.warn("[AI SDK v6 Bug] Type validation error (ignored):", errorMessage.substring(0, 100) + "...");
        return; // Ignore this error - it's a known SDK issue
      }

      console.error("AI Chat Error:", err);

      // Helper function to handle authentication errors consistently
      const handleAuthError = (message?: string) => {
        console.error("Authentication error - clearing invalid session");

        // Clear auth state (cookie will be cleared server-side on next request)
        useChatsStore.getState().setAuthenticated(false);

        // Show user-friendly error message with action button
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description:
            message || i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 5000,
          action: onPromptSetUsername
            ? {
                label: i18n.t("apps.chats.toasts.loginButton"),
                onClick: onPromptSetUsername,
              }
            : undefined,
        });

        // Prompt for username
        setNeedsUsername(true);
      };

      // Check if this is a rate limit error (status 429)
      // The AI SDK wraps errors in a specific format
      if (err.message) {
        // Try to extract the JSON error body from the error message
        // The AI SDK typically includes the response body in the error message
        const jsonMatch = err.message.match(/\{.*\}/);

        if (jsonMatch) {
          try {
            const errorData = JSON.parse(jsonMatch[0]);

            if (errorData.error === "rate_limit_exceeded") {
              setRateLimitError(errorData);

              // If anonymous user hit limit, set flag to require username
              if (!errorData.isAuthenticated) {
                setNeedsUsername(true);
              }

              // Don't show the raw error, just indicate that rate limit was hit
              // The UI will handle showing the proper message
              return; // Exit early to prevent showing generic error toast
            }

            // Handle authentication failed error
            if (
              errorData.error === "authentication_failed" ||
              errorData.error === "unauthorized" ||
              errorData.error === "username mismatch"
            ) {
              handleAuthError(i18n.t("apps.chats.toasts.sessionExpiredLoginAgain"));
              return; // Exit early to prevent showing generic error toast
            }
          } catch (parseError) {
            console.error("Failed to parse error response:", parseError);
          }
        }

        // Check if error message contains 429 status
        if (
          err.message.includes("429") ||
          err.message.includes("rate_limit_exceeded")
        ) {
          // Generic rate limit message if we couldn't parse the details
          setNeedsUsername(true);
          toast.error(i18n.t("apps.chats.toasts.rateLimitExceeded"), {
            description: i18n.t("apps.chats.toasts.rateLimitMessageLimitLogin"),
            duration: 5000,
            action: onPromptSetUsername
              ? {
                  label: i18n.t("apps.chats.toasts.loginButton"),
                  onClick: onPromptSetUsername,
                }
              : undefined,
          });
          return;
        }

        // Check if error message contains 401 status (authentication error)
        // This catches various 401 error formats
        if (
          err.message.includes("401") ||
          err.message.includes("Unauthorized") ||
          err.message.includes("unauthorized") ||
          err.message.includes("authentication_failed") ||
          err.message.includes("Authentication failed") ||
          err.message.includes("username mismatch") ||
          err.message.includes("Username mismatch")
        ) {
          handleAuthError();
          return;
        }
      }

      // For non-rate-limit errors, show the generic error toast
      toast.error(i18n.t("apps.chats.toasts.aiError"), {
        description:
          err.message || i18n.t("apps.chats.toasts.failedToGetResponse"),
      });
    };

  // Register this instance's handlers with the shared chat. The chats app
  // (identified by passing onPromptSetUsername) is "primary" and takes
  // precedence over the terminal's "secondary" registration, so dialogs and
  // rate-limit state land in the UI that displays them.
  const sharedHandlersRef = useRef<SharedAiChatHandlers>({
    onToolCall: handleSharedToolCall,
    onFinish: handleSharedFinish,
    onError: handleSharedError,
  });
  sharedHandlersRef.current = {
    onToolCall: handleSharedToolCall,
    onFinish: handleSharedFinish,
    onError: handleSharedError,
  };
  const sharedHandlerRole: SharedHandlerRole = onPromptSetUsername
    ? "primary"
    : "secondary";
  useEffect(() => {
    sharedHandlerRegistry.set(sharedHandlerRole, sharedHandlersRef);
    return () => {
      if (sharedHandlerRegistry.get(sharedHandlerRole) === sharedHandlersRef) {
        sharedHandlerRegistry.delete(sharedHandlerRole);
      }
    };
  }, [sharedHandlerRole]);

  // Ensure all messages have metadata with timestamps (runs synchronously during render).
  // The per-id cache keeps referential identity stable across streaming ticks:
  // only messages whose underlying SDK object changed get a new wrapper, so
  // memoized message rows don't re-render ~20x/sec for the whole thread while
  // one message (e.g. a long applet) is streaming. It also pins `createdAt`
  // for messages that arrive without metadata instead of minting a new Date
  // on every render.
  const messagesWithTimestamps = useMemo<AIChatMessage[]>(() => {
    const previousCache = timestampedMessageCacheRef.current;
    const nextCache = new Map<
      string,
      { source: UIMessage; createdAt: Date; wrapped: AIChatMessage }
    >();
    const storeCreatedAtById = new Map<string, Date>();
    for (const m of aiMessages) {
      if (m.metadata?.createdAt) {
        storeCreatedAtById.set(m.id, m.metadata.createdAt);
      }
    }

    const result = (currentSdkMessages as UIMessage[]).map((msg) => {
      const currentMsg = msg as AIChatMessage;
      const cached = previousCache.get(msg.id);
      const createdAt =
        currentMsg.metadata?.createdAt ||
        cached?.createdAt ||
        storeCreatedAtById.get(msg.id) ||
        new Date();

      if (cached && cached.source === msg && cached.createdAt === createdAt) {
        nextCache.set(msg.id, cached);
        return cached.wrapped;
      }

      const wrapped =
        currentMsg.metadata?.createdAt === createdAt
          ? currentMsg
          : ({
              ...msg,
              metadata: {
                ...currentMsg.metadata,
                createdAt,
              },
            } as AIChatMessage);
      nextCache.set(msg.id, { source: msg, createdAt, wrapped });
      return wrapped;
    });

    timestampedMessageCacheRef.current = nextCache;
    return result;
  }, [currentSdkMessages, aiMessages]);

  // Ref to hold the latest SDK messages for use in callbacks
  const currentSdkMessagesRef = useRef<AIChatMessage[]>([]);
  currentSdkMessagesRef.current = messagesWithTimestamps;

  useSyncedAiMessages({
    aiMessages,
    currentMessages: currentSdkMessages as UIMessage[],
    setMessages: setSdkMessages as (messages: AIChatMessage[]) => void,
  });

  const isLoading = status === "streaming" || status === "submitted";
  const {
    highlightSegment,
    isSpeaking,
    markAssistantMessageProcessed,
    resetSpeechState,
    speakAssistantMessageManually,
    speakFinalAssistantMessage,
    stopSpeech,
  } = useChatSpeechSync({
    aiMessages,
    currentMessages: currentSdkMessages as UIMessage[],
    isLoading,
    speechEnabled,
  });
  speakFinalAssistantMessageRef.current = speakFinalAssistantMessage;

  // Clear rate limit error when username is set
  useEffect(() => {
    if (username && needsUsername) {
      setNeedsUsername(false);
      setRateLimitError(null);
    }
  }, [username, needsUsername]);

  // --- Action Handlers ---
  const handleSubmitMessage = useCallback(
    async (messageContent: string, imageContent: string | null = null) => {
      if (!messageContent.trim() && !imageContent) return false; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !username) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return false;
      }

      // Check if user is authenticated (cookies handle auth automatically)
      if (username && !isAuthenticated) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return false;
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      // Proceed with the actual submission using useChat v5
      const freshSystemState = getSystemState();
      log.debug("Submitting AI chat", {
        model: aiModel,
        hasImage: Boolean(imageContent),
        systemStateSummary: {
          username: Boolean(freshSystemState.username),
          foregroundApp: freshSystemState.runningApps.foreground?.appId ?? null,
          backgroundAppCount: freshSystemState.runningApps.background.length,
          textEditInstanceCount: freshSystemState.textEdit.instances.length,
          hasInternetExplorerMarkdown: Boolean(
            freshSystemState.internetExplorer.aiGeneratedMarkdown
          ),
          hasIpodLyrics: Boolean(freshSystemState.ipod.currentLyrics),
        },
      });

      // Host iframe: delegate planning to parent when available (no image path)
      if (!imageContent) {
        const delegated = tryInvokeParentStartGrindPlanning({
          text: messageContent,
          model: aiModel,
          systemState: freshSystemState,
        });
        if (delegated) {
          return true;
        }
      }

      // Build message content - text and optionally image
      if (imageContent) {
        // Extract media type from data URL (e.g., "data:image/png;base64,..." -> "image/png")
        const mediaTypeMatch = imageContent.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/png";
        
        // Send message with image attachment using files array
        sendMessage(
          {
            text: messageContent.trim() || t("apps.chats.status.describeThisImage"),
            files: [
              {
                type: "file" as const,
                mediaType,
                url: imageContent, // Data URL is accepted
              },
            ],
            metadata: {
              createdAt: new Date(),
            },
          },
          {
            body: {
              systemState: freshSystemState,
              model: aiModel,
            },
          },
        );
      } else {
        // Send text-only message
        sendMessage(
          {
            text: messageContent,
            metadata: {
              createdAt: new Date(),
            },
          },
          {
            body: {
              systemState: freshSystemState,
              model: aiModel,
            },
          },
        );
      }
      return true;
    },
    [
      sendMessage,
      needsUsername,
      username,
      isAuthenticated,
      aiModel,
      t,
    ],
  );

  const handleDirectMessageSubmit = useCallback(
    async (message: string) => {
      if (!message.trim()) return; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !username) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return;
      }

      // Check if user is authenticated (cookies handle auth automatically)
      if (username && !isAuthenticated) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return;
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      const delegated = tryInvokeParentStartGrindPlanning({
        text: message,
        model: aiModel,
        systemState: getSystemState(),
      });
      if (delegated) {
        return;
      }

      // Proceed with the actual submission using useChat v5
      log.debug("Sending direct message to AI chat", { model: aiModel });
      sendMessage(
        {
          text: message,
          metadata: {
            createdAt: new Date(),
          },
        },
        {
          body: {
            systemState: getSystemState(),
            model: aiModel,
          },
        },
      );
    },
    [sendMessage, needsUsername, username, isAuthenticated, aiModel],
  );

  const handleNudge = useCallback(() => {
    handleDirectMessageSubmit(t("apps.chats.status.nudgeSent"));
    // Consider adding shake effect trigger here if needed
  }, [handleDirectMessageSubmit, t]);

  const clearChats = useCallback(() => {
    log.debug("Clearing AI chats", { messageCount: aiMessages.length });

    // --- Extract memories before clearing (async, fire and forget) ---
    // Capture current messages before we clear them
    const messagesToAnalyze = [...aiMessages];
    const currentUsername = username;
    const currentTimeZone = getBrowserTimeZone() || "UTC";

    // Only extract if user is logged in and there are messages worth analyzing
    if (currentUsername && isAuthenticated && messagesToAnalyze.length > 2) {
      log.debug("Triggering async memory extraction", {
        messageCount: messagesToAnalyze.length,
      });

      abortableFetch(getApiUrl("/api/ai/extract-memories"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Timezone": currentTimeZone,
        },
        body: JSON.stringify({
          timeZone: currentTimeZone,
          messages: messagesToAnalyze.map(msg => ({
            role: msg.role,
            parts: msg.parts,
            metadata: msg.metadata?.createdAt
              ? {
                  createdAt:
                    msg.metadata.createdAt instanceof Date
                      ? msg.metadata.createdAt.toISOString()
                      : msg.metadata.createdAt,
                }
              : undefined,
          })),
        }),
        timeout: 65000,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      })
        .then(res => res.json())
        .then(data => {
          if (data.extracted > 0) {
            log.debug("Extracted memories from conversation", {
              extracted: data.extracted,
            });
          } else {
            log.debug("No memories extracted", {
              hasMessage: Boolean(data.message),
            });
          }
        })
        .catch(err => {
          console.warn("[clearChats] Memory extraction failed (non-blocking):", err);
        });

    }

    // Stop any in-flight stream first. Otherwise the AI SDK keeps appending to
    // its message list after we reset it below, and `useSyncedAiMessages`
    // refuses to overwrite a longer SDK list with the cleared store snapshot —
    // making the old conversation reappear right after "Clear Chat".
    sdkStop();

    // Clear the AI SDK error state (e.g. the inline red error / retry block).
    // Without this, a previous failed turn's error stays visible after clearing.
    clearError();

    // Clear the non-SDK error channels surfaced below the input so the footer
    // doesn't keep showing a stale rate-limit / login prompt after clearing.
    setRateLimitError(null);
    setNeedsUsername(false);

    // Reset speech and highlight state so the next reply starts clean.
    resetSpeechState();

    // Define the initial message and mark it as fully processed so it is never spoken
    const initialMessage: AIChatMessage = {
      id: "1", // Ensure consistent ID for the initial message
      role: "assistant",
      parts: [{ type: "text", text: i18n.t("apps.chats.messages.greeting") }],
      metadata: {
        createdAt: new Date(),
      },
    };
    markAssistantMessageProcessed(initialMessage);

    // Update both the Zustand store and the SDK state directly
    setAiMessages([initialMessage]);
    setSdkMessages([initialMessage]);
  }, [
    setAiMessages,
    setSdkMessages,
    sdkStop,
    clearError,
    setRateLimitError,
    setNeedsUsername,
    resetSpeechState,
    markAssistantMessageProcessed,
    aiMessages,
    username,
    isAuthenticated,
  ]);

  const confirmClearChats = useCallback(() => {
    setIsClearDialogOpen(false);
    // Add small delay for dialog close animation
    setTimeout(() => {
      clearChats();
    }, 100);
  }, [clearChats]);

  const handleSaveTranscript = useCallback(() => {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase()
      .replace(":", "-")
      .replace(" ", "");
    setSaveFileName(`chat-${date}-${time}.md`);
    setIsSaveDialogOpen(true);
  }, []);

  const handleSaveSubmit = useCallback(
    async (fileName: string) => {
      // Use messagesWithTimestamps from ref to get messages with proper timestamps
      const messagesForTranscript = currentSdkMessagesRef.current;
      const transcript = messagesForTranscript
        .map((msg: AIChatMessage) => {
          const createdAt = msg.metadata?.createdAt;
          const time = createdAt
            ? new Date(createdAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "";
          const sender = msg.role === "user" ? username || "You" : "Ryo";
          const content = getAssistantVisibleText(msg);
          return `**${sender}** (${time}):\n${content}`;
        })
        .join("\n\n");

      const finalFileName = fileName.endsWith(".md")
        ? fileName
        : `${fileName}.md`;
      const filePath = `/Documents/${finalFileName}`;

      // Check if file already exists to determine toast message
      const existingFile = useFilesStore.getState().items[filePath];
      const isUpdate = existingFile && existingFile.status === "active";

      try {
        await saveFile({
          path: filePath,
          name: finalFileName,
          content: transcript,
          type: "markdown", // Explicitly set type
          icon: "/icons/file-text.png",
        });

        setIsSaveDialogOpen(false);
        toast.success(
          isUpdate
            ? i18n.t("apps.chats.toasts.transcriptUpdated")
            : i18n.t("apps.chats.toasts.transcriptSaved"),
          {
            description: i18n.t("apps.chats.toasts.savedToFileName", {
              fileName: finalFileName,
            }),
            duration: 5000,
            action: {
              label: i18n.t("apps.chats.toasts.open"),
              onClick: () => {
              // Check if this file is already open in a TextEdit instance
              const textEditStore = useTextEditStore.getState();
              const existingInstanceId = textEditStore.getInstanceIdByPath(filePath);

              if (existingInstanceId) {
                // Verify the instance actually exists in AppStore
                const appStore = useAppStore.getState();
                const instanceExists = !!appStore.instances[existingInstanceId];

                if (instanceExists) {
                  // File is already open - update content and bring to foreground
                  appStore.updateInstanceInitialData(existingInstanceId, {
                    path: filePath,
                    content: transcript,
                  });
                  appStore.bringInstanceToForeground(existingInstanceId);
                } else {
                  // Stale instance reference - clean it up and open new instance
                  textEditStore.removeInstance(existingInstanceId);
                  launchApp("textedit", {
                    initialData: { path: filePath, content: transcript },
                  });
                }
              } else {
                // File not open - launch new TextEdit instance
                launchApp("textedit", {
                  initialData: { path: filePath, content: transcript },
                });
              }
            },
          },
        });
      } catch (error) {
        console.error("Error saving transcript:", error);
        toast.error(i18n.t("apps.chats.toasts.failedToSaveTranscript"), {
          description:
            error instanceof Error
              ? error.message
              : i18n.t("apps.chats.toasts.unknownError"),
        });
      }
    },
    [username, saveFile, launchApp],
  );

  // Stop both chat streaming and TTS queue
  const stop = useCallback(() => {
    sdkStop();
    stopSpeech();
  }, [sdkStop, stopSpeech]);

  const getLiveMessages = useCallback(
    () => currentSdkMessagesRef.current,
    []
  );

  const patchLiveMessages = useCallback(
    (messages: AIChatMessage[]) => {
      setSdkMessages(messages);
    },
    [setSdkMessages]
  );

  return {
    // AI Chat State & Actions
    messages: messagesWithTimestamps, // Return messages with timestamps
    handleSubmitMessage,
    isLoading,
    reload: regenerate, // Map v5 regenerate to v4 reload
    error,
    stop,
    append: sendMessage, // Map v5 sendMessage to v4 append (for compatibility)
    handleDirectMessageSubmit,
    handleNudge,
    clearChats, // Expose the action
    handleSaveTranscript, // Expose the action


    // Rate limit state
    rateLimitError,
    needsUsername,

    // Dialogs
    isClearDialogOpen,
    setIsClearDialogOpen,
    confirmClearChats,

    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    handleSaveSubmit,

    isSpeaking,

    highlightSegment,
    speakAssistantMessageManually,
    stopSpeech,

    getLiveMessages,
    patchLiveMessages,
  };
}
