import { useEffect, useRef } from "react";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { getAIConversationRealtimeChannelName } from "@/shared/constants/realtime";
import {
  AI_CONVERSATION_UPDATED_REALTIME_EVENT,
  parseAIConversationUpdatedRealtimeEvent,
  type AIConversationChannel,
  type AIConversationUpdatedRealtimeEvent,
} from "@/shared/contracts/aiConversation";
import {
  getAIConversationSessionSnapshot,
  invalidateAIConversationSession,
  isLocalAIConversationOperation,
} from "@/api/aiConversations";

interface UseAIConversationRealtimeOptions {
  /** Which server-owned thread to watch (`chat` or `assistant`). */
  channel: AIConversationChannel;
  /** Lowercased authenticated username, or null when signed out. */
  username: string | null;
  /**
   * Called after the session cache has been invalidated for a genuine remote
   * update (another device changed the conversation). Typically triggers a
   * forced server re-hydration.
   */
  onRemoteUpdate: (event: AIConversationUpdatedRealtimeEvent) => void;
}

/**
 * Live cross-device updates for the server-owned AI conversation. Subscribes
 * to the user's `private-ai-…` realtime channel and reacts to
 * `ai-conversation-updated` events emitted whenever another device commits a
 * turn, receives a proactive greeting, imports history, or clears the thread.
 *
 * Events produced by this device (matched via locally minted operation ids)
 * and events at or below the cached revision are ignored.
 */
export function useAIConversationRealtime({
  channel,
  username,
  onRemoteUpdate,
}: UseAIConversationRealtimeOptions): void {
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  onRemoteUpdateRef.current = onRemoteUpdate;

  useEffect(() => {
    if (!username) return;
    const channelName = getAIConversationRealtimeChannelName(username);
    const realtimeChannel = subscribePusherChannel(channelName);

    const handleUpdate = (payload?: unknown) => {
      const event = parseAIConversationUpdatedRealtimeEvent(payload);
      if (!event || event.channel !== channel) return;
      // This device made the change; it already holds the resulting state.
      if (isLocalAIConversationOperation(event.operationId)) return;

      const session = getAIConversationSessionSnapshot(channel);
      if (
        session &&
        session.owner === username &&
        session.conversation.id === event.conversationId &&
        event.revision <= session.conversation.revision
      ) {
        return;
      }

      invalidateAIConversationSession(channel, username);
      onRemoteUpdateRef.current(event);
    };

    realtimeChannel.bind(AI_CONVERSATION_UPDATED_REALTIME_EVENT, handleUpdate);
    return () => {
      realtimeChannel.unbind(
        AI_CONVERSATION_UPDATED_REALTIME_EVENT,
        handleUpdate
      );
      unsubscribePusherChannel(channelName);
    };
  }, [channel, username]);
}
