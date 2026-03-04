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

/** Interval (ms) between each character reveal in the typewriter effect. */
const TYPEWRITER_INTERVAL_MS = 18;

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
 * revealed progressively via a typewriter effect through `streamingGreetingText`.
 */
export function useProactiveGreeting() {
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(() => {
    const state = useChatsStore.getState();
    const fresh =
      state.aiMessages.length === 1 &&
      state.aiMessages[0].id === "1" &&
      state.aiMessages[0].role === "assistant";
    const eligible = !!state.username && !!state.authToken;
    return fresh && eligible;
  });
  const [streamingGreetingText, setStreamingGreetingText] = useState<
    string | null
  >(null);
  const hasTriggeredFreshRef = useRef(false);
  const hasTriggeredStaleRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchInFlightRef = useRef(false);

  const username = useChatsStore((s) => s.username);
  const authToken = useChatsStore((s) => s.authToken);
  const aiMessages = useChatsStore((s) => s.aiMessages);
  const setAiMessages = useChatsStore((s) => s.setAiMessages);

  const isFreshChat =
    aiMessages.length === 1 &&
    aiMessages[0].id === "1" &&
    aiMessages[0].role === "assistant";

  const isEligible = !!username && !!authToken;

  const isStaleChat = (() => {
    if (isFreshChat) return false;
    if (aiMessages.length < 2) return false;
    const lastMsg = aiMessages[aiMessages.length - 1];
    if (lastMsg.id?.startsWith("proactive-")) return false;

    const lastTs = getLastMessageTimestamp(aiMessages);
    if (lastTs === 0) return false;

    return Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;
  })();

  /** Stop any running typewriter animation. */
  const stopTypewriter = useCallback(() => {
    if (typewriterRef.current !== null) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }, []);

  /** Persist the final greeting text as a message in the store. */
  const commitGreeting = useCallback(
    (text: string, mode: "fresh" | "stale") => {
      const proactiveMessage: AIChatMessage = {
        id: mode === "fresh" ? "proactive-1" : `proactive-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text }],
        metadata: {
          createdAt: new Date(),
        },
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
          lastTs > 0 && Date.now() - lastTs > STALE_CHAT_THRESHOLD_MS;

        if (stillStale && !lastMsg.id?.startsWith("proactive-")) {
          setAiMessages([...currentMessages, proactiveMessage]);
        }
      }
    },
    [setAiMessages]
  );

  /**
   * Reveal `fullText` character by character via a typewriter animation,
   * then commit the final message to the store.
   */
  const revealGreeting = useCallback(
    (fullText: string, mode: "fresh" | "stale") => {
      stopTypewriter();

      let pos = 0;
      setStreamingGreetingText("");

      typewriterRef.current = setInterval(() => {
        const step = fullText[pos] === " " ? 2 : 1;
        pos = Math.min(pos + step, fullText.length);
        setStreamingGreetingText(fullText.slice(0, pos));

        if (pos >= fullText.length) {
          stopTypewriter();
          commitGreeting(fullText, mode);
          setStreamingGreetingText(null);
          setIsLoadingGreeting(false);
        }
      }, TYPEWRITER_INTERVAL_MS);
    },
    [stopTypewriter, commitGreeting]
  );

  /**
   * Fetch a proactive greeting from the server (complete JSON response)
   * and reveal it with a typewriter animation.
   */
  const fetchGreeting = useCallback(
    async (mode: "fresh" | "stale" = "fresh") => {
      if (!username || !authToken) return;

      // Prevent duplicate concurrent requests
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;

      // Abort any in-flight request and stop any running animation
      abortRef.current?.abort();
      stopTypewriter();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoadingGreeting(true);
      setStreamingGreetingText(null);

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
          timeout: 20000,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const data = await response.json();

        if (
          controller.signal.aborted ||
          !data.greeting ||
          typeof data.greeting !== "string"
        ) {
          if (!controller.signal.aborted) {
            setIsLoadingGreeting(false);
          }
          return;
        }

        revealGreeting(data.greeting, mode);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("[ProactiveGreeting] Failed to fetch greeting:", err);
        }
        if (!controller.signal.aborted) {
          setStreamingGreetingText(null);
          setIsLoadingGreeting(false);
        }
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [username, authToken, revealGreeting, stopTypewriter]
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
      stopTypewriter();
    };
  }, [stopTypewriter]);

  /**
   * Manually trigger a proactive greeting fetch.
   * Used after clearChats to re-trigger the greeting.
   *
   * NOTE: the fresh-chat useEffect usually handles the initial trigger.
   * This callback exists for the case where the useEffect already fired
   * (e.g. clearing an existing proactive greeting). It waits briefly so
   * the store state settles, then fetches only if the useEffect didn't.
   */
  const triggerGreeting = useCallback(() => {
    // Mark stale trigger as un-triggered so the effect can re-fire
    hasTriggeredStaleRef.current = false;

    setTimeout(() => {
      const state = useChatsStore.getState();
      const stillFresh =
        state.aiMessages.length === 1 &&
        (state.aiMessages[0].id === "1" ||
          state.aiMessages[0].id === "proactive-1") &&
        state.aiMessages[0].role === "assistant";
      const stillEligible = !!state.username && !!state.authToken;

      if (stillFresh && stillEligible && !fetchInFlightRef.current) {
        hasTriggeredFreshRef.current = true;
        fetchGreeting("fresh");
      }
    }, 300);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    streamingGreetingText,
    triggerGreeting,
  };
}
