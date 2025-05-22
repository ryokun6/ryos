import { useState, useEffect, useCallback, useRef } from "react";
import { useChat, type Message } from "ai/react";
import { useChatsStore } from "../../../stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp, type LaunchAppOptions } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdown";
import { AnyExtension, JSONContent } from "@tiptap/core";

// TODO: Move relevant state and logic from ChatsAppComponent here
// - AI chat state (useChat hook)
// - Message processing (app control markup)
// - System state generation
// - Dialog states (clear, save)

// Replace or update the getSystemState function to use stores
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const textEditStore = useTextEditStore.getState();
  const chatsStore = useChatsStore.getState();

  const currentVideo = videoStore.videos[videoStore.currentIndex];
  const currentTrack = ipodStore.tracks[ipodStore.currentIndex];

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
    (inst) => !inst.isForeground
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
    return {
      instanceId: instance.instanceId,
      filePath: instance.filePath,
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
    // Keep legacy apps for backward compatibility, but mark that instances are preferred
    apps: appStore.apps,
    username: chatsStore.username,
    userLocalTime: {
      timeString: userTimeString,
      dateString: userDateString,
      timeZone: userTimeZone,
    },
    runningApps: {
      foreground: foregroundInstance,
      background: backgroundInstances,
      instanceWindowOrder: appStore.instanceWindowOrder,
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
      library: ipodStore.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
      })),
    },
    textEdit: {
      instances: textEditInstancesData,
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
const getAssistantVisibleText = (message: Message): string => {
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

  // Fallback to content if no parts
  const text = message.content || "";
  return text.startsWith("!!!!") ? text.slice(4).trimStart() : text;
};

export function useAiChat() {
  const { aiMessages, setAiMessages, username } = useChatsStore();
  const launchApp = useLaunchApp();
  const closeApp = useAppStore((state) => state.closeApp);
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAppStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

  // Track how many characters of each assistant message have already been sent to TTS
  const speechProgressRef = useRef<Record<string, number>>({});

  // Track which messages are currently being processed by onFinish to avoid duplicates
  const onFinishProcessingRef = useRef<Set<string>>(new Set());

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

  // --- AI Chat Hook (Vercel AI SDK) ---
  const {
    messages: currentSdkMessages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    reload,
    error,
    stop: sdkStop,
    setMessages: setSdkMessages,
    append,
  } = useChat({
    api: "/api/chat",
    initialMessages: aiMessages, // Initialize from store
    experimental_throttle: 50,
    body: {
      systemState: getSystemState(), // Initial system state
      model: aiModel, // Pass the selected AI model
    },
    maxSteps: 25,
    async onToolCall({ toolCall }) {
      // Short delay to allow the UI to render the "call" state with a spinner before executing the tool logic.
      // Without this, fast-executing tool calls can jump straight to the "result" state, so users never see the loading indicator.
      await new Promise<void>((resolve) => setTimeout(resolve, 120));

      try {
        switch (toolCall.toolName) {
          case "launchApp": {
            const { id, url, year } = toolCall.args as {
              id: string;
              url?: string;
              year?: string;
            };
            const appName = appRegistry[id as AppId]?.name || id;
            console.log("[ToolCall] launchApp:", { id, url, year });

            const launchOptions: LaunchAppOptions = {};
            if (id === "internet-explorer" && (url || year)) {
              launchOptions.initialData = { url, year: year || "current" };
            }

            if (id === "textedit") {
              const appStore = useAppStore.getState();
              const existing = appStore
                .getInstancesByAppId("textedit")
                .find((inst) => inst.isOpen);

              if (existing) {
                appStore.bringInstanceToForeground(existing.instanceId);
                return `${appName} is already open.`;
              }
            }

            launchApp(id as AppId, launchOptions);

            let confirmationMessage = `Launched ${appName}.`;
            if (id === "internet-explorer") {
              const urlPart = url ? ` to ${url}` : "";
              const yearPart = year && year !== "current" ? ` in ${year}` : "";
              confirmationMessage += `${urlPart}${yearPart}`;
            }
            return confirmationMessage + ".";
          }
          case "closeApp": {
            const { id } = toolCall.args as { id: string };
            const appName = appRegistry[id as AppId]?.name || id;
            console.log("[ToolCall] closeApp:", id);

            // Close all instances of the specified app
            const appStore = useAppStore.getState();
            const appInstances = appStore.getInstancesByAppId(id as AppId);
            const openInstances = appInstances.filter((inst) => inst.isOpen);

            if (openInstances.length === 0) {
              return `${appName} is not currently running.`;
            }

            // Close all open instances of this app
            openInstances.forEach((instance) => {
              appStore.closeAppInstance(instance.instanceId);
            });

            // Also close the legacy app state for backward compatibility
            closeApp(id as AppId);

            return `Closed ${appName} (${openInstances.length} window${
              openInstances.length === 1 ? "" : "s"
            }).`;
          }
          case "textEditSearchReplace": {
            const { search, replace, isRegex, instanceId } = toolCall.args as {
              search: string;
              replace: string;
              isRegex?: boolean;
              instanceId?: string;
            };

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
            let targetInstance;

            if (instanceId) {
              // Use specific instance
              targetInstance = textEditState.instances[instanceId];
              if (!targetInstance) {
                return `TextEdit instance ${instanceId} not found. Available instances: ${
                  Object.keys(textEditState.instances).join(", ") || "none"
                }.`;
              }
            } else {
              // Use foreground instance
              targetInstance = textEditState.getForegroundInstance();
              if (!targetInstance) {
                // No TextEdit window is in foreground, launch a new one
                console.log(
                  "[ToolCall] No foreground TextEdit instance, launching new one..."
                );
                const appStore = useAppStore.getState();
                const newInstanceId = appStore.launchApp(
                  "textedit",
                  undefined,
                  undefined,
                  true
                );

                // Wait a bit for the app to initialize
                await new Promise((resolve) => setTimeout(resolve, 200));

                // Get the newly created instance directly
                const updatedTextEditState = useTextEditStore.getState();
                targetInstance = updatedTextEditState.instances[newInstanceId];

                if (!targetInstance) {
                  return `Failed to create new TextEdit window. Instance ${newInstanceId} not found in store.`;
                }

                console.log(
                  "[ToolCall] Created new TextEdit instance:",
                  newInstanceId
                );
              }
            }

            const { updateInstance } = textEditState;

            if (!targetInstance.contentJson) {
              return "No file currently open in the specified TextEdit instance.";
            }

            try {
              // 1. Convert current JSON document to HTML
              const htmlStr = generateHTML(targetInstance.contentJson, [
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
                return "Nothing found to replace.";
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
              updateInstance(targetInstance.instanceId, {
                contentJson: updatedJson,
                hasUnsavedChanges: true,
              });

              // Bring the target instance to foreground so user can see the changes
              const appStore = useAppStore.getState();
              appStore.bringInstanceToForeground(targetInstance.instanceId);

              const fileName = targetInstance.filePath
                ? targetInstance.filePath.split("/").pop() ||
                  targetInstance.filePath
                : "Untitled";
              return `Replaced "${search}" with "${replace}" in ${fileName}.`;
            } catch (err) {
              console.error("searchReplace error:", err);
              return `Failed to apply search/replace: ${
                err instanceof Error ? err.message : "Unknown error"
              }`;
            }
          }
          case "textEditInsertText": {
            const { text, position, instanceId } = toolCall.args as {
              text: string;
              position?: "start" | "end";
              instanceId?: string;
            };

            console.log("[ToolCall] insertText:", {
              text,
              position,
              instanceId,
            });

            const textEditState = useTextEditStore.getState();
            let targetInstance;

            if (instanceId) {
              // Use specific instance
              targetInstance = textEditState.instances[instanceId];
              if (!targetInstance) {
                return `TextEdit instance ${instanceId} not found. Available instances: ${
                  Object.keys(textEditState.instances).join(", ") || "none"
                }.`;
              }
            } else {
              // Use foreground instance
              targetInstance = textEditState.getForegroundInstance();
              if (!targetInstance) {
                // No TextEdit window is in foreground, launch a new one
                console.log(
                  "[ToolCall] No foreground TextEdit instance, launching new one..."
                );
                const appStore = useAppStore.getState();
                const newInstanceId = appStore.launchApp(
                  "textedit",
                  undefined,
                  undefined,
                  true
                );

                // Wait a bit for the app to initialize
                await new Promise((resolve) => setTimeout(resolve, 200));

                // Get the newly created instance directly
                const updatedTextEditState = useTextEditStore.getState();
                targetInstance = updatedTextEditState.instances[newInstanceId];

                if (!targetInstance) {
                  return `Failed to create new TextEdit window. Instance ${newInstanceId} not found in store.`;
                }

                console.log(
                  "[ToolCall] Created new TextEdit instance:",
                  newInstanceId
                );
              }
            }

            // Insert text into the specific instance
            const { updateInstance } = textEditState;
            const targetInstanceId = targetInstance.instanceId; // Capture the instanceId

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
                JSON.stringify(targetInstance.contentJson)
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
              })
            );

            // Bring the target instance to foreground so user can see the changes
            const appStore = useAppStore.getState();
            appStore.bringInstanceToForeground(targetInstanceId);

            const fileName = targetInstance.filePath
              ? targetInstance.filePath.split("/").pop() ||
                targetInstance.filePath
              : "Untitled";
            return `Inserted text at ${
              position === "start" ? "start" : "end"
            } of ${fileName}.`;
          }
          case "textEditNewFile": {
            const { title } = toolCall.args as {
              title?: string;
            };

            console.log("[ToolCall] newFile:", { title });

            // Create a new TextEdit instance with multi-window support
            const appStore = useAppStore.getState();
            const instanceId = appStore.launchApp(
              "textedit",
              undefined,
              title,
              true
            );

            // Wait a bit for the app to initialize
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Bring the new instance to foreground so user can see it
            appStore.bringInstanceToForeground(instanceId);

            return `Created a new, untitled document in TextEdit${
              title ? ` (${title})` : ""
            }.`;
          }
          case "ipodPlayPause": {
            const { action } = toolCall.args as {
              action?: "play" | "pause" | "toggle";
            };
            console.log("[ToolCall] ipodPlayPause:", { action });

            // Ensure iPod app is open - check instances
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipod = useIpodStore.getState();

            switch (action) {
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
            return nowPlaying ? "iPod is now playing." : "iPod is paused.";
          }
          case "ipodPlaySong": {
            const { id, title, artist } = toolCall.args as {
              id?: string;
              title?: string;
              artist?: string;
            };
            console.log("[ToolCall] ipodPlaySong:", { id, title, artist });

            // Ensure iPod app is open - check instances
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { tracks } = ipodState;

            // Helper for case-insensitive includes
            const ciIncludes = (
              source: string | undefined,
              query: string | undefined
            ): boolean => {
              if (!source || !query) return false;
              return source.toLowerCase().includes(query.toLowerCase());
            };

            let finalCandidateIndices: number[] = [];
            const allTracksWithIndices = tracks.map((t, idx) => ({
              track: t,
              index: idx,
            }));

            // 1. Filter by ID first if provided
            const idFilteredTracks = id
              ? allTracksWithIndices.filter(({ track }) => track.id === id)
              : allTracksWithIndices;

            // 2. Primary filter: title in track.title, artist in track.artist
            // Pass if the respective field (title/artist) is not queried
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
                ({ index }) => index
              );
            } else if (title || artist) {
              // 3. Secondary filter (cross-match) if primary failed AND title/artist was queried
              const secondaryCandidates = idFilteredTracks.filter(
                ({ track }) => {
                  const titleInArtistMatches = title
                    ? ciIncludes(track.artist, title)
                    : false;
                  const artistInTitleMatches = artist
                    ? ciIncludes(track.title, artist)
                    : false;

                  if (title && artist) {
                    // Both title and artist were in the original query
                    return titleInArtistMatches || artistInTitleMatches;
                  }
                  if (title) {
                    // Only title was in original query
                    return titleInArtistMatches;
                  }
                  if (artist) {
                    // Only artist was in original query
                    return artistInTitleMatches;
                  }
                  return false;
                }
              );
              finalCandidateIndices = secondaryCandidates.map(
                ({ index }) => index
              );
            }
            // If only ID was queried and it failed, primaryCandidates would be empty,
            // and the `else if (title || artist)` block wouldn't run.
            // finalCandidateIndices would remain empty.

            if (finalCandidateIndices.length === 0) {
              return "Song not found in iPod library.";
            }

            // If multiple matches, choose one at random
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
            return `Playing ${trackDesc}.`;
          }
          case "ipodAddAndPlaySong": {
            const { id } = toolCall.args as { id: string };
            console.log("[ToolCall] ipodAddAndPlaySong:", { id });

            // Ensure iPod app is open - check instances
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            try {
              const addedTrack = await useIpodStore
                .getState()
                .addTrackFromVideoId(id);

              if (addedTrack) {
                return `Added '${addedTrack.title}' to iPod and started playing.`;
              } else {
                return `Failed to add ${id} to iPod.`;
              }
            } catch (error) {
              // Handle oEmbed failures and other errors
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.error(`[iPod] Error adding ${id}:`, error);

              // Provide a specific response for oEmbed failures
              if (errorMessage.includes("Failed to fetch video info")) {
                return `Cannot add ${id}: Video unavailable or invalid.`;
              }

              return `Failed to add ${id}: ${errorMessage}`;
            }
          }
          case "ipodNextTrack": {
            console.log("[ToolCall] ipodNextTrack");
            // Ensure iPod app is open - check instances
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { nextTrack } = ipodState;
            if (typeof nextTrack === "function") {
              nextTrack();
            }

            const updatedIpod = useIpodStore.getState();
            const track = updatedIpod.tracks[updatedIpod.currentIndex];
            if (track) {
              const desc = `${track.title}${
                track.artist ? ` by ${track.artist}` : ""
              }`;
              return `Skipped to ${desc}.`;
            }
            return "Skipped to next track.";
          }
          case "ipodPreviousTrack": {
            console.log("[ToolCall] ipodPreviousTrack");
            // Ensure iPod app is open - check instances
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { previousTrack } = ipodState;
            if (typeof previousTrack === "function") {
              previousTrack();
            }

            const updatedIpod = useIpodStore.getState();
            const track = updatedIpod.tracks[updatedIpod.currentIndex];
            if (track) {
              const desc = `${track.title}${
                track.artist ? ` by ${track.artist}` : ""
              }`;
              return `Went back to previous track: ${desc}.`;
            }
            return "Went back to previous track.";
          }
          case "generateHtml": {
            const { html } = toolCall.args as { html: string };
            console.log("[ToolCall] generateHtml:", {
              htmlLength: html.length,
            });

            // Return the raw HTML string; ChatMessages will render it via HtmlPreview
            return html.trim();
          }
          default:
            console.warn("Unhandled tool call:", toolCall.toolName);
            return "";
        }
      } catch (err) {
        console.error("Error executing tool call:", err);
        return `Failed to execute ${toolCall.toolName}`;
      }
    },
    onFinish: () => {
      const finalMessages = currentSdkMessagesRef.current;
      console.log(
        `AI finished, syncing ${finalMessages.length} final messages to store.`
      );
      setAiMessages(finalMessages);

      // --- Ensure any unsent remainder is spoken ---
      if (!speechEnabled) return;
      const lastMsg = finalMessages.at(-1);
      if (!lastMsg || lastMsg.role !== "assistant") return;

      const progress = speechProgressRef.current[lastMsg.id] ?? 0;

      // Use helper function to get actual visible text
      const content = getAssistantVisibleText(lastMsg);
      if (progress >= content.length) {
        // Clean up the processing flag even if there's nothing to speak
        onFinishProcessingRef.current.delete(lastMsg.id);
        return;
      }

      const remainingRaw = content.slice(progress);
      const cleaned = cleanTextForSpeech(remainingRaw);
      if (!cleaned) {
        speechProgressRef.current[lastMsg.id] = content.length;
        onFinishProcessingRef.current.delete(lastMsg.id);
        return;
      }

      const seg = {
        messageId: lastMsg.id,
        start: progress,
        end: content.length,
      };
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
        speechProgressRef.current[lastMsg.id] = content.length;
        // Clean up the processing flag when done
        onFinishProcessingRef.current.delete(lastMsg.id);
      });
    },
    onError: (err) => {
      console.error("AI Chat Error:", err);
      toast("AI Error", {
        description: err.message || "Failed to get response.",
      });
    },
  });

  // Ref to hold the latest SDK messages for use in callbacks
  const currentSdkMessagesRef = useRef<Message[]>([]);
  useEffect(() => {
    currentSdkMessagesRef.current = currentSdkMessages;
  }, [currentSdkMessages]);

  // --- State Synchronization & Message Processing ---
  // Sync store to SDK ONLY on initial load or external store changes
  useEffect(() => {
    // If aiMessages (from store) differs from the SDK state, update SDK.
    // This handles loading persisted messages.
    // Avoid deep comparison issues by comparing lengths and last message ID/content
    if (
      aiMessages.length !== currentSdkMessages.length ||
      (aiMessages.length > 0 &&
        (aiMessages[aiMessages.length - 1].id !==
          currentSdkMessages[currentSdkMessages.length - 1]?.id ||
          aiMessages[aiMessages.length - 1].content !==
            currentSdkMessages[currentSdkMessages.length - 1]?.content))
    ) {
      console.log("Syncing Zustand store messages to SDK.");
      setSdkMessages(aiMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMessages, setSdkMessages]); // Only run when aiMessages changes

  // --- Incremental TTS while assistant reply is streaming ---
  useEffect(() => {
    if (!speechEnabled) return;

    const lastMsg = currentSdkMessages.at(-1);
    if (!lastMsg || lastMsg.role !== "assistant") return;

    // Skip if onFinish is currently processing this message
    if (onFinishProcessingRef.current.has(lastMsg.id)) return;

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
    const processChunk = (endPos: number, isFinal: boolean) => {
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
      if (!isLoading && isFinal) {
        // Instead of -1, store the actual content length when complete
        // But only if onFinish isn't about to handle this message
        if (!onFinishProcessingRef.current.has(lastMsg.id)) {
          speechProgressRef.current[lastMsg.id] = content.length;
        }
      } else {
        speechProgressRef.current[lastMsg.id] = scanPos;
      }
    };

    // When streaming ends, let onFinish handle the final content to avoid duplication
    if (!isLoading) {
      // Mark that onFinish should handle any remaining content
      onFinishProcessingRef.current.add(lastMsg.id);
      return;
    }

    // Iterate over any *completed* lines since the last progress marker.
    while (scanPos < content.length) {
      const nextNlIdx = content.indexOf("\n", scanPos);
      if (nextNlIdx === -1) {
        // No further newlines - stop here and let onFinish handle the rest
        break;
      }

      // We have a newline that marks the end of a full chunk.
      processChunk(nextNlIdx, false);

      // Skip the newline (and potential carriage-return) characters.
      scanPos = nextNlIdx + 1;
      if (content[scanPos] === "\r") scanPos += 1;

      // Record updated progress so subsequent effect runs start after the newline
      speechProgressRef.current[lastMsg.id] = scanPos;
    }
  }, [currentSdkMessages, isLoading, speechEnabled, speak, highlightSegment]);

  // --- Action Handlers ---
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const messageContent = input; // Capture input before clearing
      if (!messageContent.trim()) return; // Don't submit empty messages

      // Proceed with the actual submission using useChat
      // useChat's handleSubmit will add the user message to its internal state
      const freshSystemState = getSystemState();
      console.log("Submitting AI chat with system state:", freshSystemState);
      originalHandleSubmit(e, {
        // Pass options correctly - body is a direct property
        body: {
          systemState: freshSystemState,
          model: aiModel, // Pass the selected AI model
        },
      });
    },
    [originalHandleSubmit, input] // Removed setAiMessages, aiMessages from deps
  );

  const handleDirectMessageSubmit = useCallback(
    (message: string) => {
      if (!message.trim()) return; // Don't submit empty messages

      // Proceed with the actual submission using useChat
      // useChat's append will add the user message to its internal state
      console.log("Appending direct message to AI chat");
      append(
        { content: message, role: "user" }, // append only needs content/role
        {
          body: {
            systemState: getSystemState(),
            model: aiModel, // Pass the selected AI model
          },
        } // Pass options correctly - body is direct property
      );
    },
    [append] // Removed setAiMessages, aiMessages from deps
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

    // Clear onFinish processing flags
    onFinishProcessingRef.current.clear();

    // Reset highlight queue & currently highlighted segment
    highlightQueueRef.current = [];
    setHighlightSegment(null);

    // Define the initial message and mark it as fully processed so it is never spoken
    const initialMessage: Message = {
      id: "1", // Ensure consistent ID for the initial message
      role: "assistant",
      content: "👋 hey! i'm ryo. ask me anything!",
      createdAt: new Date(),
    };
    speechProgressRef.current[initialMessage.id] =
      initialMessage.content.length;

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
      handleInputChange({
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>); // Clear input field
    }, 100);
  }, [clearChats, handleInputChange]);

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
        .map((msg: Message) => {
          const time = msg.createdAt
            ? new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : "";
          const sender = msg.role === "user" ? username || "You" : "Ryo";
          return `**${sender}** (${time}):\n${msg.content}`;
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
    [aiMessages, username, saveFile]
  );

  // Stop both chat streaming and TTS queue
  const stop = useCallback(() => {
    sdkStop();
    stopTts();
  }, [sdkStop, stopTts]);

  return {
    // AI Chat State & Actions
    messages: currentSdkMessages, // <-- Return messages from useChat directly
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    reload,
    error,
    stop,
    append,
    handleDirectMessageSubmit,
    handleNudge,
    clearChats, // Expose the action
    handleSaveTranscript, // Expose the action

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
