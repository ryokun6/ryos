import type { UIMessage } from "@ai-sdk/react";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";

/**
 * Matches the assistant plain text UTF-16 length used by Streamdown / incremental TTS
 * (decoded entities, urgent prefix stripped, text parts concatenated).
 */
export function getAssistantVisibleText(message: UIMessage): string {
  type MessagePart = {
    type: string;
    text?: string;
  };

  if (message.parts && message.parts.length > 0) {
    return message.parts
      .reduce<string[]>((acc, part: MessagePart) => {
        if (part.type !== "text") {
          return acc;
        }
        const text = part.text || "";
        const rawVisible = text.startsWith("!!!!") ? text.slice(4).trimStart() : text;
        acc.push(decodeHtmlEntities(rawVisible));
        return acc;
      }, [])
      .join("");
  }

  return "";
}
