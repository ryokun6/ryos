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
  };
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

  // On first mount, mark any assistant messages already present as fully processed
  useEffect(() => {
    aiMessages.forEach((msg) => {
      if (msg.role === "assistant") {
        speechProgressRef.current[msg.id] = msg.content.length; // skip speaking
      }
    });
  }, [aiMessages]);

  // Queue-based TTS – speaks chunks as they arrive
  const { speak, stop: stopTts } = useTtsQueue();

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
    maxSteps: 5,
    async onToolCall({ toolCall }) {
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

            let confirmationMessage = `Launched ${appName}`;
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
          default:
            console.warn("Unhandled tool call:", toolCall.toolName);
            return "";
        }
      } catch (err) {
        console.error("Error executing tool call:", err);
        return `Failed to execute ${toolCall.toolName}`;
      }
    },
    onFinish: (data: Message | { message: Message }) => {
      const message: Message =
        typeof data === "object" && data !== null && "message" in data
          ? (data as { message: Message }).message
          : (data as Message);
      // Sync latest messages from ref to Zustand store
      const finalMessages = currentSdkMessagesRef.current;
      console.log(
        `AI finished, syncing ${finalMessages.length} final messages to store.`
      );
      setAiMessages(finalMessages);

      // Speak any remaining text that hasn't been read yet (e.g. the final sentence
      // without trailing punctuation). We defer this to the next task tick so that
      // our incremental TTS effect has a chance to update `speechProgressRef`
      // with any characters it may have just processed. This prevents us from
      // re-speaking the tail end of the message.
      if (speechEnabled && message.role === "assistant") {
        setTimeout(() => {
          const processed = speechProgressRef.current[message.id] ?? 0;
          if (processed >= message.content.length) return; // everything already spoken or skipped

          const remaining = message.content.slice(processed).trim();
          if (remaining && !/^[!！]$/.test(remaining)) {
            speak(remaining);
          }

          // Mark as fully spoken so no further attempts are made
          speechProgressRef.current[message.id] = message.content.length;
        }, 30); // ~one frame delay
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
      if (sentence && !/^[!！]$/.test(sentence)) {
        speak(sentence);
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
  }, [setAiMessages, setSdkMessages]);

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
  };
}
