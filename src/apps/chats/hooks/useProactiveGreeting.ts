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
 * Delay before triggering a proactive greeting when the Chats window
 * is (re)opened while the chat is still untouched.
 */
const REOPEN_DELAY_MS = 5_000;

/**
 * Minimum time between re-open triggered fetches to avoid rapid API calls.
 */
const FETCH_COOLDOWN_MS = 30_000;

/** Helper: check if the store has an untouched greeting (static or proactive). */
function isStoreUntouched(state: { aiMessages: AIChatMessage[] }) {
  return (
    state.aiMessages.length === 1 &&
    (state.aiMessages[0].id === "1" ||
      state.aiMessages[0].id === "proactive-1") &&
    state.aiMessages[0].role === "assistant"
  );
}

/** Helper: check if a user is in the allowed list. */
function isUserEligible(state: {
  username: string | null;
  authToken: string | null;
}) {
  return (
    !!state.username &&
    ALLOWED_USERS.has(state.username.toLowerCase()) &&
    !!state.authToken
  );
}

/**
 * Hook that manages proactive AI greetings for eligible users.
 *
 * When a new/cleared chat has only the default greeting message and the
 * current user is in the allowlist, this hook:
 * 1. Shows a typing indicator
 * 2. Calls the proactive-greeting API
 * 3. Replaces the generic greeting with the AI-generated one
 *
 * Additionally, when the Chats window is (re)opened and the chat is still
 * untouched (user hasn't sent a message), a fresh greeting is fetched after
 * a short delay so the AI feels responsive when the user returns.
 *
 * @param isWindowOpen Whether the Chats app window is currently open/visible.
 */
export function useProactiveGreeting(isWindowOpen: boolean = true) {
  // Initialize loading state eagerly so eligible users never see the static greeting
  const [isLoadingGreeting, setIsLoadingGreeting] = useState(() => {
    const state = useChatsStore.getState();
    const fresh =
      state.aiMessages.length === 1 &&
      state.aiMessages[0].id === "1" &&
      state.aiMessages[0].role === "assistant";
    return fresh && isUserEligible(state);
  });
  const hasTriggeredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** True while fetchGreeting is in-flight. */
  const fetchingRef = useRef(false);
  /** Timestamp of the last re-open triggered fetch (for cooldown). */
  const lastReopenFetchRef = useRef(0);
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWindowOpenRef = useRef(isWindowOpen);

  const username = useChatsStore((s) => s.username);
  const authToken = useChatsStore((s) => s.authToken);
  const aiMessages = useChatsStore((s) => s.aiMessages);
  const setAiMessages = useChatsStore((s) => s.setAiMessages);

  /**
   * Fresh chat: only the static default greeting is present (id === "1").
   * Used for the immediate trigger on first open / after clear.
   */
  const isFreshChat =
    aiMessages.length === 1 &&
    aiMessages[0].id === "1" &&
    aiMessages[0].role === "assistant";

  /**
   * Untouched chat: the user hasn't sent any messages yet.
   * The greeting may be the static default or an already-fetched proactive one.
   * Used for the delayed re-open trigger.
   */
  const isUntouchedChat =
    aiMessages.length === 1 &&
    (aiMessages[0].id === "1" || aiMessages[0].id === "proactive-1") &&
    aiMessages[0].role === "assistant";

  const isEligible =
    !!username && ALLOWED_USERS.has(username.toLowerCase()) && !!authToken;

  const fetchGreeting = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!username || !authToken) return;

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchingRef.current = true;

      if (!options?.silent) {
        setIsLoadingGreeting(true);
      }

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
          // Replace the greeting message with the proactive one.
          // Use a different ID so the SDK sync effect in useAiChat detects the change.
          const proactiveMessage: AIChatMessage = {
            id: "proactive-1",
            role: "assistant",
            parts: [{ type: "text", text: data.greeting }],
            metadata: {
              createdAt: new Date(),
            },
          };

          // Only update if chat is still untouched (user hasn't sent a message)
          const currentMessages = useChatsStore.getState().aiMessages;
          if (
            currentMessages.length === 1 &&
            (currentMessages[0].id === "1" ||
              currentMessages[0].id === "proactive-1") &&
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
          fetchingRef.current = false;
          if (!options?.silent) {
            setIsLoadingGreeting(false);
          }
        }
      }
    },
    [username, authToken, setAiMessages]
  );

  // ── Immediate trigger (first open with static greeting) ──────────────
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

  // ── Delayed trigger on window (re)open ───────────────────────────────
  useEffect(() => {
    const wasOpen = prevWindowOpenRef.current;
    prevWindowOpenRef.current = isWindowOpen;

    // Clear any pending timer
    if (reopenTimerRef.current) {
      clearTimeout(reopenTimerRef.current);
      reopenTimerRef.current = null;
    }

    // Window just (re)opened — schedule a deferred greeting refresh
    if (isWindowOpen && !wasOpen && isUntouchedChat && isEligible) {
      reopenTimerRef.current = setTimeout(() => {
        // Cooldown: skip if a re-open fetch happened recently
        const elapsed = Date.now() - lastReopenFetchRef.current;
        if (elapsed < FETCH_COOLDOWN_MS) return;

        // Skip if a fetch is already in-flight (e.g. from the immediate trigger)
        if (fetchingRef.current) return;

        // Re-check conditions at trigger time
        const state = useChatsStore.getState();
        if (!isStoreUntouched(state) || !isUserEligible(state)) return;

        lastReopenFetchRef.current = Date.now();
        // Use silent mode when refreshing an existing proactive greeting
        // so the user doesn't see a flash of typing dots.
        const currentId = state.aiMessages[0].id;
        fetchGreeting({ silent: currentId === "proactive-1" });
      }, REOPEN_DELAY_MS);
    }

    return () => {
      if (reopenTimerRef.current) {
        clearTimeout(reopenTimerRef.current);
        reopenTimerRef.current = null;
      }
    };
  }, [isWindowOpen, isUntouchedChat, isEligible, fetchGreeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (reopenTimerRef.current) {
        clearTimeout(reopenTimerRef.current);
      }
    };
  }, []);

  /**
   * Manually trigger a proactive greeting fetch.
   * Used after clearChats to re-trigger the greeting.
   */
  const triggerGreeting = useCallback(() => {
    // Skip if a fetch is already in-flight (e.g. the immediate trigger already
    // picked up the clear and started fetching).
    if (fetchingRef.current) return;

    hasTriggeredRef.current = false;
    // Small delay to allow the store to settle after clearChats.
    setTimeout(() => {
      // Re-check: another trigger may have started a fetch in the meantime.
      if (fetchingRef.current) return;

      const state = useChatsStore.getState();
      if (!isStoreUntouched(state) || !isUserEligible(state)) return;

      hasTriggeredRef.current = true;
      fetchGreeting();
    }, 100);
  }, [fetchGreeting]);

  return {
    isLoadingGreeting,
    triggerGreeting,
  };
}
