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

  return aiMessages.slice(-messageRenderLimit).map((msg) => ({
    ...msg,
    username: msg.role === "user" ? username || "You" : "Ryo",
  }));
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
