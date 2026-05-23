import type { UIMessage } from "@ai-sdk/react";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { cleanTextForSpeech } from "./textForSpeech";

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

/** One speakable line with UTF-16 highlight range in `getAssistantVisibleText` space. */
export type AssistSpeechLineSegment = {
  utterance: string;
  highlightStart: number;
  highlightEnd: number;
};

/** Split visible assistant text on line breaks for TTS + per-line highlights. */
export function splitAssistantVisibleIntoLineSpeechSegments(
  visiblePlain: string,
): AssistSpeechLineSegment[] {
  const segments: AssistSpeechLineSegment[] = [];
  let lineStart = 0;
  const re = /\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(visiblePlain))) {
    const rawEnd = m.index;
    const line = visiblePlain.slice(lineStart, rawEnd);
    const cleaned = cleanTextForSpeech(line.trimEnd());
    if (cleaned.length > 0) {
      segments.push({
        utterance: cleaned,
        highlightStart: lineStart,
        highlightEnd: rawEnd,
      });
    }
    lineStart = m.index + m[0].length;
  }

  const tail = visiblePlain.slice(lineStart);
  const cleanedTail = cleanTextForSpeech(tail.trimEnd());
  if (cleanedTail.length > 0) {
    segments.push({
      utterance: cleanedTail,
      highlightStart: lineStart,
      highlightEnd: visiblePlain.length,
    });
  }

  return segments;
}
