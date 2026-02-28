import type { ChatMessage, ChatRoom } from "@/types/chat";
import type { ApiMessage } from "../types";

export const MESSAGE_HISTORY_CAP = 500;

export const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MESSAGE_HISTORY_CAP);

export const sortMessagesByTimestamp = (
  messages: ChatMessage[]
): ChatMessage[] => [...messages].sort((a, b) => a.timestamp - b.timestamp);

export const sortAndCapMessages = (messages: ChatMessage[]): ChatMessage[] =>
  capRoomMessages(sortMessagesByTimestamp(messages));

export const decodeHtmlEntities = (str: string): string =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

export const normalizeApiMessage = (msg: ApiMessage): ChatMessage => ({
  ...msg,
  content: decodeHtmlEntities(String(msg.content || "")),
  timestamp:
    typeof msg.timestamp === "string" || typeof msg.timestamp === "number"
      ? new Date(msg.timestamp).getTime()
      : msg.timestamp,
});

export const normalizeApiMessages = (messages: ApiMessage[]): ChatMessage[] =>
  messages.map(normalizeApiMessage).sort((a, b) => a.timestamp - b.timestamp);

export const sortRoomsForDisplay = (rooms: ChatRoom[]): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const ao = a.type === "private" ? 1 : 0;
    const bo = b.type === "private" ? 1 : 0;
    if (ao !== bo) return ao - bo;
    const an = (a.name || "").toLowerCase();
    const bn = (b.name || "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return a.id.localeCompare(b.id);
  });

export const upsertIncomingRoomMessage = (
  existingMessages: ChatMessage[],
  message: ChatMessage
): ChatMessage[] => {
  const incomingContent = decodeHtmlEntities(
    String((message as unknown as { content?: string }).content || "")
  );
  const incoming: ChatMessage = {
    ...(message as ChatMessage),
    content: incomingContent,
  };

  if (existingMessages.some((m) => m.id === incoming.id)) {
    return existingMessages;
  }

  const incomingClientId = (incoming as Partial<ChatMessage>).clientId as
    | string
    | undefined;
  if (incomingClientId) {
    const idxByClientId = existingMessages.findIndex(
      (m) => m.id === incomingClientId || m.clientId === incomingClientId
    );
    if (idxByClientId !== -1) {
      const tempMsg = existingMessages[idxByClientId];
      const replaced = {
        ...incoming,
        clientId: tempMsg.clientId || tempMsg.id,
      } as ChatMessage;
      const updated = [...existingMessages];
      updated[idxByClientId] = replaced;
      return sortAndCapMessages(updated);
    }
  }

  const tempIndex = existingMessages.findIndex(
    (m) =>
      m.id.startsWith("temp_") &&
      m.username === incoming.username &&
      m.content === incoming.content
  );

  if (tempIndex !== -1) {
    const tempMsg = existingMessages[tempIndex];
    const replaced = {
      ...incoming,
      clientId: tempMsg.clientId || tempMsg.id,
    } as ChatMessage;
    const updated = [...existingMessages];
    updated[tempIndex] = replaced;
    return sortAndCapMessages(updated);
  }

  const WINDOW_MS = 5000;
  const incomingTs = Number((incoming as unknown as { timestamp: number }).timestamp);
  const candidateIndexes: number[] = [];
  existingMessages.forEach((m, idx) => {
    if (m.id.startsWith("temp_") && m.username === incoming.username) {
      const dt = Math.abs(Number(m.timestamp) - incomingTs);
      if (Number.isFinite(dt) && dt <= WINDOW_MS) {
        candidateIndexes.push(idx);
      }
    }
  });

  if (candidateIndexes.length > 0) {
    let bestIdx = candidateIndexes[0];
    let bestDt = Math.abs(Number(existingMessages[bestIdx].timestamp) - incomingTs);
    for (let i = 1; i < candidateIndexes.length; i++) {
      const idx = candidateIndexes[i];
      const dt = Math.abs(Number(existingMessages[idx].timestamp) - incomingTs);
      if (dt < bestDt) {
        bestIdx = idx;
        bestDt = dt;
      }
    }
    const tempMsg = existingMessages[bestIdx];
    const replaced = {
      ...incoming,
      clientId: tempMsg.clientId || tempMsg.id,
    } as ChatMessage;
    const updated = [...existingMessages];
    updated[bestIdx] = replaced;
    return sortAndCapMessages(updated);
  }

  return sortAndCapMessages([...existingMessages, incoming]);
};

export const mergeFetchedMessages = (
  existing: ChatMessage[],
  fetchedMessages: ChatMessage[]
): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  const tempMessages: ChatMessage[] = [];
  for (const m of existing) {
    if (m.id.startsWith("temp_")) {
      tempMessages.push(m);
    } else {
      byId.set(m.id, m);
    }
  }

  for (const m of fetchedMessages) {
    const prev = byId.get(m.id);
    if (prev && prev.clientId) {
      byId.set(m.id, { ...m, clientId: prev.clientId });
    } else {
      byId.set(m.id, m);
    }
  }

  const MATCH_WINDOW_MS = 10000;
  const usedTempIds = new Set<string>();

  for (const temp of tempMessages) {
    const tempClientId = temp.clientId || temp.id;
    let matched = false;

    for (const serverMsg of fetchedMessages) {
      const serverClientId = (serverMsg as ChatMessage & { clientId?: string })
        .clientId;
      if (serverClientId && serverClientId === tempClientId) {
        byId.set(serverMsg.id, {
          ...byId.get(serverMsg.id)!,
          clientId: tempClientId,
        });
        matched = true;
        break;
      }

      if (
        serverMsg.username === temp.username &&
        serverMsg.content === temp.content &&
        Math.abs(serverMsg.timestamp - temp.timestamp) <= MATCH_WINDOW_MS
      ) {
        byId.set(serverMsg.id, {
          ...byId.get(serverMsg.id)!,
          clientId: tempClientId,
        });
        matched = true;
        break;
      }
    }

    if (!matched && !usedTempIds.has(temp.id)) {
      byId.set(temp.id, temp);
      usedTempIds.add(temp.id);
    }
  }

  return capRoomMessages(
    Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
  );
};
