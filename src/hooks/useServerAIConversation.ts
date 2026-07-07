import { useCallback, useEffect } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { loadAIConversation } from "@/api/aiConversations";
import { useAIConversationRealtime } from "@/hooks/useAIConversationRealtime";
import type { AIConversationChannel } from "@/shared/contracts/aiConversation";
import type { AIChatMessage } from "@/types/chat";

export interface UseServerAIConversationInput {
  channel: AIConversationChannel;
  username: string | null;
  isAuthenticated: boolean;
  /** True when the live chat is idle and safe to overwrite with server state. */
  isChatReady: () => boolean;
  /** Apply the canonical server messages to the live chat + local store. */
  applyMessages: (messages: AIChatMessage[]) => void;
  onError: (error: unknown, context: string) => void;
}

/**
 * Owns the client side of server conversation sync for one channel: initial
 * hydration on sign-in, focus/visibility refresh, and realtime cross-device
 * updates. Loads go through the shared session cache, which serves delta
 * (`afterSeq`) reads when it already has a base snapshot.
 */
export function useServerAIConversation({
  channel,
  username,
  isAuthenticated,
  isChatReady,
  applyMessages,
  onError,
}: UseServerAIConversationInput): {
  hydrate: (force?: boolean) => Promise<void>;
} {
  const identity =
    username && isAuthenticated ? username.toLowerCase() : null;

  const hydrate = useCallback(
    async (force = false) => {
      if (!identity) return;
      const loaded = await loadAIConversation({
        channel,
        username: identity,
        force,
      });
      const currentAuth = useChatsStore.getState();
      if (
        loaded.stale ||
        currentAuth.username?.toLowerCase() !== loaded.owner ||
        !currentAuth.isAuthenticated ||
        !isChatReady()
      ) {
        return;
      }
      applyMessages(loaded.messages);
    },
    [channel, identity, isChatReady, applyMessages]
  );

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    void hydrate(true).catch((error) => {
      if (!cancelled) onError(error, "hydrate");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, hydrate]);

  useEffect(() => {
    if (!identity) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && isChatReady()) {
        void hydrate(true).catch((error) => onError(error, "refresh"));
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, hydrate, isChatReady]);

  // Live cross-device updates: re-hydrate as soon as another signed-in
  // device changes the canonical conversation.
  useAIConversationRealtime({
    channel,
    username: identity,
    onRemoteUpdate: () => {
      if (!isChatReady()) return;
      void hydrate(true).catch((error) => onError(error, "realtime"));
    },
  });

  return { hydrate };
}
