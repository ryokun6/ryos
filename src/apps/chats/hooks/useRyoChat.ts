import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { getApiUrl } from "@/utils/platform";
import { useChatsStoreShallow } from "@/stores/helpers";
import { abortableFetch } from "@/utils/abortableFetch";

// Helper function to get system state for AI chat
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const chatsStore = useChatsStore.getState();
  const languageStore = useLanguageStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack = ipodStore.currentSongId
    ? ipodStore.tracks.find((t) => t.id === ipodStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  // Use new instance-based model
  const openInstances = Object.values(appStore.instances).filter(
    (inst) => inst.isOpen
  );

  const foregroundInstanceId =
    appStore.instanceOrder.length > 0
      ? appStore.instanceOrder[appStore.instanceOrder.length - 1]
      : null;

  const foregroundInstance = foregroundInstanceId
    ? appStore.instances[foregroundInstanceId]
    : null;

  const foregroundApp = foregroundInstance?.appId || null;

  const backgroundApps = openInstances
    .filter((inst) => inst.instanceId !== foregroundInstanceId)
    .map((inst) => inst.appId);

  return {
    instances: appStore.instances,
    username: chatsStore.username,
    locale: languageStore.current,
    runningApps: {
      foreground: foregroundApp,
      background: backgroundApps,
      instanceWindowOrder: appStore.instanceOrder,
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
  const { t } = useTranslation();
  // Pull current auth credentials from store (reactive)
  const { authToken, username } = useChatsStoreShallow((state) => ({
    authToken: state.authToken,
    username: state.username,
  }));

  // Build auth headers once per render (updates when authToken/username change)
  const authHeaders: Record<string, string> = {};
  if (authToken && username) {
    authHeaders["Authorization"] = `Bearer ${authToken}`;
    authHeaders["X-Username"] = username;
  }

  // Create a separate AI chat hook for @ryo mentions in chat rooms
  const {
    messages: ryoMessages,
    status,
    stop: stopRyo,
  } = useChat({
    transport: new DefaultChatTransport({
      api: getApiUrl("/api/chat"),
      body: {
        systemState: getSystemState(),
      },
      headers: authHeaders,
    }),
    // We no longer stream client-side AI to avoid spoofing. onFinish unused.
  });

  const isRyoLoading = status === "streaming" || status === "submitted";

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

      // Call server to generate and insert a @ryo reply using authenticated request
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (authToken && username) {
        headers["Authorization"] = `Bearer ${authToken}`;
        headers["X-Username"] = username;
      }

      if (!currentRoomId) return;
      try {
        await abortableFetch(getApiUrl("/api/ai/ryo-reply"), {
          method: "POST",
          headers,
          body: JSON.stringify({
            roomId: currentRoomId,
            prompt: messageContent,
            systemState: systemStateWithChat,
          }),
          timeout: 20000,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });
      } catch (error) {
        console.error("[RyoChat] Failed to request @ryo reply:", error);
      }

      onScrollToBottom();
    },
    [roomMessages, currentRoomId, authToken, username, onScrollToBottom]
  );

  const detectAndProcessMention = useCallback(
    (input: string): { isMention: boolean; messageContent: string } => {
      if (input.startsWith("@ryo ")) {
        // Extract the message content after @ryo
        const messageContent = input.substring(4).trim();
        return { isMention: true, messageContent };
      } else if (input === "@ryo") {
        // If they just typed @ryo without a message, treat it as a nudge
        return { isMention: true, messageContent: t("apps.chats.status.nudgeSent") };
      }
      return { isMention: false, messageContent: "" };
    },
    [t]
  );

  return {
    ryoMessages,
    isRyoLoading,
    stopRyo,
    handleRyoMention,
    detectAndProcessMention,
  };
}
