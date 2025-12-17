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
import { getApiUrl } from "@/utils/platform";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp, type LaunchAppOptions } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import { requestCloseWindow } from "@/utils/windowUtils";
import {
  useFileSystem,
  dbOperations,
  STORES,
  type DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdown";
import { AnyExtension } from "@tiptap/core";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";

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


const stripDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");

const normalizeSearchText = (value: string): string =>
  stripDiacritics(value).toLowerCase();

const isLooseSubsequence = (target: string, pattern: string): boolean => {
  if (pattern.length === 0) {
    return true;
  }

  let searchStart = 0;
  for (const char of pattern) {
    const foundIndex = target.indexOf(char, searchStart);
    if (foundIndex === -1) {
      return false;
    }
    searchStart = foundIndex + 1;
  }
  return true;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(a.length + 1);
  const current = new Array<number>(a.length + 1);

  for (let i = 0; i <= a.length; i += 1) {
    previous[i] = i;
  }

  for (let i = 1; i <= b.length; i += 1) {
    current[0] = i;
    const bChar = b[i - 1]!;

    for (let j = 1; j <= a.length; j += 1) {
      const substitutionCost = bChar === a[j - 1]! ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1, // insertion
        previous[j]! + 1, // deletion
        previous[j - 1]! + substitutionCost, // substitution
      );
    }

    for (let j = 0; j <= a.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[a.length]!;
};

const bestSubstringDistance = (text: string, query: string): number => {
  const textLength = text.length;
  const queryLength = query.length;

  if (queryLength === 0) return 0;
  if (textLength === 0) return queryLength;
  if (queryLength >= textLength) {
    return levenshteinDistance(text, query);
  }

  let best = Number.MAX_SAFE_INTEGER;
  const maxOffset = textLength - queryLength;

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const window = text.slice(offset, offset + queryLength);
    const distance = levenshteinDistance(window, query);
    if (distance < best) {
      best = distance;
      if (best === 0) {
        break;
      }
    }
  }

  return best;
};

const computeMatchScore = (
  text: string,
  query: string,
  tokens: string[],
): number => {
  if (!query) return 1;
  if (!text) return 0;

  let score = 0;

  const includeIndex = text.indexOf(query);
  if (includeIndex !== -1) {
    const includeScore =
      0.7 +
      (1 - includeIndex / Math.max(text.length, query.length)) * 0.3;
    score = Math.max(score, Math.min(1, includeScore));
  }

  if (isLooseSubsequence(text, query)) {
    const subsequenceScore =
      0.5 +
      Math.min(
        0.4,
        (query.length / Math.max(text.length, query.length)) * 0.4,
      );
    score = Math.max(score, Math.min(1, subsequenceScore));
  }

  const maxLen = Math.max(query.length, Math.min(text.length, query.length));
  if (maxLen > 0) {
    const distance = bestSubstringDistance(text, query);
    const distanceScore = 1 - distance / (maxLen + 1);
    score = Math.max(score, Math.max(0, distanceScore));
  }

  if (tokens.length > 1) {
    let tokenAccumulator = 0;
    for (const token of tokens) {
      if (!token) continue;
      const tokenIndex = text.indexOf(token);
      if (tokenIndex !== -1) {
        tokenAccumulator += 1;
        continue;
      }
      const tokenMaxLen = Math.max(
        token.length,
        Math.min(text.length, token.length),
      );
      if (tokenMaxLen === 0) continue;
      const tokenDistance = bestSubstringDistance(text, token);
      const tokenScore = 1 - tokenDistance / (tokenMaxLen + 1);
      if (tokenScore > 0.5) {
        tokenAccumulator += tokenScore;
      }
    }
    if (tokenAccumulator > 0) {
      const normalizedTokenScore = tokenAccumulator / tokens.length;
      score = Math.max(score, Math.min(1, normalizedTokenScore));
    }
  }

  return Math.max(0, Math.min(1, score));
};

const deriveScoreThreshold = (queryLength: number): number => {
  if (queryLength <= 2) return 0.65;
  if (queryLength <= 4) return 0.55;
  if (queryLength <= 6) return 0.5;
  if (queryLength <= 8) return 0.45;
  return 0.4;
};

// Helper function to detect user's operating system
const detectUserOS = (): string => {
  if (typeof navigator === "undefined") return "Unknown";
  
  const userAgent = navigator.userAgent;
  const platform = navigator.platform || "";
  
  // Check for iOS (iPhone, iPad, iPod)
  if (/iPad|iPhone|iPod/.test(userAgent) || 
      (platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "iOS";
  }
  
  // Check for Android
  if (/Android/.test(userAgent)) {
    return "Android";
  }
  
  // Check for Windows
  if (/Win/.test(platform)) {
    return "Windows";
  }
  
  // Check for macOS (not iOS)
  if (/Mac/.test(platform)) {
    return "macOS";
  }
  
  // Check for Linux
  if (/Linux/.test(platform)) {
    return "Linux";
  }
  
  return "Unknown";
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
  const languageStore = useLanguageStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack =
    ipodStore.tracks &&
    ipodStore.currentIndex >= 0 &&
    ipodStore.currentIndex < ipodStore.tracks.length
      ? ipodStore.tracks[ipodStore.currentIndex]
      : null;

  // Detect user's operating system
  const userOS = detectUserOS();

  // Use new instance-based model instead of legacy apps
  const runningInstances = Object.entries(appStore.instances)
    .filter(([, instance]) => instance.isOpen)
    .map(([instanceId, instance]) => {
      const base = {
        instanceId,
        appId: instance.appId,
        isForeground: instance.isForeground || false,
        title: instance.title,
      };
      // For applet-viewer instances, include the applet path
      if (instance.appId === "applet-viewer" && instance.initialData) {
        const appletData = instance.initialData as { path?: string; shareCode?: string };
        return {
          ...base,
          appletPath: appletData.path || undefined,
          appletId: appletData.shareCode || undefined,
        };
      }
      return base;
    });

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
    userOS,
    locale: languageStore.current,
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
  const { t } = useTranslation();
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

  // Note: We no longer auto-call ensureAuthToken here.
  // Tokens are obtained via:
  // 1. createUser (new account registration)
  // 2. authenticateWithPassword (password login)
  // 3. Token login (user provides existing token)
  // The ensureAuthToken function is only called explicitly before sending
  // messages as a fallback for legacy users without tokens.

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
                errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
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

            // Close all open instances of this app (with animation and sound)
            openInstances.forEach((instance) => {
              requestCloseWindow(instance.instanceId);
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
          case "ipodControl": {
            const {
              action = "toggle",
              id,
              title,
              artist,
              enableVideo,
              enableTranslation,
              enableFullscreen,
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
              enableVideo?: boolean;
              enableTranslation?: string | null;
              enableFullscreen?: boolean;
            };

            console.log("[ToolCall] ipodControl:", {
              action,
              id,
              title,
              artist,
              enableVideo,
              enableTranslation,
              enableFullscreen,
            });

            // Check if user is on iOS (cannot auto-play due to browser restrictions)
            const isIOS = detectUserOS() === "iOS";

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

            // Helper function to apply video, translation, and fullscreen settings
            // Returns an array of state change messages
            const applyIpodSettings = (): string[] => {
              const ipod = useIpodStore.getState();
              const stateChanges: string[] = [];
              
              if (enableVideo !== undefined) {
                if (enableVideo && !ipod.showVideo) {
                  ipod.setShowVideo(true);
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnVideo"));
                  console.log("[ToolCall] Video enabled.");
                } else if (!enableVideo && ipod.showVideo) {
                  ipod.setShowVideo(false);
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffVideo"));
                  console.log("[ToolCall] Video disabled.");
                }
              }

              if (enableTranslation !== undefined) {
                // Check for values that should disable translation
                const disableValues = ['original', 'off', 'none', 'disable', 'disabled', 'null'];
                const shouldDisable = enableTranslation === null || 
                  enableTranslation === "" || 
                  (typeof enableTranslation === 'string' && disableValues.includes(enableTranslation.toLowerCase()));
                
                if (shouldDisable) {
                  ipod.setLyricsTranslationLanguage(null);
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffLyricsTranslation"));
                  console.log("[ToolCall] Lyrics translation disabled.");
                } else {
                  ipod.setLyricsTranslationLanguage(enableTranslation);
                  const currentTrack = ipod.tracks[ipod.currentIndex];
                  if (currentTrack?.id) {
                    ipod.setLyricsTranslationRequest(enableTranslation, currentTrack.id);
                  }
                  // Map language codes to readable names
                  const languageNames: Record<string, string> = {
                    'en': 'English',
                    'zh-TW': 'Traditional Chinese',
                    'zh-CN': 'Simplified Chinese',
                    'ja': 'Japanese',
                    'ko': 'Korean',
                    'es': 'Spanish',
                    'fr': 'French',
                    'de': 'German',
                    'pt': 'Portuguese',
                    'it': 'Italian',
                    'ru': 'Russian',
                  };
                  const langName = languageNames[enableTranslation] || enableTranslation;
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTranslatedLyricsTo", { langName }));
                  console.log(`[ToolCall] Lyrics translation enabled for language: ${enableTranslation}.`);
                }
              }

              if (enableFullscreen !== undefined) {
                if (enableFullscreen && !ipod.isFullScreen) {
                  ipod.toggleFullScreen();
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnFullScreen"));
                  console.log("[ToolCall] Fullscreen enabled.");
                } else if (!enableFullscreen && ipod.isFullScreen) {
                  ipod.toggleFullScreen();
                  stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffFullScreen"));
                  console.log("[ToolCall] Fullscreen disabled.");
                }
              }

              return stateChanges;
            };

            const normalizedAction = action ?? "toggle";

            if (
              normalizedAction === "toggle" ||
              normalizedAction === "play" ||
              normalizedAction === "pause"
            ) {
              const ipod = useIpodStore.getState();

              // On iOS, don't auto-play - inform user to press play manually
              if (isIOS && (normalizedAction === "play" || normalizedAction === "toggle")) {
                const stateChanges = applyIpodSettings();
                const resultParts = [i18n.t("apps.chats.toolCalls.ipodReady")];
                if (stateChanges.length > 0) {
                  resultParts.push(...stateChanges);
                }
                
                // Only add periods when joining multiple sentences
                const resultMessage = resultParts.length > 1 
                  ? resultParts.join(". ") + "."
                  : resultParts[0];
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
                result = "";
                console.log("[ToolCall] iOS detected - user must manually start playback.");
                break;
              }

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

              const stateChanges = applyIpodSettings();
              const updatedIpod = useIpodStore.getState();
              const nowPlaying = updatedIpod.isPlaying;
              const track = updatedIpod.tracks[updatedIpod.currentIndex];
              
              let playbackState: string;
              if (track) {
                const trackDesc = `${track.title}${track.artist ? ` by ${track.artist}` : ""}`;
                playbackState = nowPlaying 
                  ? i18n.t("apps.chats.toolCalls.ipodPlayingTrack", { trackDesc })
                  : i18n.t("apps.chats.toolCalls.ipodPausedTrack", { trackDesc });
              } else {
                playbackState = nowPlaying 
                  ? i18n.t("apps.chats.toolCalls.ipodPlaying")
                  : i18n.t("apps.chats.toolCalls.ipodPaused");
              }
              const resultParts = [playbackState];
              if (stateChanges.length > 0) {
                resultParts.push(...stateChanges);
              }
              
              // Only add periods when joining multiple sentences
              const resultMessage = resultParts.length > 1 
                ? resultParts.join(". ") + "."
                : resultParts[0];
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
              
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
                const errorMsg = i18n.t("apps.chats.toolCalls.ipodSongNotFound");
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: errorMsg,
                });
                result = ""; // Clear result to prevent duplicate
                console.log(`[ToolCall] ${errorMsg}`);
                break;
              }

              const randomIndexFromArray =
                finalCandidateIndices[
                  Math.floor(Math.random() * finalCandidateIndices.length)
                ];

              const { setCurrentIndex, setIsPlaying } = useIpodStore.getState();
              setCurrentIndex(randomIndexFromArray);
              
              const track = tracks[randomIndexFromArray];
              const trackDescForLog = `${track.title}${
                track.artist ? ` by ${track.artist}` : ""
              }`;

              // On iOS, don't auto-play - just select the track
              if (isIOS) {
                const stateChanges = applyIpodSettings();
                // Build track description for translation
                const trackDescForMsg = track.artist 
                  ? `${track.title} by ${track.artist}`
                  : track.title;
                const resultParts = [i18n.t("apps.chats.toolCalls.ipodSelected", { trackDesc: trackDescForMsg })];
                if (stateChanges.length > 0) {
                  resultParts.push(...stateChanges);
                }
                
                // Only add periods when joining multiple sentences
                const resultMessage = resultParts.length > 1 
                  ? resultParts.join(". ") + "."
                  : resultParts[0];
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
                result = "";
                console.log(`[ToolCall] iOS detected - selected ${trackDescForLog}, user must manually start playback.`);
                break;
              }

              setIsPlaying(true);

              const stateChanges = applyIpodSettings();
              
              // Build track description for translation
              const trackDescForMsg = track.artist 
                ? i18n.t("apps.chats.toolCalls.playingByArtist", { title: track.title, artist: track.artist })
                : i18n.t("apps.chats.toolCalls.playing", { title: track.title });
              
              const resultParts = [trackDescForMsg];
              if (stateChanges.length > 0) {
                resultParts.push(...stateChanges);
              }
              
              // Only add periods when joining multiple sentences
              const resultMessage = resultParts.length > 1 
                ? resultParts.join(". ") + "."
                : resultParts[0];
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
              
              console.log(`[ToolCall] Playing ${trackDescForLog}.`);
              break;
            }

            if (normalizedAction === "addAndPlay") {
              if (!id) {
                const errorMsg = "The 'addAndPlay' action requires the 'id' parameter (YouTube ID or URL).";
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: errorMsg,
                });
                result = ""; // Clear result to prevent duplicate
                console.error(`[ToolCall] ${errorMsg}`);
                break;
              }

              try {
                // On iOS, use addTrackFromVideoId with autoPlay=false
                const addedTrack = await useIpodStore
                  .getState()
                  .addTrackFromVideoId(id, !isIOS); // autoPlay = true for non-iOS, false for iOS

                if (addedTrack) {
                  const stateChanges = applyIpodSettings();
                  
                  // Different message for iOS vs other platforms
                  const resultParts = isIOS
                    ? [i18n.t("apps.chats.toolCalls.ipodAdded", { title: addedTrack.title })]
                    : [i18n.t("apps.chats.toolCalls.ipodAddedAndPlaying", { title: addedTrack.title })];
                  
                  if (stateChanges.length > 0) {
                    resultParts.push(...stateChanges);
                  }
                  
                  // Only add periods when joining multiple sentences
                  const resultMessage = resultParts.length > 1 
                    ? resultParts.join(". ") + "."
                    : resultParts[0];
                  addToolResult({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    output: resultMessage,
                  });
                  result = ""; // Clear result to prevent duplicate
                  
                  console.log(
                    isIOS
                      ? `[ToolCall] iOS detected - added '${addedTrack.title}' to iPod, user must manually start playback.`
                      : `[ToolCall] Added '${addedTrack.title}' to iPod and started playing.`,
                  );
                  break;
                } else {
                  const errorMsg = i18n.t("apps.chats.toolCalls.ipodFailedToAdd", { id });
                  addToolResult({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    output: errorMsg,
                  });
                  result = ""; // Clear result to prevent duplicate
                  console.error(`[ToolCall] ${errorMsg}`);
                  break;
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                console.error(`[iPod] Error adding ${id}:`, error);

                let errorMsg: string;
                if (errorMessage.includes("Failed to fetch video info")) {
                  errorMsg = i18n.t("apps.chats.toolCalls.ipodCannotAdd", { id });
                } else {
                  errorMsg = i18n.t("apps.chats.toolCalls.ipodFailedToAddWithError", { id, error: errorMessage });
                }
                
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: errorMsg,
                });
                result = ""; // Clear result to prevent duplicate
                
                console.error(`[ToolCall] ${errorMsg}`);
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

              const stateChanges = applyIpodSettings();

              const updatedIpod = useIpodStore.getState();
              const track = updatedIpod.tracks[updatedIpod.currentIndex];
              if (track) {
                const desc = `${track.title}${
                  track.artist ? ` by ${track.artist}` : ""
                }`;
                const resultParts = [
                  normalizedAction === "next"
                    ? i18n.t("apps.chats.toolCalls.ipodSkippedTo", { trackDesc: desc })
                    : i18n.t("apps.chats.toolCalls.ipodWentBackTo", { trackDesc: desc })
                ];
                if (stateChanges.length > 0) {
                  resultParts.push(...stateChanges);
                }
                
                // Only add periods when joining multiple sentences
                const resultMessage = resultParts.length > 1 
                  ? resultParts.join(". ") + "."
                  : resultParts[0];
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: resultMessage,
                });
                result = ""; // Clear result to prevent duplicate
                
                console.log(`[ToolCall] ${normalizedAction === "next" ? "Skipped to" : "Went back to"} ${desc}.`);
                break;
              }

              const resultParts = [
                normalizedAction === "next"
                  ? i18n.t("apps.chats.toolCalls.ipodSkippedToNext")
                  : i18n.t("apps.chats.toolCalls.ipodWentBackToPrevious")
              ];
              if (stateChanges.length > 0) {
                resultParts.push(...stateChanges);
              }
              
              // Only add periods when joining multiple sentences
              const resultMessage = resultParts.length > 1 
                ? resultParts.join(". ") + "."
                : resultParts[0];
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
              
              console.log(
                `[ToolCall] ${
                  normalizedAction === "next"
                    ? "Skipped to next track."
                    : "Went back to previous track."
                }`,
              );
              break;
            }

            // Apply settings even if action is unhandled
            const stateChanges = applyIpodSettings();
            
            if (stateChanges.length > 0) {
              // Only add periods when joining multiple sentences
              const resultMessage = stateChanges.length > 1 
                ? stateChanges.join(". ") + "."
                : stateChanges[0];
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: resultMessage,
              });
              result = ""; // Clear result to prevent duplicate
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

                const response = await fetch(getApiUrl("/api/share-applet?list=true"));
                if (!response.ok) {
                  throw new Error(`Failed to list shared applets (HTTP ${response.status})`);
                }

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
                const trackIndex = ipodState.tracks.findIndex((t) => t.id === songId);

                if (trackIndex === -1) {
                  throw new Error(`Song not found: ${songId}`);
                }

                // Ensure iPod is open
                const appState = useAppStore.getState();
                const ipodInstances = appState.getInstancesByAppId("ipod");
                if (!ipodInstances.some((inst) => inst.isOpen)) {
                  launchApp("ipod");
                }

                ipodState.setCurrentIndex(trackIndex);
                ipodState.setIsPlaying(true);

                const track = ipodState.tracks[trackIndex];
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
                  const response = await fetch(getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`));
                  if (response.ok) {
                    const data = await response.json();
                    appletName = data.title || data.name || shareId;
                  }
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

                let content: string;
                if (contentData.content instanceof Blob) {
                  content = await contentData.content.text();
                } else {
                  content = contentData.content;
                }

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
                const filesStore = useFilesStore.getState();
                const fileItem = filesStore.items[path];

                if (!fileItem || fileItem.status !== "active") {
                  throw new Error(`Document not found: ${path}`);
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

                let content: string;
                if (contentData.content instanceof Blob) {
                  content = await contentData.content.text();
                } else {
                  content = contentData.content;
                }

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
                const response = await fetch(getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`));

                if (!response.ok) {
                  throw new Error(`Failed to fetch shared applet (HTTP ${response.status})`);
                }

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

                let content: string;
                if (typeof contentData.content === "string") {
                  content = contentData.content;
                } else if (contentData.content instanceof Blob) {
                  content = await contentData.content.text();
                } else {
                  throw new Error("Unsupported content type");
                }

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

            // Validate path format for documents
            if (!path.startsWith("/Documents/")) {
              addToolResult({
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
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.invalidFilename", { fileName }),
              });
              result = "";
              break;
            }

            if (!content && mode === "overwrite") {
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.noContentProvided"),
              });
              result = "";
              break;
            }

            console.log("[ToolCall] write:", { path, mode, contentLength: content?.length });

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
                  const existingContent = typeof existingData.content === "string"
                    ? existingData.content
                    : await existingData.content.text();
                  finalContent = mode === "prepend"
                    ? content + existingContent
                    : existingContent + content;
                }
              }

              // Save metadata to file store (addItem generates UUID for new files, preserves for existing)
              useFilesStore.getState().addItem({
                path,
                name: fileName,
                isDirectory: false,
                type: "markdown",
                size: new Blob([finalContent]).size,
                icon: "📄",
              });

              // Get the saved item with UUID
              const savedItem = useFilesStore.getState().items[path];
              if (!savedItem?.uuid) {
                throw new Error("Failed to save document metadata");
              }

              // Save content to IndexedDB
              await dbOperations.put<DocumentContent>(
                STORES.DOCUMENTS,
                { name: fileName, content: finalContent },
                savedItem.uuid,
              );

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
                const contentJson = generateJSON(htmlFragment, [
                  StarterKit,
                  Underline,
                  TextAlign.configure({ types: ["heading", "paragraph"] }),
                  TaskList,
                  TaskItem.configure({ nested: true }),
                ] as AnyExtension[]);

                textEditStore.updateInstance(targetInstanceId, {
                  filePath: path,
                  contentJson,
                  hasUnsavedChanges: false, // Already saved to disk
                });

                // Dispatch event to update the editor content
                window.dispatchEvent(
                  new CustomEvent("documentUpdated", {
                    detail: { path, content: JSON.stringify(contentJson) },
                  })
                );

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
                trackNewTextEditInstance(targetInstanceId);
              }

              const outputKey = isNewFile ? "createdDocument" : "updatedDocument";
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                output: i18n.t(`apps.chats.toolCalls.${outputKey}`, { path }),
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

            if (!path || typeof old_string !== "string" || typeof new_string !== "string") {
              addToolResult({
                tool: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: i18n.t("apps.chats.toolCalls.missingEditParameters"),
              });
              result = "";
              break;
            }

            console.log("[ToolCall] edit:", { path, old_string: old_string.substring(0, 50) + "...", new_string: new_string.substring(0, 50) + "..." });

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

                const existingContent = typeof contentData.content === "string"
                  ? contentData.content
                  : await contentData.content.text();

                // Normalize existing content
                const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

                // Check for uniqueness - count occurrences
                const occurrences = normalizedExisting.split(normalizedOldString).length - 1;
                
                if (occurrences === 0) {
                  addToolResult({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
                  });
                  result = "";
                  break;
                }

                if (occurrences > 1) {
                  addToolResult({
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

                // Save updated content to IndexedDB
                await dbOperations.put<DocumentContent>(
                  STORES.DOCUMENTS,
                  { name: fileItem.name, content: updatedContent },
                  fileItem.uuid,
                );

                // Update file size in metadata
                filesStore.addItem({
                  ...fileItem,
                  size: new Blob([updatedContent]).size,
                });

                // Also update any open TextEdit instance showing this file
                const textEditState = useTextEditStore.getState();
                for (const [instanceId, instance] of Object.entries(textEditState.instances)) {
                  if (instance.filePath === path) {
                    const updatedHtml = markdownToHtml(updatedContent);
                    const updatedJson = generateJSON(updatedHtml, [
                      StarterKit,
                      Underline,
                      TextAlign.configure({ types: ["heading", "paragraph"] }),
                      TaskList,
                      TaskItem.configure({ nested: true }),
                    ] as AnyExtension[]);

                    textEditState.updateInstance(instanceId, {
                      contentJson: updatedJson,
                      hasUnsavedChanges: false, // Already saved to disk
                    });
                    break;
                  }
                }

                addToolResult({
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

                const existingContent = typeof contentData.content === "string"
                  ? contentData.content
                  : await contentData.content.text();

                // Normalize existing content
                const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

                // Check for uniqueness - count occurrences
                const occurrences = normalizedExisting.split(normalizedOldString).length - 1;
                
                if (occurrences === 0) {
                  addToolResult({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
                  });
                  result = "";
                  break;
                }

                if (occurrences > 1) {
                  addToolResult({
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

                // Save to IndexedDB
                await dbOperations.put<DocumentContent>(
                  STORES.APPLETS,
                  { name: fileItem.uuid, content: updatedContent },
                  fileItem.uuid,
                );

                // Update file size in metadata
                filesStore.addItem({
                  ...fileItem,
                  size: new Blob([updatedContent]).size,
                });

                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: i18n.t("apps.chats.toolCalls.editedApplet", { path }),
                });
                result = "";
              } else {
                addToolResult({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  state: "output-error",
                  errorText: i18n.t("apps.chats.toolCalls.invalidPathForEdit", { path }),
                });
                result = "";
              }
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
            const {
              language,
              theme,
              masterVolume,
              speechEnabled,
              checkForUpdates,
            } = toolCall.input as {
              language?: string;
              theme?: OsThemeId;
              masterVolume?: number;
              speechEnabled?: boolean;
              checkForUpdates?: boolean;
            };

            const changes: string[] = [];
            const appStore = useAppStore.getState();
            const langStore = useLanguageStore.getState();
            const themeStore = useThemeStore.getState();

            // Language change
            if (language !== undefined) {
              // Use translation keys for language names (reuse iPod translation keys)
              const getLanguageDisplayName = (langCode: string): string => {
                const langMap: Record<string, string> = {
                  en: "apps.ipod.translationLanguages.english",
                  "zh-TW": "apps.ipod.translationLanguages.chinese",
                  ja: "apps.ipod.translationLanguages.japanese",
                  ko: "apps.ipod.translationLanguages.korean",
                  fr: "apps.ipod.translationLanguages.french",
                  de: "apps.ipod.translationLanguages.german",
                  es: "apps.ipod.translationLanguages.spanish",
                  pt: "apps.ipod.translationLanguages.portuguese",
                  it: "apps.ipod.translationLanguages.italian",
                  ru: "apps.ipod.translationLanguages.russian",
                };
                const key = langMap[langCode];
                if (key) {
                  const translated = i18n.t(key);
                  // If translation doesn't exist, fall back to code
                  return translated !== key ? translated : langCode;
                }
                return langCode;
              };
              langStore.setLanguage(language as "en" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "pt" | "it" | "ru");
              changes.push(
                i18n.t("apps.chats.toolCalls.settingsLanguageChanged", {
                  language: getLanguageDisplayName(language),
                })
              );
              console.log(`[ToolCall] Language changed to: ${language}`);
            }

            // Theme change
            if (theme !== undefined) {
              if (themeStore.current !== theme) {
                themeStore.setTheme(theme);
                const themeName = themes[theme]?.name || theme;
                changes.push(
                  i18n.t("apps.chats.toolCalls.settingsThemeChanged", {
                    theme: themeName,
                  })
                );
                console.log(`[ToolCall] Theme changed to: ${theme}`);
              }
            }

            // Master volume
            if (masterVolume !== undefined) {
              appStore.setMasterVolume(masterVolume);
              const volumePercent = Math.round(masterVolume * 100);
              changes.push(
                i18n.t("apps.chats.toolCalls.settingsMasterVolumeSet", {
                  volume: volumePercent,
                })
              );
              console.log(`[ToolCall] Master volume set to: ${masterVolume}`);
            }

            // Speech enabled
            if (speechEnabled !== undefined) {
              appStore.setSpeechEnabled(speechEnabled);
              changes.push(
                speechEnabled
                  ? i18n.t("apps.chats.toolCalls.settingsSpeechEnabled")
                  : i18n.t("apps.chats.toolCalls.settingsSpeechDisabled")
              );
              console.log(`[ToolCall] Speech ${speechEnabled ? "enabled" : "disabled"}`);
            }

            // Check for updates
            if (checkForUpdates) {
              import("@/utils/prefetch").then(({ forceRefreshCache }) => {
                forceRefreshCache();
              });
              changes.push(i18n.t("apps.chats.toolCalls.settingsCheckingForUpdates"));
              console.log("[ToolCall] Checking for updates...");
            }

            // Build result message
            if (changes.length > 0) {
              const resultMessage =
                changes.length === 1
                  ? changes[0]
                  : changes.join(". ") + ".";
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
                output: i18n.t("apps.chats.toolCalls.settingsNoChanges"),
              });
              result = "";
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
          errorText: err instanceof Error ? err.message : i18n.t("apps.chats.toolCalls.unknownError"),
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
    handleDirectMessageSubmit(t("apps.chats.status.nudgeSent"));
    // Consider adding shake effect trigger here if needed
  }, [handleDirectMessageSubmit, t]);

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
        toast.success(isUpdate ? "Transcript updated" : "Transcript saved", {
          description: `Saved to ${finalFileName}`,
          duration: 5000,
          action: {
            label: "Open",
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
        toast.error("Failed to save transcript", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [username, saveFile, launchApp],
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
