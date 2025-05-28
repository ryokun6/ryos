import { useChat } from "ai/react";
import { useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useChatsStore } from "@/stores/useChatsStore";

// Helper function to get system state for AI chat
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const chatsStore = useChatsStore.getState();

  const currentVideo = videoStore.videos[videoStore.currentIndex];
  const currentTrack = ipodStore.tracks[ipodStore.currentIndex];

  // Use new instance-based model
  const openInstances = Object.values(appStore.instances).filter(
    (inst) => inst.isOpen
  );

  const foregroundInstanceId =
    appStore.instanceWindowOrder.length > 0
      ? appStore.instanceWindowOrder[appStore.instanceWindowOrder.length - 1]
      : null;

  const foregroundInstance = foregroundInstanceId
    ? appStore.instances[foregroundInstanceId]
    : null;

  const foregroundApp = foregroundInstance?.appId || null;

  const backgroundApps = openInstances
    .filter((inst) => inst.instanceId !== foregroundInstanceId)
    .map((inst) => inst.appId);

  return {
    // Keep legacy apps for backward compatibility; include instances
    apps: appStore.apps,
    instances: appStore.instances,
    username: chatsStore.username,
    authToken: chatsStore.authToken,
    runningApps: {
      foreground: foregroundApp,
      background: backgroundApps,
      instanceWindowOrder: appStore.instanceWindowOrder,
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

interface UseRyoChatProps {
  currentRoomId: string | null;
  onScrollToBottom: () => void;
  roomMessages?: Array<{
    username: string;
    content: string;
    userId?: string;
    timestamp?: string;
  }>;
}

export function useRyoChat({
  currentRoomId,
  onScrollToBottom,
  roomMessages = [],
}: UseRyoChatProps) {
  // Create a separate AI chat hook for @ryo mentions in chat rooms
  const {
    messages: ryoMessages,
    isLoading: isRyoLoading,
    append: appendToRyo,
    stop: stopRyo,
  } = useChat({
    maxSteps: 5,
    body: {
      systemState: getSystemState(),
    },
    onFinish: async (message) => {
      // When AI finishes responding, send the response to the chat room
      if (currentRoomId && message.role === "assistant") {
        // Send as a regular message to the room
        // We'll need to call the API directly since we want it to appear from 'ryo'
        const { authToken } = useChatsStore.getState();
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
          headers["X-Username"] = "ryo";
        }

        await fetch(`/api/chat-rooms?action=sendMessage`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            roomId: currentRoomId,
            username: "ryo",
            content: message.content,
          }),
        });

        // Trigger scroll after AI response is sent to room
        onScrollToBottom();
      }
    },
  });

  const handleRyoMention = useCallback(
    async (messageContent: string) => {
      // Get recent chat room messages as context (last 20 messages)
      const recentMessages = roomMessages
        .slice(-20)
        .map((msg) => `${msg.username}: ${msg.content}`)
        .join("\n");

      // Include chat room context in the system state
      const systemStateWithChat = {
        ...getSystemState(),
        chatRoomContext: {
          roomId: currentRoomId,
          recentMessages: recentMessages,
          mentionedMessage: messageContent,
        },
      };

      // Send the message content to AI with chat room context
      await appendToRyo(
        {
          role: "user",
          content: messageContent,
        },
        {
          body: { systemState: systemStateWithChat },
        }
      );
    },
    [appendToRyo, roomMessages, currentRoomId]
  );

  const detectAndProcessMention = useCallback(
    (input: string): { isMention: boolean; messageContent: string } => {
      if (input.startsWith("@ryo ")) {
        // Extract the message content after @ryo
        const messageContent = input.substring(4).trim();
        return { isMention: true, messageContent };
      } else if (input === "@ryo") {
        // If they just typed @ryo without a message, treat it as a nudge
        return { isMention: true, messageContent: "👋 *nudge sent*" };
      }
      return { isMention: false, messageContent: "" };
    },
    []
  );

  return {
    ryoMessages,
    isRyoLoading,
    stopRyo,
    handleRyoMention,
    detectAndProcessMention,
  };
}
