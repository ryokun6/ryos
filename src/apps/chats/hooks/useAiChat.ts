import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChatsStore } from "../../../stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { getApiUrl } from "@/utils/platform";
import { useIpodStore } from "@/stores/useIpodStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useFilesStore } from "@/stores/useFilesStore";
import { useChatsStoreShallow } from "@/stores/helpers";
import { detectUserOS } from "@/utils/userOS";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  computeMatchScore,
  deriveScoreThreshold,
  normalizeSearchText,
} from "../utils/searchScoring";
import {
  getAssistantVisibleText,
  isChatsInForeground,
  showBackgroundedMessageNotification,
} from "../utils/messageNotifications";
import { buildChatTranscript } from "../utils/chatTranscript";
import {
  areMessageIdListsEqual,
  collectCompletedLineSegments,
  classifyChatError,
  cleanTextForSpeech,
  mergeMessagesWithTimestamps,
  type RateLimitErrorState,
} from "../utils/chatRuntime";
import { getSystemState } from "../utils/systemState";
import {
  readLocalFileTextOrThrow,
} from "../utils/localFileContent";
import {
  resolveToolErrorText,
  validateFileEditInput,
} from "../utils/chatFileToolValidation";
import { executeChatFileEditOperation } from "../utils/chatFileEditOperation";
import { executeChatFileWriteOperation } from "../utils/chatFileWriteOperation";
import { syncTextEditDocumentForPath } from "../utils/textEditDocumentSync";
import {
  handleLaunchApp,
  handleCloseApp,
  handleSettings,
  handleIpodControl,
  handleKaraokeControl,
  handleStickiesControl,
  handleInfiniteMacControl,
  type ToolContext,
  type LaunchAppInput,
  type CloseAppInput,
  type SettingsInput,
  type IpodControlInput,
  type KaraokeControlInput,
  type StickiesControlInput,
  type InfiniteMacControlInput,
} from "../tools";

/**
 * NOTE: Future refactoring opportunity (tracked in codebase analysis)
 * 
 * Consider consolidating more state from ChatsAppComponent into this hook:
 * - AI chat state (currently using useChat hook here)
 * - Message processing (app control markup)
 * - System state generation
 * - Dialog states (clear, save)
 * 
 * This would make the component lighter and improve testability.
 * Priority: Low - current architecture works well for the use case.
 */

export function useAiChat(onPromptSetUsername?: () => void) {
  const { aiMessages, setAiMessages, username, authToken, ensureAuthToken } =
    useChatsStoreShallow((state) => ({
      aiMessages: state.aiMessages,
      setAiMessages: state.setAiMessages,
      username: state.username,
      authToken: state.authToken,
      ensureAuthToken: state.ensureAuthToken,
    }));
  const launchApp = useLaunchApp();
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAudioSettingsStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

  // Local input state (SDK v5 no longer provides this)
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const loginToastAction = useMemo(
    () =>
      onPromptSetUsername
        ? {
            label: "Login",
            onClick: onPromptSetUsername,
          }
        : undefined,
    [onPromptSetUsername],
  );
  const handleInputChange = useCallback(
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
      setInput(e.target.value);
    },
    [],
  );
  const handleImageChange = useCallback((imageData: string | null) => {
    setSelectedImage(imageData);
  }, []);

  // Track how many characters of each assistant message have already been sent to TTS
  const speechProgressRef = useRef<Record<string, number>>({});

  // Currently highlighted chunk for UI animation
  const [highlightSegment, setHighlightSegment] = useState<{
    messageId: string;
    start: number;
    end: number;
  } | null>(null);

  // Queue of upcoming highlight segments awaiting playback completion
  const highlightQueueRef = useRef<
    {
      messageId: string;
      start: number;
      end: number;
    }[]
  >([]);

  // On first mount, mark any assistant messages already present as fully processed
  useEffect(() => {
    aiMessages.forEach((msg) => {
      if (msg.role === "assistant") {
        const content = getAssistantVisibleText(msg);
        speechProgressRef.current[msg.id] = content.length; // mark as fully processed
      }
    });
  }, [aiMessages]);

  // Note: We no longer auto-call ensureAuthToken here.
  // Tokens are obtained via:
  // 1. createUser (new account registration)
  // 2. authenticateWithPassword (password login)
  // 3. Token login (user provides existing token)
  // The ensureAuthToken function is only called explicitly before sending
  // messages as a fallback for legacy users without tokens.

  // Queue-based TTS – speaks chunks as they arrive
  const { speak, stop: stopTts, isSpeaking } = useTtsQueue();

  // Rate limit state
  const [rateLimitError, setRateLimitError] = useState<RateLimitErrorState | null>(
    null,
  );
  const [needsUsername, setNeedsUsername] = useState(false);

  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: getApiUrl("/api/chat"),
      headers: async () => {
        const { username: currentUsername, authToken: currentToken } =
          useChatsStore.getState();

        if (!currentUsername) {
          return {} as Record<string, string>;
        }

        const headers: Record<string, string> = {
          "X-Username": currentUsername,
        };

        if (currentToken) {
          headers.Authorization = `Bearer ${currentToken}`;
        }

        return headers;
      },
      body: async () => ({
        systemState: getSystemState(),
        model: useAppStore.getState().aiModel,
      }),
    });
  }, []);

  // --- AI Chat Hook (Vercel AI SDK v5) ---
  // Store reference to setHighlightSegment for use in callbacks
  const setHighlightSegmentRef = useRef(setHighlightSegment);
  setHighlightSegmentRef.current = setHighlightSegment;

  const handleChatError = useCallback(
    (err: Error) => {
      // Workaround for AI SDK v6 bug with stopWhen and tool calls (GitHub issue #10291)
      // The finish event emits {"type":"finish","finishReason":"tool-calls"} which fails validation
      // This is a known issue and the error can be safely ignored as the chat still works
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error("AI Chat Error:", err);

      // Helper function to handle authentication errors consistently
      const handleAuthError = (message?: string) => {
        console.error("Authentication error - clearing invalid token");

        // Clear the invalid auth token
        const setAuthToken = useChatsStore.getState().setAuthToken;
        setAuthToken(null);

        // Show user-friendly error message with action button
        toast.error("Login Required", {
          description: message || "Please login to continue chatting.",
          duration: 5000,
          action: loginToastAction,
        });

        // Prompt for username
        setNeedsUsername(true);
      };

      const classification = classifyChatError(errorMessage);
      switch (classification.kind) {
        case "ignore_type_validation":
          console.warn(
            "[AI SDK v6 Bug] Type validation error (ignored):",
            errorMessage.substring(0, 100) + "...",
          );
          return;
        case "rate_limit":
          setRateLimitError(classification.payload);
          if (!classification.payload.isAuthenticated) {
            setNeedsUsername(true);
          }

          if (!classification.parsed) {
            toast.error("Rate Limit Exceeded", {
              description:
                "You've reached the message limit. Please login to continue.",
              duration: 5000,
              action: loginToastAction,
            });
          }
          return;
        case "auth":
          handleAuthError(classification.message);
          return;
        default:
          break;
      }

      // For non-rate-limit errors, show the generic error toast
      toast.error("AI Error", {
        description: errorMessage || "Failed to get response.",
      });
    },
    [loginToastAction],
  );

  const {
    messages: currentSdkMessages,
    status,
    error,
    stop: sdkStop,
    setMessages: setSdkMessages,
    sendMessage,
    regenerate,
    addToolResult,
  } = useChat({
    // Initialize from store
    messages: aiMessages,

    experimental_throttle: 50,

    // Automatically submit when all tool results are available
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    transport: chatTransport,

    async onToolCall({ toolCall }) {
      // In AI SDK 5, client-side tool execution requires calling addToolResult
      // Short delay to allow the UI to render the "call" state
      await new Promise<void>((resolve) => setTimeout(resolve, 120));

      console.log(
        `[onToolCall] Executing client-side tool: ${toolCall.toolName}`,
        toolCall,
      );

      // Create tool context for extracted handlers
      const toolContext: ToolContext = {
        launchApp: (appId, options) => launchApp(appId as AppId, options),
        addToolResult,
        detectUserOS,
      };

      try {
        // Default result message
        let result: string = "Tool executed successfully";

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
            result = ""; // Handler manages its own result
            break;
          }
          case "karaokeControl": {
            await handleKaraokeControl(
              toolCall.input as KaraokeControlInput,
              toolCall.toolCallId,
              toolContext
            );
            result = ""; // Handler manages its own result
            break;
          }
          case "generateHtml": {
            const { html } = toolCall.input as { html: string };

            // Validate required parameter
            if (!html) {
              console.error(
                "[ToolCall] generateHtml: Missing required 'html' parameter",
              );
              break;
            }

            console.log("[ToolCall] generateHtml:", {
              htmlLength: html.length,
            });

            // HTML will be handled by ChatMessages via HtmlPreview
            console.log(
              "[ToolCall] Generated HTML:",
              html.substring(0, 100) + "...",
            );
            break;
          }
          // === Unified VFS Tools ===
          case "list": {
            const { path, query, limit } = toolCall.input as {
              path: string;
              query?: string;
              limit?: number;
            };

            if (!path) {
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
              });
              result = "";
              break;
            }

            console.log("[ToolCall] list:", { path, query, limit });

            try {
              // Route based on path
              if (path === "/Music") {
                // List iPod library
                const ipodStore = useIpodStore.getState();
                const library = ipodStore.tracks.map((track) => ({
                  path: `/Music/${track.id}`,
                  id: track.id,
                  title: track.title,
                  artist: track.artist,
                }));

                const resultMessage =
                  library.length > 0
                    ? `${library.length === 1 
                        ? i18n.t("apps.chats.toolCalls.foundSongsInMusic", { count: library.length })
                        : i18n.t("apps.chats.toolCalls.foundSongsInMusicPlural", { count: library.length })}:\n${JSON.stringify(library, null, 2)}`
                    : i18n.t("apps.chats.toolCalls.musicLibraryEmpty");

                addToolResult({
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

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
                result = "";
              } else if (path === "/Applications") {
                // List installed applications
                const apps = Object.entries(appRegistry)
                  .filter(([id]) => id !== "finder")
                  .map(([id, app]) => ({
                    path: `/Applications/${id}`,
                    name: app.name,
                  }));

                const appsMessage = apps.length === 1
                  ? i18n.t("apps.chats.toolCalls.foundApplicationsList", { count: apps.length })
                  : i18n.t("apps.chats.toolCalls.foundApplicationsListPlural", { count: apps.length });
                addToolResult({
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

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
                result = "";
              } else {
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: i18n.t("apps.chats.toolCalls.invalidPathForList", { path }),
                });
                result = "";
              }
            } catch (err) {
              console.error("list error:", err);
              addToolResult({
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
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
              });
              result = "";
              break;
            }

            console.log("[ToolCall] open:", { path });

            try {
              // Route based on path prefix
              if (path.startsWith("/Music/")) {
                // Play iPod song by ID
                const songId = path.replace("/Music/", "");
                const ipodState = useIpodStore.getState();
                const track = ipodState.tracks.find((t) => t.id === songId);

                if (!track) {
                  throw new Error(`Song not found: ${songId}`);
                }

                // Ensure iPod is open
                const appState = useAppStore.getState();
                const ipodInstances = appState.getInstancesByAppId("ipod");
                if (!ipodInstances.some((inst) => inst.isOpen)) {
                  launchApp("ipod");
                }

                ipodState.setCurrentSongId(songId);
                ipodState.setIsPlaying(true);

                const playingMessage = track.artist
                  ? i18n.t("apps.chats.toolCalls.playingTrackByArtist", { title: track.title, artist: track.artist })
                  : i18n.t("apps.chats.toolCalls.playingTrack", { title: track.title });
                addToolResult({
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

                addToolResult({
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
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.launchedApp", { appName: getTranslatedAppName(appId) }),
                });
                result = "";
              } else if (path.startsWith("/Applets/")) {
                // Open applet in viewer
                const { fileItem, content } = await readLocalFileTextOrThrow(
                  path,
                  STORES.APPLETS,
                  {
                    notFound: `Applet not found: ${path}`,
                    missingContent: `Applet missing content: ${path}`,
                    readFailed: `Failed to read applet content: ${path}`,
                  },
                );

                launchApp("applet-viewer", {
                  initialData: { path, content },
                });

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.openedFile", { fileName: fileItem.name }),
                });
                result = "";
              } else if (path.startsWith("/Documents/")) {
                // Open document in TextEdit
                const { fileItem, content } = await readLocalFileTextOrThrow(
                  path,
                  STORES.DOCUMENTS,
                  {
                    notFound: `Document not found: ${path}`,
                    missingContent: `Document missing content: ${path}`,
                    readFailed: `Failed to read document content: ${path}`,
                  },
                );

                // Pass initialData directly to launchApp (consistent with Terminal/Finder approach)
                // TextEdit will handle markdown-to-HTML conversion internally
                launchApp("textedit", {
                  multiWindow: true,
                  initialData: { path, content },
                });

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.openedDocument", { fileName: fileItem.name }),
                });
                result = "";
              } else {
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: i18n.t("apps.chats.toolCalls.invalidPath", { path }),
                });
                result = "";
              }
            } catch (err) {
              console.error("open error:", err);
              addToolResult({
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
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
              });
              result = "";
              break;
            }

            console.log("[ToolCall] read:", { path });

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

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: JSON.stringify(payload, null, 2),
                });
                result = "";
              } else if (path.startsWith("/Applets/") || path.startsWith("/Documents/")) {
                // Read local file content
                const isApplet = path.startsWith("/Applets/");
                const storeName = isApplet ? STORES.APPLETS : STORES.DOCUMENTS;
                const { fileItem, content } = await readLocalFileTextOrThrow(
                  path,
                  storeName,
                  {
                    notFound: `File not found: ${path}`,
                    missingContent: `File missing content: ${path}`,
                    readFailed: `Failed to read file content: ${path}`,
                  },
                );

                const fileLabel = isApplet ? i18n.t("apps.chats.toolCalls.applet") : i18n.t("apps.chats.toolCalls.document");
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.fileContent", { fileLabel, fileName: fileItem.name, charCount: content.length }) + `\n\n${content}`,
                });
                result = "";
              } else {
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: i18n.t("apps.chats.toolCalls.invalidPathForRead", { path }),
                });
                result = "";
              }
            } catch (err) {
              console.error("read error:", err);
              addToolResult({
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

            console.log("[ToolCall] write:", { path, mode, contentLength: content?.length });

            try {
              const writeResult = await executeChatFileWriteOperation({
                path,
                content,
                mode,
              });

              if (!writeResult.ok) {
                const writeError = writeResult.error;
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: resolveToolErrorText(i18n.t, writeError),
                });
                result = "";
                break;
              }

              const { path: normalizedPath, finalContent, fileName } = writeResult;
              syncTextEditDocumentForPath({
                path: normalizedPath,
                content: finalContent,
                fileName,
                launchIfMissing: true,
                bringToForeground: true,
                includeFilePathOnUpdate: true,
              });

              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: i18n.t(writeResult.successKey, {
                  path: normalizedPath,
                }),
              });
              result = "";
            } catch (err) {
              console.error("write error:", err);
              addToolResult({
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

            const editValidation = validateFileEditInput({
              path,
              oldString: old_string,
              newString: new_string,
            });
            if (!editValidation.ok) {
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t(editValidation.errorKey),
              });
              result = "";
              break;
            }
            const normalizedPath = editValidation.path;
            const oldString = editValidation.oldString;
            const newString = editValidation.newString;

            console.log("[ToolCall] edit:", {
              path: normalizedPath,
              old_string: oldString.substring(0, 50) + "...",
              new_string: newString.substring(0, 50) + "...",
            });

            try {
              const editResult = await executeChatFileEditOperation({
                path: normalizedPath,
                oldString,
                newString,
              });

              if (!editResult.ok) {
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: resolveToolErrorText(i18n.t, editResult.error),
                });
                result = "";
                break;
              }

              if (editResult.target === "document") {
                syncTextEditDocumentForPath({
                  path: normalizedPath,
                  content: editResult.updatedContent,
                  launchIfMissing: false,
                  bringToForeground: false,
                  includeFilePathOnUpdate: false,
                });
              }

              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: i18n.t(editResult.successKey, {
                  path: normalizedPath,
                }),
              });
              result = "";
            } catch (err) {
              console.error("edit error:", err);
              addToolResult({
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
            result = ""; // Handler manages its own result
            break;
          }
          case "stickiesControl": {
            handleStickiesControl(
              toolCall.input as StickiesControlInput,
              toolCall.toolCallId,
              toolContext
            );
            result = ""; // Handler manages its own result
            break;
          }
          case "infiniteMacControl": {
            await handleInfiniteMacControl(
              toolCall.input as InfiniteMacControlInput,
              toolCall.toolCallId,
              toolContext
            );
            result = ""; // Handler manages its own result
            break;
          }
          default:
            console.warn("Unhandled tool call:", toolCall.toolName);
            result = "Tool executed";
            break;
        }

        // Send the result back to the chat
        if (result) {
          console.log(
            `[onToolCall] Adding result for ${toolCall.toolName}:`,
            result,
          );
          addToolResult({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: result,
          });
        }
      } catch (err) {
        console.error("Error executing tool call:", err);
        // Send error result
        addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.unknownError"),
        });
      }
    },

    onFinish: ({ messages }) => {
      // Ensure all messages preserve metadata timestamps when possible.
      const finalMessages: AIChatMessage[] = mergeMessagesWithTimestamps(
        messages as UIMessage[],
        currentSdkMessagesRef.current,
      );
      console.log(
        `AI finished, syncing ${finalMessages.length} final messages to store.`,
      );
      setAiMessages(finalMessages);

      const lastMsg = finalMessages.at(-1);
      if (!lastMsg || lastMsg.role !== "assistant") return;

      // Show notification if chat app is backgrounded
      if (!isChatsInForeground()) {
        showBackgroundedMessageNotification(lastMsg);
      }

      // Ensure any final content that wasn't processed is spoken
      if (!speechEnabled) return;

      const progress = speechProgressRef.current[lastMsg.id] ?? 0;
      const content = getAssistantVisibleText(lastMsg);

      console.log(
        `[onFinish] Progress: ${progress}, Content length: ${content.length}`,
      );

      // If there's unprocessed content, speak it now
      if (progress < content.length) {
        const remainingRaw = content.slice(progress);
        const cleaned = cleanTextForSpeech(remainingRaw);
        console.log(`[onFinish] Speaking final content: "${cleaned}"`);

        if (cleaned) {
          const seg = {
            messageId: lastMsg.id,
            start: progress,
            end: content.length,
          };
          highlightQueueRef.current.push(seg);

          // Use ref to get current setHighlightSegment function
          if (highlightQueueRef.current.length === 1) {
            setTimeout(() => {
              if (highlightQueueRef.current[0] === seg) {
                setHighlightSegmentRef.current(seg);
              }
            }, 80);
          }

          speak(cleaned, () => {
            highlightQueueRef.current.shift();
            setHighlightSegmentRef.current(
              highlightQueueRef.current[0] || null,
            );
          });

          // Mark as fully processed
          speechProgressRef.current[lastMsg.id] = content.length;
        }
      }
    },

    onError: handleChatError,
  });

  // Ensure all messages have metadata with timestamps (runs synchronously during render)
  const messagesWithTimestamps = useMemo<AIChatMessage[]>(() => {
    return mergeMessagesWithTimestamps(currentSdkMessages as UIMessage[], aiMessages);
  }, [currentSdkMessages, aiMessages]);

  // Ref to hold the latest SDK messages for use in callbacks
  const currentSdkMessagesRef = useRef<AIChatMessage[]>([]);
  currentSdkMessagesRef.current = messagesWithTimestamps;

  // --- State Synchronization & Message Processing ---
  // Sync store to SDK ONLY on initial load or external store changes
  useEffect(() => {
    // If aiMessages (from store) differs from the SDK state, update SDK.
    // This handles loading persisted messages.
    if (
      !areMessageIdListsEqual(
        aiMessages,
        currentSdkMessages as Array<{ id: string }>,
      )
    ) {
      console.log("Syncing Zustand store messages to SDK.");
      setSdkMessages(aiMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMessages, setSdkMessages]); // Only run when aiMessages changes

  // --- Incremental TTS while assistant reply is streaming ---
  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!speechEnabled) return;

    // Only process while streaming is active
    if (!isLoading) return;

    const lastMsg = currentSdkMessages.at(-1);
    if (!lastMsg || lastMsg.role !== "assistant") return;

    // Get current progress for this message
    const progress =
      typeof speechProgressRef.current[lastMsg.id] === "number"
        ? (speechProgressRef.current[lastMsg.id] as number)
        : 0;

    // Use helper function to get actual visible text
    const content = getAssistantVisibleText(lastMsg);

    // IMPORTANT: Handle multi-step tool calls
    // If progress equals content length, this message was previously complete
    // but if content.length has grown, we have new content to speak
    if (progress >= content.length) return;

    const processChunk = (startPos: number, endPos: number, nextPos: number) => {
      const rawChunk = content.slice(startPos, endPos);
      const cleaned = cleanTextForSpeech(rawChunk);
      if (cleaned) {
        const seg = { messageId: lastMsg.id, start: startPos, end: endPos };
        highlightQueueRef.current.push(seg);
        if (!highlightSegment) {
          // Delay highlighting slightly so text sync aligns closer to actual speech start
          setTimeout(() => {
            if (highlightQueueRef.current[0] === seg) {
              setHighlightSegment(seg);
            }
          }, 80);
        }

        speak(cleaned, () => {
          highlightQueueRef.current.shift();
          setHighlightSegment(highlightQueueRef.current[0] || null);
        });
      }
      speechProgressRef.current[lastMsg.id] = nextPos;
    };

    const completedSegments = collectCompletedLineSegments(content, progress);
    completedSegments.forEach(({ start, end, nextStart }) => {
      processChunk(start, end, nextStart);
    });
  }, [currentSdkMessages, isLoading, speechEnabled, speak, highlightSegment]);

  // Clear rate limit error when username is set
  useEffect(() => {
    if (username && needsUsername) {
      setNeedsUsername(false);
      setRateLimitError(null);
    }
  }, [username, needsUsername]);

  // --- Action Handlers ---
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const messageContent = input; // Capture input before clearing
      const imageContent = selectedImage; // Capture image before clearing
      if (!messageContent.trim() && !imageContent) return; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !username) {
        toast.error("Login Required", {
          description: "Please login to continue chatting.",
          duration: 3000,
        });
        return;
      }

      // Ensure auth token exists before submitting (wait for it if needed)
      if (username && !authToken) {
        console.log(
          "[useAiChat] Waiting for auth token generation before sending message...",
        );
        const tokenResult = await ensureAuthToken();
        if (!tokenResult.ok) {
          toast.error("Authentication Error", {
            description:
              "Failed to generate authentication token. Please try logging in again.",
            duration: 3000,
          });
          return;
        }
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      // Proceed with the actual submission using useChat v5
      const freshSystemState = getSystemState();
      console.log("Submitting AI chat with system state:", freshSystemState);

      // Build message content - text and optionally image
      if (imageContent) {
        // Extract media type from data URL (e.g., "data:image/png;base64,..." -> "image/png")
        const mediaTypeMatch = imageContent.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/png";
        
        // Send message with image attachment using files array
        sendMessage(
          {
            text: messageContent.trim() || "Describe this image",
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
      setInput(""); // Clear input after sending
      setSelectedImage(null); // Clear image after sending
    },
    [
      sendMessage,
      input,
      selectedImage,
      needsUsername,
      username,
      authToken,
      ensureAuthToken,
      aiModel,
      setInput,
    ], // Updated deps
  );

  const handleDirectMessageSubmit = useCallback(
    async (message: string) => {
      if (!message.trim()) return; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !username) {
        toast.error("Login Required", {
          description: "Please login to continue chatting.",
          duration: 3000,
        });
        return;
      }

      // Ensure auth token exists before submitting (wait for it if needed)
      if (username && !authToken) {
        console.log(
          "[useAiChat] Waiting for auth token generation before sending message...",
        );
        const tokenResult = await ensureAuthToken();
        if (!tokenResult.ok) {
          toast.error("Authentication Error", {
            description:
              "Failed to generate authentication token. Please try logging in again.",
            duration: 3000,
          });
          return;
        }
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      // Proceed with the actual submission using useChat v5
      console.log("Sending direct message to AI chat");
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
    [sendMessage, needsUsername, username, authToken, ensureAuthToken, aiModel], // Updated deps
  );

  const handleNudge = useCallback(() => {
    handleDirectMessageSubmit(t("apps.chats.status.nudgeSent"));
    // Consider adding shake effect trigger here if needed
  }, [handleDirectMessageSubmit, t]);

  const clearChats = useCallback(() => {
    console.log("Clearing AI chats");

    // --- Extract memories before clearing (async, fire and forget) ---
    // Capture current messages before we clear them
    const messagesToAnalyze = [...aiMessages];
    const currentUsername = username;
    const currentToken = authToken;

    // Only extract if user is logged in and there are messages worth analyzing
    if (currentUsername && currentToken && messagesToAnalyze.length > 2) {
      console.log("[clearChats] Triggering async memory extraction...");
      
      // Fire and forget - don't await, don't block the UI
      abortableFetch(getApiUrl("/api/ai/extract-memories"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
          "X-Username": currentUsername,
        },
        body: JSON.stringify({
          messages: messagesToAnalyze.map(msg => ({
            role: msg.role,
            parts: msg.parts,
          })),
        }),
        timeout: 15000,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      })
        .then(res => res.json())
        .then(data => {
          if (data.extracted > 0) {
            console.log(`[clearChats] Extracted ${data.extracted} memories from conversation`);
          } else {
            console.log("[clearChats] No memories extracted:", data.message);
          }
        })
        .catch(err => {
          console.warn("[clearChats] Memory extraction failed (non-blocking):", err);
        });
    }

    // --- Reset speech & highlight state so the next reply starts clean ---
    // Stop any ongoing TTS playback or pending requests
    stopTts();

    // Clear progress tracking so new messages are treated as fresh
    speechProgressRef.current = {};

    // Reset highlight queue & currently highlighted segment
    highlightQueueRef.current = [];
    setHighlightSegment(null);

    // Define the initial message and mark it as fully processed so it is never spoken
    const initialMessage: AIChatMessage = {
      id: "1", // Ensure consistent ID for the initial message
      role: "assistant",
      parts: [{ type: "text", text: i18n.t("apps.chats.messages.greeting") }],
      metadata: {
        createdAt: new Date(),
      },
    };
    const initialText = getAssistantVisibleText(initialMessage);
    speechProgressRef.current[initialMessage.id] = initialText.length;

    // Update both the Zustand store and the SDK state directly
    setAiMessages([initialMessage]);
    setSdkMessages([initialMessage]);
  }, [setAiMessages, setSdkMessages, stopTts, aiMessages, username, authToken]);

  // --- Dialog States & Handlers ---
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");

  const confirmClearChats = useCallback(() => {
    setIsClearDialogOpen(false);
    // Add small delay for dialog close animation
    setTimeout(() => {
      clearChats();
      setInput(""); // Clear input field
    }, 100);
  }, [clearChats, setInput]);

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
      const transcript = buildChatTranscript({
        messages: messagesForTranscript,
        username,
        getVisibleText: getAssistantVisibleText,
      });

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
        toast.success(isUpdate ? "Transcript updated" : "Transcript saved", {
          description: `Saved to ${finalFileName}`,
          duration: 5000,
          action: {
            label: "Open",
            onClick: () => {
              syncTextEditDocumentForPath({
                path: filePath,
                content: transcript,
                fileName: finalFileName,
                launchIfMissing: true,
                bringToForeground: true,
                includeFilePathOnUpdate: true,
              });
            },
          },
        });
      } catch (error) {
        console.error("Error saving transcript:", error);
        toast.error("Failed to save transcript", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [username, saveFile],
  );

  // Stop both chat streaming and TTS queue
  const stop = useCallback(() => {
    sdkStop();
    stopTts();
  }, [sdkStop, stopTts]);

  return {
    // AI Chat State & Actions
    messages: messagesWithTimestamps, // Return messages with timestamps
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    reload: regenerate, // Map v5 regenerate to v4 reload
    error,
    stop,
    append: sendMessage, // Map v5 sendMessage to v4 append (for compatibility)
    handleDirectMessageSubmit,
    handleNudge,
    clearChats, // Expose the action
    handleSaveTranscript, // Expose the action

    // Image attachment state
    selectedImage,
    handleImageChange,

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
  };
}
