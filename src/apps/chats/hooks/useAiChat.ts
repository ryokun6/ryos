import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChatsStore } from "../../../stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp, type LaunchAppOptions } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import {
  useFileSystem,
  dbOperations,
  STORES,
  type DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdown";
import { AnyExtension, JSONContent } from "@tiptap/core";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";

// TODO: Move relevant state and logic from ChatsAppComponent here
// - AI chat state (useChat hook)
// - Message processing (app control markup)
// - System state generation
// - Dialog states (clear, save)

// Track newly created TextEdit instances for fallback mechanism
const recentlyCreatedTextEditInstances = new Map<
  string,
  { instanceId: string; timestamp: number }
>();

// Helper to add a newly created instance to tracking
const trackNewTextEditInstance = (instanceId: string) => {
  recentlyCreatedTextEditInstances.set(instanceId, {
    instanceId,
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

// Helper to get the most recently created TextEdit instance
const getMostRecentTextEditInstance = (): string | null => {
  let mostRecent: { instanceId: string; timestamp: number } | null = null;
  for (const data of recentlyCreatedTextEditInstances.values()) {
    if (!mostRecent || data.timestamp > mostRecent.timestamp) {
      mostRecent = data;
    }
  }
  return mostRecent?.instanceId || null;
};

// Replace or update the getSystemState function to use stores
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const textEditStore = useTextEditStore.getState();
  const chatsStore = useChatsStore.getState();
  const themeStore = useThemeStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack =
    ipodStore.tracks &&
    ipodStore.currentIndex >= 0 &&
    ipodStore.currentIndex < ipodStore.tracks.length
      ? ipodStore.tracks[ipodStore.currentIndex]
      : null;

  // Use new instance-based model instead of legacy apps
  const runningInstances = Object.entries(appStore.instances)
    .filter(([, instance]) => instance.isOpen)
    .map(([instanceId, instance]) => ({
      instanceId,
      appId: instance.appId,
      isForeground: instance.isForeground || false,
      title: instance.title,
    }));

  const foregroundInstance =
    runningInstances.find((inst) => inst.isForeground) || null;
  const backgroundInstances = runningInstances.filter(
    (inst) => !inst.isForeground,
  );

  // --- Local browser time information (client side) ---
  const nowClient = new Date();
  const userTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  const userTimeString = nowClient.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const userDateString = nowClient.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Convert TextEdit instances to compact markdown for prompt inclusion
  const textEditInstances = Object.values(textEditStore.instances);
  const textEditInstancesData = textEditInstances.map((instance) => {
    let contentMarkdown: string | null = null;
    if (instance.contentJson) {
      try {
        const htmlStr = generateHTML(instance.contentJson, [
          StarterKit,
          Underline,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          TaskList,
          TaskItem.configure({ nested: true }),
        ] as AnyExtension[]);
        contentMarkdown = htmlToMarkdown(htmlStr);
      } catch (err) {
        console.error("Failed to convert TextEdit content to markdown:", err);
      }
    }

    // Get title from file path if available, otherwise from app store instance
    let title = "Untitled";
    if (instance.filePath) {
      // Extract filename from path (e.g., "/Documents/example.md" -> "example.md")
      const filename = instance.filePath.split("/").pop() || "Untitled";
      // Remove .md extension for cleaner display
      title = filename.replace(/\.md$/, "");
    } else {
      // Fall back to app store instance title
      const appInstance = appStore.instances[instance.instanceId];
      title = appInstance?.title || "Untitled";
    }

    return {
      instanceId: instance.instanceId,
      filePath: instance.filePath,
      title,
      contentMarkdown,
      hasUnsavedChanges: instance.hasUnsavedChanges,
    };
  });

  // Convert IE HTML content to markdown for compact prompts
  let ieHtmlMarkdown: string | null = null;
  if (ieStore.aiGeneratedHtml) {
    try {
      ieHtmlMarkdown = htmlToMarkdown(ieStore.aiGeneratedHtml);
    } catch (err) {
      console.error("Failed to convert IE HTML to markdown:", err);
    }
  }

  return {
    username: chatsStore.username,
    userLocalTime: {
      timeString: userTimeString,
      dateString: userDateString,
      timeZone: userTimeZone,
    },
    runningApps: {
      foreground: foregroundInstance,
      background: backgroundInstances,
      instanceWindowOrder: appStore.instanceOrder,
    },
    internetExplorer: {
      url: ieStore.url,
      year: ieStore.year,
      status: ieStore.status,
      currentPageTitle: ieStore.currentPageTitle,
      aiGeneratedHtml: ieStore.aiGeneratedHtml,
      aiGeneratedMarkdown: ieHtmlMarkdown,
    },
    video: {
      currentVideo: currentVideo
        ? {
            id: currentVideo.id,
            url: currentVideo.url,
            title: currentVideo.title,
            artist: currentVideo.artist,
          }
        : null,
      isPlaying: videoStore.isPlaying,
      loopAll: videoStore.loopAll,
      loopCurrent: videoStore.loopCurrent,
      isShuffled: videoStore.isShuffled,
    },
    ipod: {
      currentTrack: currentTrack
        ? {
            id: currentTrack.id,
            url: currentTrack.url,
            title: currentTrack.title,
            artist: currentTrack.artist,
          }
        : null,
      isPlaying: ipodStore.isPlaying,
      loopAll: ipodStore.loopAll,
      loopCurrent: ipodStore.loopCurrent,
      isShuffled: ipodStore.isShuffled,
      currentLyrics: ipodStore.currentLyrics,
    },
    textEdit: {
      instances: textEditInstancesData,
    },
    theme: {
      current: themeStore.current,
    },
  };
};

// --- Utility: Debounced updater for insertText ---
// We want to avoid spamming TextEdit with many rapid updates while the assistant is
// streaming a long insertText payload. Instead, we debounce the store update so the
// UI only refreshes after a short idle period.

function createDebouncedAction(delay = 150) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (action: () => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      action();
      timer = null;
    }, delay);
  };
}

// Singleton debounced executor reused across insertText tool calls
const debouncedInsertTextUpdate = createDebouncedAction(150);

// Helper function to extract visible text from message parts
const getAssistantVisibleText = (message: UIMessage): string => {
  // Define type for message parts
  type MessagePart = {
    type: string;
    text?: string;
  };

  // If message has parts, extract text from text parts only
  if (message.parts && message.parts.length > 0) {
    return message.parts
      .filter((part: MessagePart) => part.type === "text")
      .map((part: MessagePart) => {
        const text = part.text || "";
        // Handle urgent messages by removing leading !!!!
        return text.startsWith("!!!!") ? text.slice(4).trimStart() : text;
      })
      .join("");
  }

  // Fallback - no content property in v5, return empty string
  return "";
};

export function useAiChat(onPromptSetUsername?: () => void) {
  const { aiMessages, setAiMessages, username, authToken, ensureAuthToken } =
    useChatsStore();
  const launchApp = useLaunchApp();
  const closeApp = useAppStore((state) => state.closeApp);
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAppStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

  // Local input state (SDK v5 no longer provides this)
  const [input, setInput] = useState("");
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

  // Ensure auth token exists when username is present
  useEffect(() => {
    if (username && !authToken) {
      ensureAuthToken().catch((err) => {
        console.error("[useAiChat] Failed to generate auth token", err);
      });
    }
  }, [username, authToken, ensureAuthToken]);

  // Queue-based TTS – speaks chunks as they arrive
  const { speak, stop: stopTts, isSpeaking } = useTtsQueue();

  // Strip any number of leading exclamation marks (urgent markers) plus following spaces,
  // then remove any leading standalone punctuation that may remain.
  const cleanTextForSpeech = (text: string) => {
    // First, remove HTML code blocks (```html...``` or similar)
    const withoutCodeBlocks = text
      .replace(/```[\s\S]*?```/g, "") // Remove all code blocks
      .replace(/<[^>]*>/g, "") // Remove any HTML tags
      .replace(/^!+\s*/, "") // remove !!!!!! prefix
      .replace(/^[\s.!?。，！？；：]+/, "") // remove leftover punctuation/space at start
      .trim();

    return withoutCodeBlocks;
  };

  // Rate limit state
  const [rateLimitError, setRateLimitError] = useState<{
    isAuthenticated: boolean;
    count: number;
    limit: number;
    message: string;
  } | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
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

      try {
        // Default result message
        let result: string = "Tool executed successfully";

        switch (toolCall.toolName) {
          case "aquarium": {
            // Visual renders in the message bubble; nothing to do here.
            result = "Aquarium displayed";
            break;
          }
          case "switchTheme": {
            const { theme } = toolCall.input as { theme?: OsThemeId };
            if (!theme) {
              console.error(
                "[ToolCall] switchTheme: Missing required 'theme' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "No theme provided",
              });
              break;
            }

            const { current, setTheme } = useThemeStore.getState();
            if (current === theme) {
              const name = themes[theme]?.name || theme;
              result = `${name} theme is already active`;
            } else {
              setTheme(theme);
              const name = themes[theme]?.name || theme;
              result = `Switched theme to ${name}`;
            }
            console.log("[ToolCall] switchTheme:", theme, result);
            break;
          }
          case "launchApp": {
            const { id, url, year } = toolCall.input as {
              id: string;
              url?: string;
              year?: string;
            };

            // Validate required parameter
            if (!id) {
              console.error(
                "[ToolCall] launchApp: Missing required 'id' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "No app ID provided",
              });
              break;
            }

            const appName = appRegistry[id as AppId]?.name || id;
            console.log("[ToolCall] launchApp:", { id, url, year });

            const launchOptions: LaunchAppOptions = {};
            if (id === "internet-explorer" && (url || year)) {
              launchOptions.initialData = { url, year: year || "current" };
            }

            launchApp(id as AppId, launchOptions);

            result = `Launched ${appName}`;
            if (id === "internet-explorer") {
              const urlPart = url ? ` to ${url}` : "";
              const yearPart = year && year !== "current" ? ` in ${year}` : "";
              result += `${urlPart}${yearPart}`;
            }
            console.log(`[ToolCall] ${result}`);
            break;
          }
          case "closeApp": {
            const { id } = toolCall.input as { id: string };

            // Validate required parameter
            if (!id) {
              console.error(
                "[ToolCall] closeApp: Missing required 'id' parameter",
              );
              break;
            }

            const appName = appRegistry[id as AppId]?.name || id;
            console.log("[ToolCall] closeApp:", id);

            // Close all instances of the specified app
            const appStore = useAppStore.getState();
            const appInstances = appStore.getInstancesByAppId(id as AppId);
            const openInstances = appInstances.filter((inst) => inst.isOpen);

            if (openInstances.length === 0) {
              console.log(`[ToolCall] ${appName} is not currently running.`);
              break;
            }

            // Close all open instances of this app
            openInstances.forEach((instance) => {
              appStore.closeAppInstance(instance.instanceId);
            });

            // Also close the legacy app state for backward compatibility
            closeApp(id as AppId);

            console.log(
              `[ToolCall] Closed ${appName} (${openInstances.length} window${
                openInstances.length === 1 ? "" : "s"
              }).`,
            );
            break;
          }
          case "textEditSearchReplace": {
            const { search, replace, isRegex, instanceId } = toolCall.input as {
              search: string;
              replace: string;
              isRegex?: boolean;
              instanceId?: string;
            };

            // Validate required parameters
            if (typeof search !== "string") {
              console.error(
                "[ToolCall] textEditSearchReplace: Missing required 'search' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: "Error: Missing required 'search' parameter",
              });
              break;
            }
            if (typeof replace !== "string") {
              console.error(
                "[ToolCall] textEditSearchReplace: Missing required 'replace' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: "Error: Missing required 'replace' parameter",
              });
              break;
            }

            // Normalize line endings to avoid mismatches between CRLF / LF
            const normalizedSearch = search.replace(/\r\n?/g, "\n");
            const normalizedReplace = replace.replace(/\r\n?/g, "\n");

            // Helper to escape special regex chars when doing literal replacement
            const escapeRegExp = (str: string) =>
              str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            console.log("[ToolCall] searchReplace:", {
              search: normalizedSearch,
              replace: normalizedReplace,
              isRegex,
              instanceId,
            });

            const textEditState = useTextEditStore.getState();

            // Determine the target instance ID with fallback mechanism
            let targetInstanceId = instanceId;
            let usedFallback = false;

            // If no instanceId provided or instance doesn't exist, try fallback
            if (
              !targetInstanceId ||
              !textEditState.instances[targetInstanceId]
            ) {
              console.warn(
                `[ToolCall] TextEdit instance ${
                  targetInstanceId || "(not provided)"
                } not found. Available instances: ${
                  Object.keys(textEditState.instances).join(", ") || "none"
                }.`,
              );

              // Fallback: Try to use the most recently created TextEdit instance
              const recentInstanceId = getMostRecentTextEditInstance();
              if (
                recentInstanceId &&
                textEditState.instances[recentInstanceId]
              ) {
                targetInstanceId = recentInstanceId;
                usedFallback = true;
                console.log(
                  `[ToolCall] Using fallback: most recently created TextEdit instance ${targetInstanceId}`,
                );
              } else {
                console.error(
                  "[ToolCall] No valid TextEdit instance found for search/replace",
                );
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: `Error: TextEdit instance ${
                    instanceId || "(not provided)"
                  } not found and no fallback instance available. Available instances: ${
                    Object.keys(textEditState.instances).join(", ") || "none"
                  }`,
                });
                break;
              }
            }

            // Use specific instance
            const targetInstance = textEditState.instances[targetInstanceId];
            if (!targetInstance) {
              console.error(
                `[ToolCall] TextEdit instance ${targetInstanceId} not found after fallback attempt.`,
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: `Error: TextEdit instance ${targetInstanceId} not found`,
              });
              break;
            }

            const { updateInstance } = textEditState;

            try {
              // Handle empty documents by creating a default structure
              const currentContentJson = targetInstance.contentJson || {
                type: "doc",
                content: [{ type: "paragraph", content: [] }],
              };

              // 1. Convert current JSON document to HTML
              const htmlStr = generateHTML(currentContentJson, [
                StarterKit,
                Underline,
                TextAlign.configure({ types: ["heading", "paragraph"] }),
                TaskList,
                TaskItem.configure({ nested: true }),
              ] as AnyExtension[]);

              // 2. Convert HTML to Markdown for regex/text replacement
              const markdownStr = htmlToMarkdown(htmlStr);

              // 3. Perform the replacement on the markdown text
              const updatedMarkdown = (() => {
                try {
                  const pattern = isRegex
                    ? normalizedSearch
                    : escapeRegExp(normalizedSearch);
                  const regex = new RegExp(pattern, "gm");
                  return markdownStr.replace(regex, normalizedReplace);
                } catch (err) {
                  console.error("Error while building/applying regex:", err);
                  throw err;
                }
              })();

              if (updatedMarkdown === markdownStr) {
                console.log("[ToolCall] Nothing found to replace.");
                break;
              }

              // 4. Convert updated markdown back to HTML and then to JSON
              const updatedHtml = markdownToHtml(updatedMarkdown);
              const updatedJson = generateJSON(updatedHtml, [
                StarterKit,
                Underline,
                TextAlign.configure({ types: ["heading", "paragraph"] }),
                TaskList,
                TaskItem.configure({ nested: true }),
              ] as AnyExtension[]);

              // 5. Apply the updated JSON to the specific instance
              updateInstance(targetInstanceId, {
                contentJson: updatedJson,
                hasUnsavedChanges: true,
              });

              // Bring the target instance to foreground so user can see the changes
              const appStore = useAppStore.getState();
              appStore.bringInstanceToForeground(targetInstanceId);

              // Get the display title from the app store instance
              const appInstance = appStore.instances[targetInstanceId];
              const displayName = appInstance?.title || "Untitled";

              const resultMessage = `Successfully replaced text in "${displayName}" (instanceId: ${targetInstanceId})${
                usedFallback
                  ? ` [Note: Used fallback to most recent instance as specified instance ${instanceId} was not found]`
                  : ""
              }`;
              console.log(
                `[ToolCall] Replaced "${search}" with "${replace}" in ${displayName}${
                  usedFallback ? " using fallback mechanism" : ""
                }.`,
              );

              // Add tool result back to messages
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              break;
            } catch (err) {
              console.error("searchReplace error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error ? err.message : "Failed to replace text",
              });
              break;
            }
          }
          case "textEditInsertText": {
            const { text, position, instanceId } = toolCall.input as {
              text: string;
              position?: "start" | "end";
              instanceId?: string;
            };

            // Validate required parameters
            if (!text) {
              console.error(
                "[ToolCall] textEditInsertText: Missing required 'text' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: "Error: Missing required 'text' parameter",
              });
              break;
            }

            console.log("[ToolCall] insertText:", {
              text,
              position,
              instanceId,
            });

            const textEditState = useTextEditStore.getState();

            // Determine the target instance ID with fallback mechanism
            let targetInstanceId = instanceId;
            let usedFallback = false;

            // If no instanceId provided or instance doesn't exist, try fallback
            if (
              !targetInstanceId ||
              !textEditState.instances[targetInstanceId]
            ) {
              console.warn(
                `[ToolCall] TextEdit instance ${
                  targetInstanceId || "(not provided)"
                } not found. Available instances: ${
                  Object.keys(textEditState.instances).join(", ") || "none"
                }.`,
              );

              // Fallback: Try to use the most recently created TextEdit instance
              const recentInstanceId = getMostRecentTextEditInstance();
              if (
                recentInstanceId &&
                textEditState.instances[recentInstanceId]
              ) {
                targetInstanceId = recentInstanceId;
                usedFallback = true;
                console.log(
                  `[ToolCall] Using fallback: most recently created TextEdit instance ${targetInstanceId}`,
                );
              } else {
                console.error(
                  "[ToolCall] No valid TextEdit instance found for insertion",
                );
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: `Error: TextEdit instance ${
                    instanceId || "(not provided)"
                  } not found and no fallback instance available. Available instances: ${
                    Object.keys(textEditState.instances).join(", ") || "none"
                  }`,
                });
                break;
              }
            }

            // Use specific instance
            const targetInstance = textEditState.instances[targetInstanceId];
            if (!targetInstance) {
              console.error(
                `[ToolCall] TextEdit instance ${targetInstanceId} not found after fallback attempt.`,
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: `Error: TextEdit instance ${targetInstanceId} not found`,
              });
              break;
            }

            try {
              // Insert text into the specific instance
              const { updateInstance } = textEditState;

              // Step 1: Convert incoming markdown snippet to HTML
              const htmlFragment = markdownToHtml(text);

              // Step 2: Generate TipTap-compatible JSON from the HTML fragment
              const parsedJson = generateJSON(htmlFragment, [
                StarterKit,
                Underline,
                TextAlign.configure({ types: ["heading", "paragraph"] }),
                TaskList,
                TaskItem.configure({ nested: true }),
              ] as AnyExtension[]);

              // parsedJson is a full doc – we want just its content array
              const nodesToInsert = Array.isArray(parsedJson.content)
                ? parsedJson.content
                : [];

              let newDocJson: JSONContent;

              if (
                targetInstance.contentJson &&
                Array.isArray(targetInstance.contentJson.content)
              ) {
                // Clone existing document JSON to avoid direct mutation
                const cloned = JSON.parse(
                  JSON.stringify(targetInstance.contentJson),
                );
                if (position === "start") {
                  cloned.content = [...nodesToInsert, ...cloned.content];
                } else {
                  cloned.content = [...cloned.content, ...nodesToInsert];
                }
                newDocJson = cloned;
              } else {
                // No existing document – use the parsed JSON directly
                newDocJson = parsedJson;
              }

              // Use a small debounce so rapid successive insertText calls (if any)
              // don't overwhelm the store/UI
              debouncedInsertTextUpdate(() =>
                updateInstance(targetInstanceId, {
                  contentJson: newDocJson,
                  hasUnsavedChanges: true,
                }),
              );

              // Bring the target instance to foreground so user can see the changes
              const appStore = useAppStore.getState();
              appStore.bringInstanceToForeground(targetInstanceId);

              // Get the display title from the app store instance
              const appInstance = appStore.instances[targetInstanceId];
              const displayName = appInstance?.title || "Untitled";

              const resultMessage = `Successfully inserted text at ${
                position === "start" ? "start" : "end"
              } of "${displayName}" (instanceId: ${targetInstanceId})${
                usedFallback
                  ? ` [Note: Used fallback to most recent instance as specified instance ${instanceId} was not found]`
                  : ""
              }`;
              console.log(
                `[ToolCall] Successfully inserted text into TextEdit instance ${targetInstanceId} (${displayName})${
                  usedFallback ? " using fallback mechanism" : ""
                }`,
              );

              // Add tool result back to messages
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              break;
            } catch (err) {
              console.error("textEditInsertText error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error ? err.message : "Failed to insert text",
              });
              break;
            }
          }
          case "textEditNewFile": {
            const { title } = toolCall.input as {
              title?: string;
            };

            console.log("[ToolCall] newFile:", { title });

            // Create a new TextEdit instance with multi-window support
            const appStore = useAppStore.getState();
            const instanceId = appStore.launchApp(
              "textedit",
              undefined,
              title,
              true,
            );

            // Track this newly created instance for fallback mechanism
            trackNewTextEditInstance(instanceId);

            // Wait a bit for the app to initialize
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Bring the new instance to foreground so user can see it
            appStore.bringInstanceToForeground(instanceId);

            // Return structured data for easier parsing by AI
            const resultData = {
              success: true,
              instanceId: instanceId,
              title: title || "Untitled",
            };
            const resultMessage = `Successfully created new TextEdit document "${resultData.title}" with instanceId: ${instanceId}. Use this instanceId for any subsequent insertText or searchReplace operations.`;

            console.log(
              `[ToolCall] Created a new TextEdit document (instanceId: ${instanceId})${
                title ? ` titled "${title}"` : ""
              }.`,
            );

            // Add tool result back to messages
            addToolResult({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: resultMessage,
            });
            break;
          }
          case "ipodControl": {
            const {
              action = "toggle",
              id,
              title,
              artist,
            } = toolCall.input as {
              action?:
                | "toggle"
                | "play"
                | "pause"
                | "playKnown"
                | "addAndPlay"
                | "next"
                | "previous";
              id?: string;
              title?: string;
              artist?: string;
            };

            console.log("[ToolCall] ipodControl:", {
              action,
              id,
              title,
              artist,
            });

            const ensureIpodIsOpen = () => {
              const appState = useAppStore.getState();
              const ipodInstances = appState.getInstancesByAppId("ipod");
              const hasOpenIpodInstance = ipodInstances.some(
                (inst) => inst.isOpen,
              );

              if (!hasOpenIpodInstance) {
                launchApp("ipod");
              }
            };

            ensureIpodIsOpen();

            const normalizedAction = action ?? "toggle";

            if (
              normalizedAction === "toggle" ||
              normalizedAction === "play" ||
              normalizedAction === "pause"
            ) {
              const ipod = useIpodStore.getState();

              switch (normalizedAction) {
                case "play":
                  if (!ipod.isPlaying) ipod.setIsPlaying(true);
                  break;
                case "pause":
                  if (ipod.isPlaying) ipod.setIsPlaying(false);
                  break;
                default:
                  ipod.togglePlay();
                  break;
              }

              const nowPlaying = useIpodStore.getState().isPlaying;
              console.log(
                `[ToolCall] iPod is now ${nowPlaying ? "playing" : "paused"}.`,
              );
              break;
            }

            if (normalizedAction === "playKnown") {
              const ipodState = useIpodStore.getState();
              const { tracks } = ipodState;

              const ciIncludes = (
                source: string | undefined,
                query: string | undefined,
              ): boolean => {
                if (!source || !query) return false;
                return source.toLowerCase().includes(query.toLowerCase());
              };

              let finalCandidateIndices: number[] = [];
              const allTracksWithIndices = tracks.map((t, idx) => ({
                track: t,
                index: idx,
              }));

              const idFilteredTracks = id
                ? allTracksWithIndices.filter(({ track }) => track.id === id)
                : allTracksWithIndices;

              const primaryCandidates = idFilteredTracks.filter(({ track }) => {
                const titleMatches = title
                  ? ciIncludes(track.title, title)
                  : true;
                const artistMatches = artist
                  ? ciIncludes(track.artist, artist)
                  : true;
                return titleMatches && artistMatches;
              });

              if (primaryCandidates.length > 0) {
                finalCandidateIndices = primaryCandidates.map(
                  ({ index }) => index,
                );
              } else if (title || artist) {
                const secondaryCandidates = idFilteredTracks.filter(
                  ({ track }) => {
                    const titleInArtistMatches = title
                      ? ciIncludes(track.artist, title)
                      : false;
                    const artistInTitleMatches = artist
                      ? ciIncludes(track.title, artist)
                      : false;

                    if (title && artist) {
                      return titleInArtistMatches || artistInTitleMatches;
                    }
                    if (title) {
                      return titleInArtistMatches;
                    }
                    if (artist) {
                      return artistInTitleMatches;
                    }
                    return false;
                  },
                );
                finalCandidateIndices = secondaryCandidates.map(
                  ({ index }) => index,
                );
              }

              if (finalCandidateIndices.length === 0) {
                console.log("[ToolCall] Song not found in iPod library.");
                break;
              }

              const randomIndexFromArray =
                finalCandidateIndices[
                  Math.floor(Math.random() * finalCandidateIndices.length)
                ];

              const { setCurrentIndex, setIsPlaying } = useIpodStore.getState();
              setCurrentIndex(randomIndexFromArray);
              setIsPlaying(true);

              const track = tracks[randomIndexFromArray];
              const trackDesc = `${track.title}${
                track.artist ? ` by ${track.artist}` : ""
              }`;
              console.log(`[ToolCall] Playing ${trackDesc}.`);
              break;
            }

            if (normalizedAction === "addAndPlay") {
              if (!id) {
                console.error(
                  "[ToolCall] ipodControl: 'addAndPlay' action requires 'id'.",
                );
                break;
              }

              try {
                const addedTrack = await useIpodStore
                  .getState()
                  .addTrackFromVideoId(id);

                if (addedTrack) {
                  console.log(
                    `[ToolCall] Added '${addedTrack.title}' to iPod and started playing.`,
                  );
                  break;
                } else {
                  console.error(`[ToolCall] Failed to add ${id} to iPod.`);
                  break;
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                console.error(`[iPod] Error adding ${id}:`, error);

                if (errorMessage.includes("Failed to fetch video info")) {
                  console.error(
                    `[ToolCall] Cannot add ${id}: Video unavailable or invalid.`,
                  );
                  break;
                }

                console.error(
                  `[ToolCall] Failed to add ${id}: ${errorMessage}`,
                );
                break;
              }
            }

            if (normalizedAction === "next" || normalizedAction === "previous") {
              const ipodState = useIpodStore.getState();
              const navigate =
                normalizedAction === "next"
                  ? ipodState.nextTrack
                  : ipodState.previousTrack;

              if (typeof navigate === "function") {
                navigate();
              }

              const updatedIpod = useIpodStore.getState();
              const track = updatedIpod.tracks[updatedIpod.currentIndex];
              if (track) {
                const desc = `${track.title}${
                  track.artist ? ` by ${track.artist}` : ""
                }`;
                const verb =
                  normalizedAction === "next" ? "Skipped to" : "Went back to";
                console.log(`[ToolCall] ${verb} ${desc}.`);
                break;
              }

              console.log(
                `[ToolCall] ${
                  normalizedAction === "next"
                    ? "Skipped to next track."
                    : "Went back to previous track."
                }`,
              );
              break;
            }

            console.warn(
              `[ToolCall] ipodControl: Unhandled action "${normalizedAction}".`,
            );
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
          case "listFiles": {
            const { directory } = toolCall.input as {
              directory: "/Applets" | "/Documents" | "/Applications";
            };

            // Validate required parameter
            if (!directory) {
              console.error(
                "[ToolCall] listFiles: Missing required 'directory' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "No directory provided",
              });
              result = ""; // Clear result to prevent duplicate
              break;
            }

            console.log("[ToolCall] listFiles:", { directory });

            try {
              let fileList: Array<{
                path: string;
                name: string;
                type?: string;
              }> = [];
              let fileType = "";

              if (directory === "/Applications") {
                // List installed applications from appRegistry
                const apps = Object.entries(appRegistry)
                  .filter(([id]) => id !== "finder") // Exclude Finder from list
                  .map(([id, app]) => ({
                    path: `/Applications/${id}`,
                    name: app.name,
                  }));

                fileList = apps;
                fileType = "application";
              } else {
                // List files from file system
                const filesStore = useFilesStore.getState();
                const allItems = Object.values(filesStore.items);

                // Filter for active items in specified directory that are not directories
                const files = allItems.filter(
                  (item) =>
                    item.status === "active" &&
                    item.path.startsWith(`${directory}/`) &&
                    !item.isDirectory &&
                    item.path !== `${directory}/`, // Exclude the directory itself
                );

                // Map to return relevant metadata
                fileList = files.map((file) => ({
                  path: file.path,
                  name: file.name,
                  type: file.type,
                }));

                fileType = directory === "/Applets" ? "applet" : "document";
              }

              const resultMessage =
                fileList.length > 0
                  ? `Found ${fileList.length} ${fileType}${
                      fileList.length === 1 ? "" : "s"
                    }:\n${JSON.stringify(fileList, null, 2)}`
                  : `No ${fileType}s found in ${directory} directory`;

              console.log(`[ToolCall] ${resultMessage}`);

              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
            } catch (err) {
              console.error("listFiles error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error ? err.message : "Failed to list files",
              });
              result = ""; // Clear result to prevent duplicate
            }
            break;
          }
          case "listIpodLibrary": {
            console.log("[ToolCall] listIpodLibrary");

            try {
              const ipodStore = useIpodStore.getState();
              const library = ipodStore.tracks.map((track) => ({
                id: track.id,
                title: track.title,
                artist: track.artist,
              }));

              const resultMessage =
                library.length > 0
                  ? `Found ${library.length} song${
                      library.length === 1 ? "" : "s"
                    } in iPod library:\n${JSON.stringify(library, null, 2)}`
                  : "iPod library is empty";

              console.log(`[ToolCall] ${resultMessage}`);

              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
            } catch (err) {
              console.error("listIpodLibrary error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error
                    ? err.message
                    : "Failed to list iPod library",
              });
              result = ""; // Clear result to prevent duplicate
            }
            break;
          }
          case "readFile": {
            const { path } = toolCall.input as { path: string };

            if (!path) {
              console.error(
                "[ToolCall] readFile: Missing required 'path' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "No path provided",
              });
              result = "";
              break;
            }

            console.log("[ToolCall] readFile:", { path });

            try {
              const isApplet = path.startsWith("/Applets/");
              const isDocument = path.startsWith("/Documents/");

              if (!isApplet && !isDocument) {
                throw new Error(
                  "Invalid path: readFile only supports items in /Applets or /Documents",
                );
              }

              const filesStore = useFilesStore.getState();
              const fileItem = filesStore.items[path];

              if (!fileItem) {
                throw new Error(`File not found: ${path}`);
              }

              if (fileItem.status !== "active") {
                throw new Error(`File is not active: ${path}`);
              }

              if (fileItem.isDirectory) {
                throw new Error(`Path is a directory, not a file: ${path}`);
              }

              if (!fileItem.uuid) {
                throw new Error(
                  `File missing UUID for content lookup: ${path}`,
                );
              }

              const storeName = isApplet ? STORES.APPLETS : STORES.DOCUMENTS;
              const contentData = await dbOperations.get<DocumentContent>(
                storeName,
                fileItem.uuid,
              );

              if (!contentData || contentData.content == null) {
                throw new Error(`Failed to read file content: ${path}`);
              }

              let content: string;
              if (typeof contentData.content === "string") {
                content = contentData.content;
              } else if (contentData.content instanceof Blob) {
                content = await contentData.content.text();
              } else {
                throw new Error("Unsupported content type for file");
              }

              const fileLabel = isApplet ? "Applet" : "Document";
              const charCount = content.length;
              const resultMessage = `${fileLabel} content: ${fileItem.name} (${charCount} characters)\n\n${content}`;

              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = "";
            } catch (err) {
              console.error("readFile error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error
                    ? err.message
                    : "Failed to read file content",
              });
              result = "";
            }

            break;
          }
          case "openFile": {
            const { path } = toolCall.input as { path: string };

            // Validate required parameter
            if (!path) {
              console.error(
                "[ToolCall] openFile: Missing required 'path' parameter",
              );
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "No path provided",
              });
              result = ""; // Clear result to prevent duplicate
              break;
            }

            console.log("[ToolCall] openFile:", { path });

            try {
              // Validate path is in supported directories
              const isApplet = path.startsWith("/Applets/");
              const isDocument = path.startsWith("/Documents/");
              const isApplication = path.startsWith("/Applications/");

              if (!isApplet && !isDocument && !isApplication) {
                throw new Error(
                  "Invalid path: Must be in /Applets, /Documents, or /Applications directory",
                );
              }

              // Check if file exists in the files store
              const filesStore = useFilesStore.getState();
              const fileItem = filesStore.items[path];

              if (!fileItem) {
                throw new Error(`File not found: ${path}`);
              }

              if (fileItem.status !== "active") {
                throw new Error(`File is not active: ${path}`);
              }

              if (fileItem.isDirectory) {
                throw new Error(`Path is a directory, not a file: ${path}`);
              }

              if (isApplet) {
                // Handle applet opening
                if (!fileItem.uuid) {
                  throw new Error(
                    `Applet missing UUID for content lookup: ${path}`,
                  );
                }

                const contentData = await dbOperations.get<DocumentContent>(
                  STORES.APPLETS,
                  fileItem.uuid,
                );

                if (!contentData || !contentData.content) {
                  throw new Error(`Failed to read applet content: ${path}`);
                }

                // Convert content to string if it's a Blob
                let content: string;
                if (contentData.content instanceof Blob) {
                  content = await contentData.content.text();
                } else {
                  content = contentData.content;
                }

                // Launch applet-viewer with the content
                launchApp("applet-viewer", {
                  initialData: {
                    path: path,
                    content: content,
                  },
                });

                const resultMessage = `Successfully opened applet: ${fileItem.name}`;
                console.log(`[ToolCall] ${resultMessage}`);

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
              } else if (isDocument) {
                // Handle document opening
                if (!fileItem.uuid) {
                  throw new Error(
                    `Document missing UUID for content lookup: ${path}`,
                  );
                }

                const contentData = await dbOperations.get<DocumentContent>(
                  STORES.DOCUMENTS,
                  fileItem.uuid,
                );

                if (!contentData || !contentData.content) {
                  throw new Error(`Failed to read document content: ${path}`);
                }

                // Convert content to string if it's a Blob
                let content: string;
                if (contentData.content instanceof Blob) {
                  content = await contentData.content.text();
                } else {
                  content = contentData.content;
                }

                // Parse markdown content to JSON for TextEdit
                const htmlContent = markdownToHtml(content);
                const contentJson = generateJSON(htmlContent, [
                  StarterKit,
                  Underline,
                  TextAlign.configure({ types: ["heading", "paragraph"] }),
                  TaskList,
                  TaskItem.configure({ nested: true }),
                ] as AnyExtension[]);

                // Launch TextEdit with the document
                const instanceId = launchApp("textedit", { multiWindow: true });

                // Wait for the instance to be created
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Set the document content
                const textEditStore = useTextEditStore.getState();
                textEditStore.updateInstance(instanceId, {
                  filePath: path,
                  contentJson: contentJson,
                  hasUnsavedChanges: false,
                });

                const resultMessage = `Successfully opened document: ${fileItem.name}`;
                console.log(`[ToolCall] ${resultMessage}`);

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
              } else if (isApplication) {
                // Handle application launching
                const appId = path.replace("/Applications/", "") as AppId;

                // Validate app exists in registry
                if (!appRegistry[appId]) {
                  throw new Error(`Application not found: ${appId}`);
                }

                // Launch the application
                launchApp(appId);

                const appName = appRegistry[appId].name;
                const resultMessage = `Successfully launched application: ${appName}`;
                console.log(`[ToolCall] ${resultMessage}`);

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
              }

              result = ""; // Clear result to prevent duplicate
            } catch (err) {
              console.error("openFile error:", err);
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText:
                  err instanceof Error ? err.message : "Failed to open file",
              });
              result = ""; // Clear result to prevent duplicate
            }
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
          errorText: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    onFinish: ({ messages }) => {
      // Ensure all messages have metadata with createdAt
      const finalMessages: AIChatMessage[] = (messages as UIMessage[]).map(
        (msg) =>
          ({
            ...msg,
            metadata: {
              createdAt:
                (msg as AIChatMessage).metadata?.createdAt || new Date(),
            },
          }) as AIChatMessage,
      );
      console.log(
        `AI finished, syncing ${finalMessages.length} final messages to store.`,
      );
      setAiMessages(finalMessages);

      // Ensure any final content that wasn't processed is spoken
      if (!speechEnabled) return;
      const lastMsg = finalMessages.at(-1);
      if (!lastMsg || lastMsg.role !== "assistant") return;

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

    onError: (err) => {
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
          action: onPromptSetUsername
            ? {
                label: "Login",
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
              handleAuthError("Your session has expired. Please login again.");
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
          toast.error("Rate Limit Exceeded", {
            description:
              "You've reached the message limit. Please login to continue.",
            duration: 5000,
            action: onPromptSetUsername
              ? {
                  label: "Login",
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
      toast.error("AI Error", {
        description: err.message || "Failed to get response.",
      });
    },
  });

  // Ensure all messages have metadata with timestamps (runs synchronously during render)
  const messagesWithTimestamps = useMemo<AIChatMessage[]>(() => {
    return (currentSdkMessages as UIMessage[]).map((msg) => {
      // Check if this message already exists in the store
      const existingMsg = aiMessages.find((m) => m.id === msg.id);
      const currentMsg = msg as AIChatMessage;

      return {
        ...msg,
        metadata: {
          createdAt:
            currentMsg.metadata?.createdAt ||
            existingMsg?.metadata?.createdAt ||
            new Date(),
        },
      } as AIChatMessage;
    });
  }, [currentSdkMessages, aiMessages]);

  // Ref to hold the latest SDK messages for use in callbacks
  const currentSdkMessagesRef = useRef<AIChatMessage[]>([]);
  currentSdkMessagesRef.current = messagesWithTimestamps;

  // --- State Synchronization & Message Processing ---
  // Sync store to SDK ONLY on initial load or external store changes
  useEffect(() => {
    // If aiMessages (from store) differs from the SDK state, update SDK.
    // This handles loading persisted messages.
    // Avoid deep comparison issues by comparing lengths and last message ID/content
    if (
      aiMessages.length !== currentSdkMessages.length ||
      (aiMessages.length > 0 &&
        aiMessages[aiMessages.length - 1].id !==
          currentSdkMessages[currentSdkMessages.length - 1]?.id)
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

    let scanPos = progress;
    const processChunk = (endPos: number) => {
      const rawChunk = content.slice(scanPos, endPos);
      const cleaned = cleanTextForSpeech(rawChunk);
      if (cleaned) {
        const seg = { messageId: lastMsg.id, start: scanPos, end: endPos };
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
      scanPos = endPos;
      speechProgressRef.current[lastMsg.id] = scanPos;
    };

    // Iterate over any *completed* lines since the last progress marker.
    while (scanPos < content.length) {
      const nextNlIdx = content.indexOf("\n", scanPos);
      if (nextNlIdx === -1) {
        // No further newlines - wait for more content or let onFinish handle the rest
        break;
      }

      // We have a newline that marks the end of a full chunk.
      processChunk(nextNlIdx);

      // Skip the newline (and potential carriage-return) characters.
      scanPos = nextNlIdx + 1;
      if (content[scanPos] === "\r") scanPos += 1;

      // Record updated progress so subsequent effect runs start after the newline
      speechProgressRef.current[lastMsg.id] = scanPos;
    }
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
      if (!messageContent.trim()) return; // Don't submit empty messages

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
      setInput(""); // Clear input after sending
    },
    [
      sendMessage,
      input,
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
    handleDirectMessageSubmit("👋 *nudge sent*");
    // Consider adding shake effect trigger here if needed
  }, [handleDirectMessageSubmit]);

  const clearChats = useCallback(() => {
    console.log("Clearing AI chats");

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
      parts: [{ type: "text", text: "👋 hey! i'm ryo. ask me anything!" }],
      metadata: {
        createdAt: new Date(),
      },
    };
    const initialText = getAssistantVisibleText(initialMessage);
    speechProgressRef.current[initialMessage.id] = initialText.length;

    // Update both the Zustand store and the SDK state directly
    setAiMessages([initialMessage]);
    setSdkMessages([initialMessage]);
  }, [setAiMessages, setSdkMessages, stopTts]);

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
      const transcript = aiMessages // Use messages from store
        .map((msg: UIMessage) => {
          const time = ""; // v5 UIMessage doesn't have createdAt
          const sender = msg.role === "user" ? username || "You" : "Ryo";
          const content = getAssistantVisibleText(msg);
          return `**${sender}** (${time}):\n${content}`;
        })
        .join("\n\n");

      const finalFileName = fileName.endsWith(".md")
        ? fileName
        : `${fileName}.md`;
      const filePath = `/Documents/${finalFileName}`;

      try {
        await saveFile({
          path: filePath,
          name: finalFileName,
          content: transcript,
          type: "markdown", // Explicitly set type
          icon: "/icons/file-text.png",
        });

        setIsSaveDialogOpen(false);
        toast.success("Transcript saved", {
          description: `Saved to ${finalFileName}`,
          duration: 3000,
        });
      } catch (error) {
        console.error("Error saving transcript:", error);
        toast.error("Failed to save transcript", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [aiMessages, username, saveFile],
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
