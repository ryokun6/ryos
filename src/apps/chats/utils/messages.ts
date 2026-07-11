import type { AIChatMessage, ChatMessage } from "@/types/chat";
import { withCompactedMessagesMarker } from "./messageCompaction";

export interface DisplayMessage extends Omit<AIChatMessage, "role"> {
  username?: string;
  role: AIChatMessage["role"] | "human";
  serverId?: string;
}

interface BuildDisplayMessagesParams {
  currentRoomId: string | null;
  currentRoomMessagesLimited: ChatMessage[];
  /** True when older room messages exist beyond the render window. */
  roomHasOlderMessages?: boolean;
  aiMessages: AIChatMessage[];
  messageRenderLimit: number;
  username: string | null;
  /** True when server (or local) history was truncated/compacted. */
  aiHistoryCompacted?: boolean;
}

// Reuse display wrappers keyed by the source message object so that
// unchanged messages keep referential identity across streaming ticks.
// Without this, every token delta re-wraps the whole thread (and room
// recomputes rebuild fresh parts arrays) and defeats React.memo on the
// message rows.
const displayMessageCache = new WeakMap<
  AIChatMessage,
  { username: string; display: DisplayMessage }
>();

const roomDisplayMessageCache = new WeakMap<
  ChatMessage,
  { username: string | null; display: DisplayMessage }
>();

const toRoomDisplayMessage = (
  msg: ChatMessage,
  index: number,
  username: string | null
): DisplayMessage => {
  const cached = roomDisplayMessageCache.get(msg);
  if (cached && cached.username === username) {
    return cached.display;
  }
  const display: DisplayMessage = {
    // For room messages, use clientId (if present) for stable rendering key.
    // Fall back to server id + timestamp so optimistic rows never share "".
    id:
      msg.clientId?.trim() ||
      msg.id?.trim() ||
      `room-msg-${msg.timestamp}-${msg.username ?? "anon"}-${index}`,
    serverId: msg.id,
    role: msg.username === username ? "user" : "human",
    parts: [{ type: "text" as const, text: msg.content }],
    metadata: {
      createdAt: new Date(msg.timestamp),
    },
    username: msg.username,
  };
  roomDisplayMessageCache.set(msg, { username, display });
  return display;
};

const toDisplayMessage = (
  msg: AIChatMessage,
  username: string | null
): DisplayMessage => {
  const displayUsername = msg.role === "user" ? username || "You" : "Ryo";
  const cached = displayMessageCache.get(msg);
  if (cached && cached.username === displayUsername) {
    return cached.display;
  }
  const display: DisplayMessage = { ...msg, username: displayUsername };
  displayMessageCache.set(msg, { username: displayUsername, display });
  return display;
};

export const buildDisplayMessages = ({
  currentRoomId,
  currentRoomMessagesLimited,
  roomHasOlderMessages = false,
  aiMessages,
  messageRenderLimit,
  username,
  aiHistoryCompacted = false,
}: BuildDisplayMessagesParams): DisplayMessage[] => {
  if (currentRoomId) {
    const roomDisplay = currentRoomMessagesLimited.map((msg, index) =>
      toRoomDisplayMessage(msg, index, username)
    );
    return withCompactedMessagesMarker(roomDisplay, roomHasOlderMessages);
  }

  const visibleAiMessages = aiMessages.slice(-messageRenderLimit);
  const display = visibleAiMessages.map((msg) =>
    toDisplayMessage(msg, username)
  );
  const wasRenderCompacted = aiMessages.length > visibleAiMessages.length;
  return withCompactedMessagesMarker(
    display,
    aiHistoryCompacted || wasRenderCompacted
  );
};

export const extractPreviousUserMessages = (
  aiMessages: AIChatMessage[]
): string[] => {
  const userMessages = aiMessages.filter((msg) => msg.role === "user");

  return Array.from(
    new Set(
      userMessages.reduce<string[]>((acc, msg) => {
          if (!msg.parts) return acc;

          const textContent = msg.parts.reduce<string[]>((partsAcc, part) => {
            if (part.type === "text") {
              partsAcc.push((part as { type: string; text?: string }).text || "");
            }
            return partsAcc;
          }, []).join("");
          if (textContent) {
            acc.push(textContent);
          }
          return acc;
        }, [])
    )
  ).reverse() as string[];
};
