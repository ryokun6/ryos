import type { ChatMessage } from "@/types/chat";

const MESSAGE_HISTORY_CAP = 500;
const MATCH_WINDOW_MS = 10_000;

export const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MESSAGE_HISTORY_CAP);

export const sortAndCapRoomMessages = (
  messages: ChatMessage[]
): ChatMessage[] =>
  capRoomMessages([...messages].sort((a, b) => a.timestamp - b.timestamp));

export const mergeServerMessagesWithOptimistic = (
  existingMessages: ChatMessage[],
  fetchedMessages: ChatMessage[]
): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  const tempMessages: ChatMessage[] = [];

  for (const message of existingMessages) {
    if (message.id.startsWith("temp_")) {
      tempMessages.push(message);
    } else {
      byId.set(message.id, message);
    }
  }

  for (const message of fetchedMessages) {
    const prev = byId.get(message.id);
    if (prev?.clientId) {
      byId.set(message.id, { ...message, clientId: prev.clientId });
    } else {
      byId.set(message.id, message);
    }
  }

  const usedTempIds = new Set<string>();

  for (const temp of tempMessages) {
    const tempClientId = temp.clientId || temp.id;
    let matched = false;

    for (const serverMessage of fetchedMessages) {
      if (serverMessage.clientId && serverMessage.clientId === tempClientId) {
        const existingServerMessage = byId.get(serverMessage.id);
        if (existingServerMessage) {
          byId.set(serverMessage.id, {
            ...existingServerMessage,
            clientId: tempClientId,
          });
        }
        matched = true;
        break;
      }

      if (
        serverMessage.username === temp.username &&
        serverMessage.content === temp.content &&
        Math.abs(serverMessage.timestamp - temp.timestamp) <= MATCH_WINDOW_MS
      ) {
        const existingServerMessage = byId.get(serverMessage.id);
        if (existingServerMessage) {
          byId.set(serverMessage.id, {
            ...existingServerMessage,
            clientId: tempClientId,
          });
        }
        matched = true;
        break;
      }
    }

    if (!matched && !usedTempIds.has(temp.id)) {
      byId.set(temp.id, temp);
      usedTempIds.add(temp.id);
    }
  }

  return sortAndCapRoomMessages(Array.from(byId.values()));
};
