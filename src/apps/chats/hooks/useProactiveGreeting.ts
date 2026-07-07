import { useState, useEffect, useCallback, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  invalidateAIConversationSession,
  loadAIConversation,
} from "@/api/aiConversations";
import {
  applyServerProactiveGreeting,
  isConversationGreetable,
  parseServerProactiveGreeting,
} from "../utils/proactiveGreetingApply";
import type { AIChatMessage } from "@/types/chat";

export interface UseProactiveGreetingOptions {
  /** Latest AI SDK messages (may be ahead of the persisted store mid-stream). */
  getLiveMessages?: () => AIChatMessage[];
  /** Patch the AI SDK list in-place without resetting the conversation. */
  patchLiveMessages?: (messages: AIChatMessage[]) => void;
}

/**
 * Hook that manages proactive AI greetings for logged-in users with memories.
 *
 * The Ryo conversation is server-owned, so the greeting is too: the client
 * only decides *when to ask* (fresh chat, or a thread idle for 5+ minutes on
 * app open); the server re-validates against the canonical conversation,
 * generates the greeting, and **persists it as a real conversation message**.
 * The returned message is patched into the live chat immediately and survives
 * server hydration / cross-device sync because it is part of the canonical
 * history.
 */
export function useProactiveGreeting({
  getLiveMessages,
  patchLiveMessages,
}: UseProactiveGreetingOptions = {}) {
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(() => {
    const state = useChatsStore.getState();
    const fresh =
      state.aiMessages.length === 1 &&
      state.aiMessages[0].id === "1" &&
      state.aiMessages[0].role === "assistant";
    const eligible = !!state.username && !!state.isAuthenticated;
    return fresh && eligible;
  });
  const hasAttemptedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchInFlightRef = useRef(false);
  const liveMessageAccessorsRef = useRef({
    getLiveMessages,
    patchLiveMessages,
  });
  liveMessageAccessorsRef.current = { getLiveMessages, patchLiveMessages };

  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const aiMessages = useChatsStore((s) => s.aiMessages);
  const setAiMessages = useChatsStore((s) => s.setAiMessages);

  const isEligible = !!username && !!isAuthenticated;
  const isGreetable = isConversationGreetable(aiMessages);

  /**
   * Ask the server for a proactive greeting and merge the persisted message
   * into the live conversation.
   */
  const fetchGreeting = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    // Prevent duplicate concurrent requests
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingGreeting(true);

    const owner = username.toLowerCase();
    try {
      // Wait for the canonical conversation first. This shares the pending
      // hydration (and one-time legacy import) from useAiChat, so greeting
      // decisions never race the initial server sync.
      const session = await loadAIConversation({
        channel: "chat",
        username: owner,
        localMessages: useChatsStore.getState().aiMessages,
      });
      if (controller.signal.aborted || session.stale) return;
      if (!isConversationGreetable(session.messages)) return;

      const response = await abortableFetch(getApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          proactiveGreeting: true,
        }),
        timeout: 20000,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const greetingMessage = parseServerProactiveGreeting(
        await response.json()
      );
      if (!greetingMessage) return;

      const current = useChatsStore.getState();
      if (
        current.username?.toLowerCase() !== owner ||
        !current.isAuthenticated
      ) {
        return;
      }

      // The greeting is now part of the canonical conversation. Drop the
      // cached session so in-flight hydrations can't clobber the greeting and
      // the next request context picks up the new revision.
      invalidateAIConversationSession("chat", owner);

      const { getLiveMessages: getLive, patchLiveMessages: patchLive } =
        liveMessageAccessorsRef.current;
      const liveMessages = getLive?.() ?? current.aiMessages;
      const updatedMessages = applyServerProactiveGreeting(
        liveMessages,
        greetingMessage
      );
      if (updatedMessages) {
        patchLive?.(updatedMessages);
        setAiMessages(updatedMessages);
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
  }, [username, isAuthenticated, setAiMessages]);

  // A new identity gets a fresh greeting attempt (e.g. logout → login).
  useEffect(() => {
    hasAttemptedRef.current = false;
  }, [username, isAuthenticated]);

  // Trigger a greeting attempt when the chat is fresh (default greeting only)
  // or stale (idle 5+ minutes) on mount / app open. The server is the final
  // authority, so this only gates when a request is worth making.
  useEffect(() => {
    if (isGreetable && isEligible && !hasAttemptedRef.current) {
      hasAttemptedRef.current = true;
      void fetchGreeting();
    }

    if (!isGreetable) {
      hasAttemptedRef.current = false;
    }
  }, [isGreetable, isEligible, fetchGreeting]);

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
    setTimeout(() => {
      const state = useChatsStore.getState();
      const stillEligible = !!state.username && !!state.isAuthenticated;

      if (
        stillEligible &&
        isConversationGreetable(state.aiMessages) &&
        !fetchInFlightRef.current
      ) {
        hasAttemptedRef.current = true;
        void fetchGreeting();
      }
    }, 300);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    triggerGreeting,
  };
}
