import type { AIChatMessage } from "@/types/chat";

const TRANSCRIPT_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export const formatTranscriptTimestamp = (
  createdAt: Date | string | number | undefined,
): string => {
  if (createdAt == null) {
    return "";
  }

  const parsed = new Date(createdAt);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString("en-US", TRANSCRIPT_TIME_FORMAT);
};

export const buildChatTranscript = ({
  messages,
  username,
  getVisibleText,
}: {
  messages: AIChatMessage[];
  username: string | null | undefined;
  getVisibleText: (message: AIChatMessage) => string;
}): string =>
  messages
    .map((message) => {
      const sender = message.role === "user" ? username || "You" : "Ryo";
      const timestamp = formatTranscriptTimestamp(message.metadata?.createdAt);
      const content = getVisibleText(message);
      return `**${sender}** (${timestamp}):\n${content}`;
    })
    .join("\n\n");
