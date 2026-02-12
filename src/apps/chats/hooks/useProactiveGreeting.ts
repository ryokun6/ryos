import { useState, useEffect, useCallback, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

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

  // createdAt can be a Date, a number, or an ISO string (after JSON round-trip)
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
 *    *appended* to the conversation.
 */
export function useProactiveGreeting() {
  // Initialize loading state eagerly so eligible users never see the static greeting
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(() => {
    const state = useChatsStore.getState();
    const fresh =
      state.aiMessages.length === 1 &&
      state.aiMessages[0].id === "1" &&
      state.aiMessages[0].role === "assistant";
    const eligible = !!state.username && !!state.authToken;
    return fresh && eligible;
  });
  const hasTriggeredFreshRef = useRef(false);
  const hasTriggeredStaleRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const username = useChatsStore((s) => s.username);
  const authToken = useChatsStore((s) => s.authToken);
  const aiMessages = useChatsStore((s) => s.aiMessages);
  const setAiMessages = useChatsStore((s) => s.setAiMessages);

  /**
   * Check if the current chat state is a fresh chat with only the default
   * greeting message (id === "1", role === "assistant").
   * We don't re-trigger if the proactive greeting has already been set (id === "proactive-1").
   */
  const isFreshChat =
    aiMessages.length === 1 &&
    aiMessages[0].id === "1" &&
    aiMessages[0].role === "assistant";

  const isEligible = !!username && !!authToken;

  /**
   * Detect a "stale" conversation: the chat has real messages but the last
   * message was sent more than STALE_CHAT_THRESHOLD_MS ago.
   */
  const isStaleChat = (() => {
    if (isFreshChat) return false; // handled by the fresh-chat path
    if (aiMessages.length < 2) return false; // need at least one real exchange
    // Don't trigger if the last message is already a proactive greeting
    const lastMsg = aiMessages[aiMessages.length - 1];
    if (lastMsg.id?.startsWith("proactive-")) return false;

    const lastTs = getLastMessageTimestamp(aiMessages);
    if (lastTs === 0) return false;

    return Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;
  })();

  /**
   * Fetch a proactive greeting from the server.
   * @param mode  "fresh" → replaces the default greeting;
   *              "stale" → appends the greeting to the existing conversation.
   */
  const fetchGreeting = useCallback(
    async (mode: "fresh" | "stale" = "fresh") => {
      if (!username || !authToken) return;

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoadingGreeting(true);

      try {
        const response = await abortableFetch(getApiUrl("/api/chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Username": username,
          },
          body: JSON.stringify({
            messages: [],
            proactiveGreeting: true,
          }),
          timeout: 12000,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const data = await response.json();

        if (data.greeting && typeof data.greeting === "string") {
          const proactiveMessage: AIChatMessage = {
            id: mode === "fresh" ? "proactive-1" : `proactive-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: data.greeting }],
            metadata: {
              createdAt: new Date(),
            },
          };

          const currentMessages = useChatsStore.getState().aiMessages;

          if (mode === "fresh") {
            // Replace the default greeting message
            if (
              currentMessages.length === 1 &&
              currentMessages[0].id === "1" &&
              currentMessages[0].role === "assistant"
            ) {
              setAiMessages([proactiveMessage]);
            }
          } else {
            // Stale mode: append the greeting to the existing conversation
            // Guard: don't append if user sent a new message while we were loading
            const lastMsg = currentMessages[currentMessages.length - 1];
            const lastTs = getLastMessageTimestamp(currentMessages);
            const stillStale =
              lastTs > 0 && Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;

            if (
              stillStale &&
              !lastMsg.id?.startsWith("proactive-")
            ) {
              setAiMessages([...currentMessages, proactiveMessage]);
            }
          }
        }
      } catch (err) {
        // Silently fail — the generic greeting remains
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("[ProactiveGreeting] Failed to fetch greeting:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingGreeting(false);
        }
      }
    },
    [username, authToken, setAiMessages]
  );

  // Trigger proactive greeting for fresh chats
  useEffect(() => {
    if (isFreshChat && isEligible && !hasTriggeredFreshRef.current) {
      hasTriggeredFreshRef.current = true;
      fetchGreeting("fresh");
    }

    // Reset trigger flag when chat is no longer fresh (user sent a message)
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

    // Reset the stale trigger once the conversation is no longer stale
    // (e.g. user sent a message or a greeting was injected)
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
    hasTriggeredFreshRef.current = false;
    hasTriggeredStaleRef.current = false;
    // The useEffect will pick it up on the next render
    // But we can also force it directly
    setTimeout(() => {
      const state = useChatsStore.getState();
      const stillFresh =
        state.aiMessages.length === 1 &&
        (state.aiMessages[0].id === "1" ||
          state.aiMessages[0].id === "proactive-1") &&
        state.aiMessages[0].role === "assistant";
      const stillEligible = !!state.username && !!state.authToken;

      if (stillFresh && stillEligible) {
        hasTriggeredFreshRef.current = true;
        fetchGreeting("fresh");
      }
    }, 100);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    triggerGreeting,
  };
}
