import type { UIMessage } from "@ai-sdk/react";

export type TextLikeMessagePart = {
  type: string;
  text?: string;
};

export type TextLikeMessage = Pick<UIMessage, "parts">;

export function getVisibleTextPartText(partText: string): string {
  return partText.startsWith("!!!!") ? partText.slice(4).trimStart() : partText;
}

export function getAssistantVisibleText(message: TextLikeMessage): string {
  if (!message.parts || message.parts.length === 0) {
    return "";
  }

  return message.parts
    .reduce<string[]>((acc, part: TextLikeMessagePart) => {
      if (part.type !== "text") {
        return acc;
      }
      acc.push(getVisibleTextPartText(part.text || ""));
      return acc;
    }, [])
    .join("");
}
