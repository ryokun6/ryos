import { useCallback, useEffect, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { loadAIConversation } from "@/api/aiConversations";
import { useAIConversationRealtime } from "@/hooks/useAIConversationRealtime";
import type { AIConversationChannel } from "@/shared/contracts/aiConversation";
import type { AIChatMessage } from "@/types/chat";

/**
 * Minimum time between focus/visibility-triggered revalidations. Realtime
 * events already push genuine cross-device updates the moment they happen,
 * so the focus refresh is only a safety net for missed events — it doesn't
 * need to fire on every alt-tab (and `focus` + `visibilitychange` both fire
 * on the same tab activation).
 */
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

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

  // Callers pass inline closures for these; route them through refs so
  // `hydrate` stays referentially stable across renders. Otherwise the
  // hydration effect below re-runs — and re-fetches the conversation — on
  // every render of the calling component.
  const isChatReadyRef = useRef(isChatReady);
  isChatReadyRef.current = isChatReady;
  const applyMessagesRef = useRef(applyMessages);
  applyMessagesRef.current = applyMessages;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const lastRefreshAtRef = useRef(0);

  const hydrate = useCallback(
    async (force = false) => {
      if (!identity) return;
      // Every hydration counts as a refresh: push the next focus-triggered
      // revalidation out by the full interval.
      lastRefreshAtRef.current = Date.now();
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
        !isChatReadyRef.current()
      ) {
        return;
      }
      applyMessagesRef.current(loaded.messages);
    },
    [channel, identity]
  );

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    void hydrate(true).catch((error) => {
      if (!cancelled) onErrorRef.current(error, "hydrate");
    });
    return () => {
      cancelled = true;
    };
  }, [identity, hydrate]);

  useEffect(() => {
    if (!identity) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !isChatReadyRef.current()) {
        return;
      }
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      lastRefreshAtRef.current = now;
      void hydrate(true).catch((error) => onErrorRef.current(error, "refresh"));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [identity, hydrate]);

  // Live cross-device updates: re-hydrate as soon as another signed-in
  // device changes the canonical conversation.
  useAIConversationRealtime({
    channel,
    username: identity,
    onRemoteUpdate: () => {
      if (!isChatReadyRef.current()) return;
      void hydrate(true).catch((error) => onErrorRef.current(error, "realtime"));
    },
  });

  return { hydrate };
}
