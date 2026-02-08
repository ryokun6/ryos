import type { ChatMessage } from "@/types/chat";
import { sortAndCapRoomMessages } from "./chatsRoomMessages";

const INCOMING_TEMP_MATCH_WINDOW_MS = 5_000;

export const mergeIncomingRoomMessage = (
  existingMessages: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] | null => {
  // If this exact server message already exists, skip
  if (existingMessages.some((message) => message.id === incoming.id)) {
    return null;
  }

  // Prefer replacing by clientId when provided by the server
  const incomingClientId = incoming.clientId;
  if (incomingClientId) {
    const indexByClientId = existingMessages.findIndex(
      (message) =>
        message.id === incomingClientId || message.clientId === incomingClientId
    );
    if (indexByClientId !== -1) {
      const tempMessage = existingMessages[indexByClientId];
      const replaced = {
        ...incoming,
        clientId: tempMessage.clientId || tempMessage.id,
      } satisfies ChatMessage;
      const updated = [...existingMessages];
      updated[indexByClientId] = replaced;
      return sortAndCapRoomMessages(updated);
    }
  }

  // Fallback: replace a temp message by matching username + content (decoded)
  const tempIndex = existingMessages.findIndex(
    (message) =>
      message.id.startsWith("temp_") &&
      message.username === incoming.username &&
      message.content === incoming.content
  );

  if (tempIndex !== -1) {
    const tempMessage = existingMessages[tempIndex];
    const replaced = {
      ...incoming,
      clientId: tempMessage.clientId || tempMessage.id, // preserve stable client key
    } satisfies ChatMessage;
    const updated = [...existingMessages];
    updated[tempIndex] = replaced; // replace in place to minimise list churn
    return sortAndCapRoomMessages(updated);
  }

  // Second fallback: replace the most recent temp message from same user within time window
  // This handles cases where server sanitizes content (e.g., profanity filter) so content differs
  const incomingTs = Number(incoming.timestamp);
  const candidateIndexes: number[] = [];
  existingMessages.forEach((message, idx) => {
    if (message.id.startsWith("temp_") && message.username === incoming.username) {
      const delta = Math.abs(Number(message.timestamp) - incomingTs);
      if (Number.isFinite(delta) && delta <= INCOMING_TEMP_MATCH_WINDOW_MS) {
        candidateIndexes.push(idx);
      }
    }
  });

  if (candidateIndexes.length > 0) {
    // Choose the closest in time
    let bestIndex = candidateIndexes[0];
    let bestDelta = Math.abs(Number(existingMessages[bestIndex].timestamp) - incomingTs);
    for (let i = 1; i < candidateIndexes.length; i++) {
      const idx = candidateIndexes[i];
      const delta = Math.abs(Number(existingMessages[idx].timestamp) - incomingTs);
      if (delta < bestDelta) {
        bestIndex = idx;
        bestDelta = delta;
      }
    }
    const tempMessage = existingMessages[bestIndex];
    const replaced = {
      ...incoming,
      clientId: tempMessage.clientId || tempMessage.id,
    } satisfies ChatMessage;
    const updated = [...existingMessages];
    updated[bestIndex] = replaced;
    return sortAndCapRoomMessages(updated);
  }

  // No optimistic message to replace – append normally
  return sortAndCapRoomMessages([...existingMessages, incoming]);
};
