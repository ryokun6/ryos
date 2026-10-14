interface ContentPart {
  type?: string;
  text?: string;
}

interface AssistantLikeMessage {
  role: string;
  parts?: readonly ContentPart[];
}

function hasVisibleAssistantContent(message: AssistantLikeMessage): boolean {
  for (const part of message.parts ?? []) {
    if (part.type === "text" && (part.text ?? "").trim().length > 0) {
      return true;
    }
    if (
      part.type === "file" ||
      part.type === "dynamic-tool" ||
      (typeof part.type === "string" && part.type.startsWith("tool-"))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Drop a trailing assistant placeholder left behind when a UI stream errors
 * after the `start` chunk and before any visible text or tool part.
 * Messages that already have text or tool calls stay so recovery can run.
 */
export function withoutContentlessFailedAssistant<T extends AssistantLikeMessage>(
  messages: readonly T[],
  isError: boolean
): T[] {
  if (!isError || messages.length === 0) return [...messages];
  const last = messages[messages.length - 1];
  if (last.role === "assistant" && !hasVisibleAssistantContent(last)) {
    return messages.slice(0, -1);
  }
  return [...messages];
}
