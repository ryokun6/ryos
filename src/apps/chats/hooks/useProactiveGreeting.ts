import { useState, useEffect, useCallback, useRef } from "react";
import { fetchProactiveGreeting } from "@/api/ai";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";

/**
 * Minimum idle time (ms) since the last chat message before a proactive
 * greeting is triggered when re-opening / loading the chats app from state.
 */
const STALE_CHAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the timestamp (epoch ms) of the most recent message in the AI chat.
 * Falls back to 0 if no valid timestamp is found.
 */
function getLastMessageTimestamp(messages: AIChatMessage[]): number {
  if (messages.length === 0) return 0;

  const last = messages[messages.length - 1];
  const createdAt = last.metadata?.createdAt;
  if (!createdAt) return 0;

  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") {
    const ts = new Date(createdAt).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  return 0;
}

/**
 * Hook that manages proactive AI greetings for logged-in users with memories.
 *
 * Triggers in two scenarios:
 * 1. **Fresh chat** – only the default greeting message is present.
 *    The proactive greeting *replaces* the generic greeting.
 * 2. **Stale chat** – the app is opened / loaded from persisted state and
 *    the last message is older than 5 minutes. The proactive greeting is
 *    *appended* to the existing conversation.
 *
 * The greeting is fetched as a complete JSON response from the server and
 * displayed in the chat as a single batch update.
 */
export function useProactiveGreeting() {
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(() => {
    const state = useChatsStore.getState();
    const fresh =
      state.aiMessages.length === 1 &&
      state.aiMessages[0].id === "1" &&
      state.aiMessages[0].role === "assistant";
    const eligible = !!state.username && !!state.isAuthenticated;
    return fresh && eligible;
  });
  const hasTriggeredFreshRef = useRef(false);
  const hasTriggeredStaleRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchInFlightRef = useRef(false);

  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const aiMessages = useChatsStore((s) => s.aiMessages);
  const setAiMessages = useChatsStore((s) => s.setAiMessages);

  const isFreshChat =
    aiMessages.length === 1 &&
    aiMessages[0].id === "1" &&
    aiMessages[0].role === "assistant";

  const isEligible = !!username && !!isAuthenticated;

  const isStaleChat = (() => {
    if (isFreshChat) return false;
    if (aiMessages.length < 2) return false;
    const lastMsg = aiMessages[aiMessages.length - 1];
    if (lastMsg.id?.startsWith("proactive-")) return false;

    const lastTs = getLastMessageTimestamp(aiMessages);
    if (lastTs === 0) return false;

    return Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;
  })();

  /**
   * Fetch a proactive greeting from the server and display it immediately.
   */
  const fetchGreeting = useCallback(
    async (mode: "fresh" | "stale" = "fresh") => {
      if (!username || !isAuthenticated) return;

      // Prevent duplicate concurrent requests
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoadingGreeting(true);

      try {
        const data = await fetchProactiveGreeting({
          signal: controller.signal,
        });

        if (data.greeting && typeof data.greeting === "string") {
          const proactiveMessage: AIChatMessage = {
            id:
              mode === "fresh"
                ? "proactive-1"
                : `proactive-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: data.greeting }],
            metadata: { createdAt: new Date() },
          };

          const currentMessages = useChatsStore.getState().aiMessages;

          if (mode === "fresh") {
            if (
              currentMessages.length === 1 &&
              currentMessages[0].id === "1" &&
              currentMessages[0].role === "assistant"
            ) {
              setAiMessages([proactiveMessage]);
            }
          } else {
            const lastMsg = currentMessages[currentMessages.length - 1];
            const lastTs = getLastMessageTimestamp(currentMessages);
            const stillStale =
              lastTs > 0 &&
              Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;

            if (stillStale && !lastMsg.id?.startsWith("proactive-")) {
              setAiMessages([...currentMessages, proactiveMessage]);
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("[ProactiveGreeting] Failed to fetch greeting:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingGreeting(false);
        }
        fetchInFlightRef.current = false;
      }
    },
    [username, isAuthenticated, setAiMessages]
  );

  // Trigger proactive greeting for fresh chats
  useEffect(() => {
    if (isFreshChat && isEligible && !hasTriggeredFreshRef.current) {
      hasTriggeredFreshRef.current = true;
      fetchGreeting("fresh");
    }

    if (!isFreshChat) {
      hasTriggeredFreshRef.current = false;
    }
  }, [isFreshChat, isEligible, fetchGreeting]);

  // Trigger proactive greeting for stale chats on mount / app open
  useEffect(() => {
    if (isStaleChat && isEligible && !hasTriggeredStaleRef.current) {
      hasTriggeredStaleRef.current = true;
      fetchGreeting("stale");
    }

    if (!isStaleChat) {
      hasTriggeredStaleRef.current = false;
    }
  }, [isStaleChat, isEligible, fetchGreeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Manually trigger a proactive greeting fetch.
   * Used after clearChats to re-trigger the greeting.
   */
  const triggerGreeting = useCallback(() => {
    hasTriggeredStaleRef.current = false;
    setTimeout(() => {
      const state = useChatsStore.getState();
      const stillFresh =
        state.aiMessages.length === 1 &&
        (state.aiMessages[0].id === "1" ||
          state.aiMessages[0].id === "proactive-1") &&
        state.aiMessages[0].role === "assistant";
      const stillEligible = !!state.username && !!state.isAuthenticated;

      if (stillFresh && stillEligible && !fetchInFlightRef.current) {
        hasTriggeredFreshRef.current = true;
        fetchGreeting("fresh");
      }
    }, 300);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    triggerGreeting,
  };
}
