import {
  ASSISTANT_SUMMON_MESSAGE,
  getUserMessageText,
  isAssistantGreetingRequest,
} from "./assistantGreeting";

/** Canonical English Chats nudge. Other locales keep the same 👋 *...* shape. */
export const CHAT_NUDGE_MESSAGE = "👋 *nudge sent*";

const LOCALIZED_NUDGE_TEXT = /^👋 \*[^*\n]{1,80}\*$/;

type QuotaMessage = {
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
};

export function isChatNudgeText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed === ASSISTANT_SUMMON_MESSAGE) return false;
  return trimmed === CHAT_NUDGE_MESSAGE || LOCALIZED_NUDGE_TEXT.test(trimmed);
}

/**
 * Whether this `/api/chat` call should consume an AI message.
 * Nudges and the desktop-assistant summon are user-triggered generations
 * and always count. Signed-in client-tool continuations do not.
 */
export function shouldChargeAiChatTurn(input: {
  trigger: "submit-message" | "regenerate-message";
  isAuthenticated: boolean;
  channel: "chat" | "assistant";
  messages: readonly QuotaMessage[];
}): boolean {
  if (input.trigger === "regenerate-message") return true;

  const last = input.messages.at(-1);
  const lastText = last ? getUserMessageText(last) : null;
  if (isChatNudgeText(lastText)) return true;

  const isSummon =
    input.channel === "assistant" &&
    input.messages.length === 1 &&
    isAssistantGreetingRequest([...input.messages], { persona: "assistant" });
  if (isSummon) return true;

  if (!input.isAuthenticated) return true;
  return last?.role === "user";
}
