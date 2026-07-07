import { triggerRealtimeEvent } from "../../../_utils/realtime.js";
import { getAIConversationRealtimeChannelName } from "../../../../src/shared/constants/realtime.js";
import {
  AI_CONVERSATION_UPDATED_REALTIME_EVENT,
  type AIConversationChannel,
  type AIConversationUpdateReason,
  type AIConversationUpdatedRealtimeEvent,
} from "../../../../src/shared/contracts/aiConversation.js";

export interface BroadcastAIConversationUpdateInput {
  username: string;
  channel: AIConversationChannel;
  conversationId: string;
  revision: number;
  reason: AIConversationUpdateReason;
  operationId: string;
}

/**
 * Notify the owner's other signed-in devices that the canonical server
 * conversation changed. Fire-and-forget: a delivery failure must never fail
 * the write it announces (the focus/visibility refresh remains the fallback).
 */
export async function broadcastAIConversationUpdate({
  username,
  channel,
  conversationId,
  revision,
  reason,
  operationId,
}: BroadcastAIConversationUpdateInput): Promise<void> {
  const event: AIConversationUpdatedRealtimeEvent = {
    channel,
    conversationId,
    revision,
    reason,
    operationId,
  };
  try {
    await triggerRealtimeEvent(
      getAIConversationRealtimeChannelName(username),
      AI_CONVERSATION_UPDATED_REALTIME_EVENT,
      event
    );
  } catch (error) {
    console.warn("[ai-conversation] Failed to broadcast update:", error);
  }
}
