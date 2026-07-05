/**
 * Shared desktop-assistant greeting trigger used by the client summon flow
 * and the `/api/chat` rate-limit exemption.
 */
export const ASSISTANT_SUMMON_MESSAGE = "👋 *user summoned the assistant*";

type UserMessageLike = {
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
};

/** Extract visible user text from a UI or legacy chat message. */
export function getUserMessageText(message: UserMessageLike): string | null {
  if (message.role !== "user") return null;

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (Array.isArray(message.parts)) {
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text!)
      .join("")
      .trim();
    if (text) return text;
  }

  return null;
}

/**
 * True when the request is the automatic desktop-assistant greeting trigger
 * (exactly one user message matching {@link ASSISTANT_SUMMON_MESSAGE}).
 */
export function isAssistantGreetingRequest(
  messages: UserMessageLike[],
  options?: { persona?: string }
): boolean {
  if (options?.persona !== undefined && options.persona !== "assistant") {
    return false;
  }

  const userTexts = messages
    .map(getUserMessageText)
    .filter((text): text is string => text !== null);

  return (
    userTexts.length === 1 && userTexts[0] === ASSISTANT_SUMMON_MESSAGE
  );
}
