import { useState, useEffect, useCallback, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

/**
 * Only these usernames get proactive greetings.
 * Must match the server-side ALLOWED_USERS set.
 */
const ALLOWED_USERS = new Set(["ryo"]);

/**
 * Hook that manages proactive AI greetings for eligible users.
 *
 * When a new/cleared chat has only the default greeting message and the
 * current user is in the allowlist, this hook:
 * 1. Shows a typing indicator
 * 2. Calls the proactive-greeting API
 * 3. Replaces the generic greeting with the AI-generated one
 */
export function useProactiveGreeting() {
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(false);
  const hasTriggeredRef = useRef(false);
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

  const isEligible =
    !!username && ALLOWED_USERS.has(username.toLowerCase()) && !!authToken;

  const fetchGreeting = useCallback(async () => {
    if (!username || !authToken) return;

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingGreeting(true);

    try {
      const response = await abortableFetch(
        getApiUrl("/api/chat"),
        {
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
        }
      );

      if (controller.signal.aborted) return;

      const data = await response.json();

      if (data.greeting && typeof data.greeting === "string") {
        // Replace the default greeting message with the proactive one.
        // Use a different ID so the SDK sync effect in useAiChat detects the change.
        const proactiveMessage: AIChatMessage = {
          id: "proactive-1",
          role: "assistant",
          parts: [{ type: "text", text: data.greeting }],
          metadata: {
            createdAt: new Date(),
          },
        };

        // Only update if chat is still fresh (user hasn't sent a message yet)
        const currentMessages = useChatsStore.getState().aiMessages;
        if (
          currentMessages.length === 1 &&
          currentMessages[0].id === "1" &&
          currentMessages[0].role === "assistant"
        ) {
          setAiMessages([proactiveMessage]);
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
  }, [username, authToken, setAiMessages]);

  // Trigger proactive greeting when conditions are met
  useEffect(() => {
    if (isFreshChat && isEligible && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      fetchGreeting();
    }

    // Reset trigger flag when chat is no longer fresh (user sent a message)
    if (!isFreshChat) {
      hasTriggeredRef.current = false;
    }
  }, [isFreshChat, isEligible, fetchGreeting]);

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
    hasTriggeredRef.current = false;
    // The useEffect will pick it up on the next render
    // But we can also force it directly
    setTimeout(() => {
      const state = useChatsStore.getState();
      const stillFresh =
        state.aiMessages.length === 1 &&
        (state.aiMessages[0].id === "1" || state.aiMessages[0].id === "proactive-1") &&
        state.aiMessages[0].role === "assistant";
      const stillEligible =
        !!state.username &&
        ALLOWED_USERS.has(state.username.toLowerCase()) &&
        !!state.authToken;

      if (stillFresh && stillEligible) {
        hasTriggeredRef.current = true;
        fetchGreeting();
      }
    }, 100);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    triggerGreeting,
  };
}
