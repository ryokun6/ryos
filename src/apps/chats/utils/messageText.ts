import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";

export type ChatTextPart = {
  type: string;
  text?: string;
};

export type ChatTextMessage = {
  parts?: ChatTextPart[];
};

export function stripUrgentPrefix(text: string): string {
  return text.startsWith("!!!!") ? text.slice(4).trimStart() : text;
}

export function getChatMessageText(
  message: ChatTextMessage,
  options: {
    stripUrgentPrefixes?: boolean;
    decodeEntities?: boolean;
  } = {}
): string {
  if (!message.parts) return "";

  return message.parts
    .reduce<string[]>((acc, part) => {
      if (part.type !== "text") {
        return acc;
      }

      let text = part.text || "";
      if (options.stripUrgentPrefixes) {
        text = stripUrgentPrefix(text);
      }
      if (options.decodeEntities) {
        text = decodeHtmlEntities(text);
      }
      acc.push(text);
      return acc;
    }, [])
    .join("");
}

export function getAssistantVisibleText(message: ChatTextMessage): string {
  return getChatMessageText(message, {
    stripUrgentPrefixes: true,
    decodeEntities: true,
  });
}

export function getDisplayTextPart(text: string): string {
  return decodeHtmlEntities(stripUrgentPrefix(text));
}
