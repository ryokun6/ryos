import type { AIChatMessage, ChatMessage } from "@/types/chat";

export interface DisplayMessage extends Omit<AIChatMessage, "role"> {
  username?: string;
  role: AIChatMessage["role"] | "human";
  serverId?: string;
}

interface BuildDisplayMessagesParams {
  currentRoomId: string | null;
  currentRoomMessagesLimited: ChatMessage[];
  aiMessages: AIChatMessage[];
  messageRenderLimit: number;
  username: string | null;
}

// Reuse display wrappers keyed by the source AI message object so that
// unchanged messages keep referential identity across streaming ticks.
// Without this, every token delta re-wraps the whole thread and defeats
// React.memo on the message rows.
const displayMessageCache = new WeakMap<
  AIChatMessage,
  { username: string; display: DisplayMessage }
>();

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
  aiMessages,
  messageRenderLimit,
  username,
}: BuildDisplayMessagesParams): DisplayMessage[] => {
  if (currentRoomId) {
    return currentRoomMessagesLimited.map((msg, index) => ({
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
    }));
  }

  return aiMessages
    .slice(-messageRenderLimit)
    .map((msg) => toDisplayMessage(msg, username));
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
