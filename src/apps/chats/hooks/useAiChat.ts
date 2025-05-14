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

  const runningApps = Object.entries(appStore.apps)
    .filter(([, appState]) => appState.isOpen)
    .map(([appId, appState]) => ({
      id: appId,
      isForeground: appState.isForeground || false,
    }));

  const foregroundApp = runningApps.find((app) => app.isForeground)?.id || null;
  const backgroundApps = runningApps
    .filter((app) => !app.isForeground)
    .map((app) => app.id);

  return {
    apps: appStore.apps,
    username: chatsStore.username,
    runningApps: {
      foreground: foregroundApp,
      background: backgroundApps,
      windowOrder: appStore.windowOrder,
    },
    internetExplorer: {
      url: ieStore.url,
      year: ieStore.year,
      status: ieStore.status,
      currentPageTitle: ieStore.currentPageTitle,
      aiGeneratedHtml: ieStore.aiGeneratedHtml,
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
    },
    textEdit: {
      lastFilePath: textEditStore.lastFilePath,
      contentJson: textEditStore.contentJson,
      hasUnsavedChanges: textEditStore.hasUnsavedChanges,
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

export function useAiChat() {
  const { aiMessages, setAiMessages, username } = useChatsStore();
  const launchApp = useLaunchApp();
  const closeApp = useAppStore((state) => state.closeApp);
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAppStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

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
        speechProgressRef.current[msg.id] = msg.content.length; // skip speaking
      }
    });
  }, [aiMessages]);

  // Queue-based TTS – speaks chunks as they arrive
  const { speak, stop: stopTts, isSpeaking } = useTtsQueue();

  // Strip any number of leading exclamation marks (urgent markers) plus following spaces,
  // then remove any leading standalone punctuation that may remain.
  const cleanTextForSpeech = (text: string) =>
    text
      .replace(/^!+\s*/, "") // remove !!!!!! prefix
      .replace(/^[\s.!?。，！？；：]+/, "") // remove leftover punctuation/space at start
      .trim();

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
    maxSteps: 10,
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
            closeApp(id as AppId);
            return `Closed ${appName}.`;
          }
          case "textEditSearchReplace": {
            const { search, replace, isRegex } = toolCall.args as {
              search: string;
              replace: string;
              isRegex?: boolean;
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
            });

            // Ensure TextEdit is open – launch if not already
            const appState = useAppStore.getState();
            if (!appState.apps["textedit"]?.isOpen) {
              launchApp("textedit");
            }

            const textEditState = useTextEditStore.getState();
            const { contentJson, applyExternalUpdate } = textEditState;

            if (!contentJson) {
              return "No file currently open in TextEdit.";
            }

            try {
              // 1. Convert current JSON document to HTML
              const htmlStr = generateHTML(contentJson, [
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

              // 5. Apply the updated JSON to the store – TextEdit will react via subscription
              applyExternalUpdate(updatedJson);

              return `Replaced "${search}" with "${replace}".`;
            } catch (err) {
              console.error("searchReplace error:", err);
              return `Failed to apply search/replace: ${
                err instanceof Error ? err.message : "Unknown error"
              }`;
            }
          }
          case "textEditInsertText": {
            const { text, position } = toolCall.args as {
              text: string;
              position?: "start" | "end";
            };

            console.log("[ToolCall] insertText:", { text, position });

            // Ensure TextEdit is open
            const appState = useAppStore.getState();
            if (!appState.apps["textedit"]?.isOpen) {
              launchApp("textedit");
            }

            const textEditState = useTextEditStore.getState();
            const { insertText } = textEditState;

            // Use a small debounce so rapid successive insertText calls (if any)
            // don't overwhelm the store/UI. We reuse the same debounced helper by
            // passing in a thunk that performs the real insert when the debounce
            // interval elapses.
            debouncedInsertTextUpdate(() =>
              insertText(text, position || "end")
            );

            return `Inserted text at ${
              position === "start" ? "start" : "end"
            } of document…`;
          }
          case "textEditNewFile": {
            console.log("[ToolCall] newFile");
            // Ensure TextEdit is open – launch if not already
            const appState = useAppStore.getState();
            if (!appState.apps["textedit"]?.isOpen) {
              launchApp("textedit");
            }

            const textEditState = useTextEditStore.getState();
            const {
              reset,
              applyExternalUpdate: applyUpdateForNewFile,
              setLastFilePath,
              setHasUnsavedChanges,
            } = textEditState;

            // Clear existing document state
            reset();

            // Provide an explicit empty document so the editor clears its content
            const blankDoc: JSONContent = { type: "doc", content: [] };
            applyUpdateForNewFile(blankDoc);

            // Ensure the new document is treated as untitled and saved state is clean
            setLastFilePath(null);
            setHasUnsavedChanges(false);

            return "Created a new, untitled document in TextEdit.";
          }
          case "ipodPlayPause": {
            const { action } = toolCall.args as {
              action?: "play" | "pause" | "toggle";
            };
            console.log("[ToolCall] ipodPlayPause:", { action });

            // Ensure iPod app is open
            const appState = useAppStore.getState();
            if (!appState.apps["ipod"]?.isOpen) {
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

            // Ensure iPod app is open
            const appState = useAppStore.getState();
            if (!appState.apps["ipod"]?.isOpen) {
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
          case "ipodNextTrack": {
            console.log("[ToolCall] ipodNextTrack");
            // Ensure iPod app is open
            const appState = useAppStore.getState();
            if (!appState.apps["ipod"]?.isOpen) {
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
            // Ensure iPod app is open
            const appState = useAppStore.getState();
            if (!appState.apps["ipod"]?.isOpen) {
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
    onFinish: (/* _finishedMessage: Message | { message: Message } */) => {
      // Sync latest messages from ref to Zustand store
      const finalMessages = currentSdkMessagesRef.current;
      console.log(
        `AI finished, syncing ${finalMessages.length} final messages to store.`
      );
      setAiMessages(finalMessages);

      // Speak any remaining text that wasn't processed during streaming
      if (speechEnabled) {
        const lastMsg = finalMessages.at(-1);
        if (lastMsg && lastMsg.role === "assistant") {
          const processed = speechProgressRef.current[lastMsg.id] ?? 0;
          if (processed !== -1 && lastMsg.content.length > processed) {
            const remaining = lastMsg.content.slice(processed).trim();
            const cleaned = cleanTextForSpeech(remaining);
            if (cleaned) {
              speak(cleaned);
            }
            // Mark the entire message as processed
            speechProgressRef.current[lastMsg.id] = lastMsg.content.length;
          }
        }
      }
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

    const processed = speechProgressRef.current[lastMsg.id] ?? 0;
    if (processed === -1 || lastMsg.content.length <= processed) return; // nothing new or skipped

    const newText = lastMsg.content.slice(processed);
    let buffer = newText;
    let spokenChars = 0;
    let match: RegExpMatchArray | null;
    const sentenceRegex = /[.!?。，！？；：](?:\s+|$)|\r?\n+/;

    while ((match = buffer.match(sentenceRegex))) {
      const matchText = match[0];
      const idx = match.index! + matchText.length; // include punctuation and following spaces
      const sentence = buffer.slice(0, idx).trim();
      if (sentence && !/^[\s.!?。，！？；：]+$/.test(sentence)) {
        const cleaned = cleanTextForSpeech(sentence);
        if (cleaned && !/^[\s.!?。，！？；：]+$/.test(cleaned)) {
          // If this is an urgent message (starts with "!!!!"), the UI trims
          // the first 4 exclamation marks *and* any following spaces before
          // rendering. We need to offset our start/end indices so they align
          // with the visible (trimmed) text.
          let prefixOffset = 0;
          if (lastMsg.content.startsWith("!!!!")) {
            // Base 4 chars for the exclamation marks
            prefixOffset = 4;
            // Skip any whitespace that will be removed by trimStart()
            let i = 4;
            while (
              i < lastMsg.content.length &&
              /\s/.test(lastMsg.content[i])
            ) {
              prefixOffset++;
              i++;
            }
          }

          const chunkStart =
            processed + newText.indexOf(sentence) + spokenChars - prefixOffset;
          const chunkEnd = chunkStart + sentence.length;

          // Push highlight info to queue
          const seg = {
            messageId: lastMsg.id,
            start: chunkStart,
            end: chunkEnd,
          };
          highlightQueueRef.current.push(seg);

          // If no highlight active, set as current
          if (!highlightSegment) {
            setHighlightSegment(seg);
          }

          speak(cleaned, () => {
            // On chunk end, shift queue
            highlightQueueRef.current.shift();
            if (highlightQueueRef.current.length > 0) {
              setHighlightSegment(highlightQueueRef.current[0]);
            } else {
              setHighlightSegment(null);
            }
          });
        }
      }
      spokenChars += idx;
      buffer = buffer.slice(idx);
    }

    speechProgressRef.current[lastMsg.id] = processed + spokenChars;
    // leftover buffer will be spoken in future ticks or onFinish
  }, [currentSdkMessages, speechEnabled, speak]);

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

    // Reset highlight queue & currently highlighted segment
    highlightQueueRef.current = [];
    setHighlightSegment(null);

    // Define the initial message
    const initialMessage: Message = {
      id: "1", // Ensure consistent ID for the initial message
      role: "assistant",
      content: "👋 hey! i'm ryo. ask me anything!",
      createdAt: new Date(),
    };
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
