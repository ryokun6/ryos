import {
  editTelegramMessageText,
  sendTelegramMessage,
  sendTelegramMessageDraft,
} from "./telegram.js";

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_STREAM_UPDATE_INTERVAL_MS = 900;
const DEFAULT_STREAM_MIN_CHAR_DELTA = 80;

type TelegramStreamDeps = {
  sendDraft?: typeof sendTelegramMessageDraft;
  sendMessage?: typeof sendTelegramMessage;
  editMessage?: typeof editTelegramMessageText;
  now?: () => number;
};

type StreamTelegramReplyOptions = {
  botToken: string;
  chatId: string;
  draftId: number;
  textStream: AsyncIterable<string>;
  replyToMessageId?: number;
  updateIntervalMs?: number;
  minCharDelta?: number;
  formatText?: (text: string) => string;
  onBeforePreview?: () => Promise<void>;
  logWarn?: (message: string, details?: unknown) => void;
  deps?: TelegramStreamDeps;
};

export type StreamTelegramReplyResult = {
  text: string;
  previewMode: "none" | "draft" | "legacy";
  messageIds: number[];
};

export function splitTelegramMessageText(
  text: string,
  maxLength = TELEGRAM_MAX_MESSAGE_LENGTH
): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const parts: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength - 1);
    if (splitAt < Math.floor(maxLength * 0.6)) {
      splitAt = remaining.lastIndexOf(" ", maxLength - 1);
    }
    if (splitAt <= 0) {
      splitAt = maxLength;
    } else {
      splitAt += 1;
    }

    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

function isDraftMethodUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/sendMessageDraft failed \((404|405|501)\)/.test(message)) {
    return true;
  }

  return (
    /sendMessageDraft failed \(400\)/.test(message) &&
    /method not found|unknown method|not implemented|unsupported/i.test(message)
  );
}

export async function streamTelegramReply({
  botToken,
  chatId,
  draftId,
  textStream,
  replyToMessageId,
  updateIntervalMs = DEFAULT_STREAM_UPDATE_INTERVAL_MS,
  minCharDelta = DEFAULT_STREAM_MIN_CHAR_DELTA,
  formatText,
  onBeforePreview,
  logWarn,
  deps = {},
}: StreamTelegramReplyOptions): Promise<StreamTelegramReplyResult> {
  const sendDraft = deps.sendDraft ?? sendTelegramMessageDraft;
  const sendMessage = deps.sendMessage ?? sendTelegramMessage;
  const editMessage = deps.editMessage ?? editTelegramMessageText;
  const now = deps.now ?? Date.now;

  let fullText = "";
  let previewText = "";
  let previewMode: StreamTelegramReplyResult["previewMode"] = "none";
  let legacyMessageId: number | null = null;
  let previewStarted = false;
  let lastFlushAt = 0;
  let lastFlushedLength = 0;

  const ensurePreviewStarted = async () => {
    if (previewStarted) {
      return;
    }
    previewStarted = true;
    await onBeforePreview?.();
  };

  const publishPreview = async (text: string) => {
    const nextPreviewText = splitTelegramMessageText(text)[0];
    if (!nextPreviewText || nextPreviewText === previewText) {
      return;
    }

    await ensurePreviewStarted();

    if (previewMode !== "legacy") {
      try {
        await sendDraft({
          botToken,
          chatId,
          draftId,
          text: nextPreviewText,
        });
        previewMode = "draft";
        previewText = nextPreviewText;
        return;
      } catch (error) {
        if (!isDraftMethodUnsupported(error)) {
          throw error;
        }

        previewMode = "legacy";
        logWarn?.("Telegram draft streaming unavailable, falling back to send/edit", {
          chatId,
          draftId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (legacyMessageId == null) {
      legacyMessageId = await sendMessage({
        botToken,
        chatId,
        text: nextPreviewText,
        replyToMessageId,
      });
      previewText = nextPreviewText;
      return;
    }

    await editMessage({
      botToken,
      chatId,
      messageId: legacyMessageId,
      text: nextPreviewText,
    });
    previewText = nextPreviewText;
  };

  for await (const chunk of textStream) {
    fullText += chunk;
    const normalized = formatText ? formatText(fullText.trim()) : fullText.trim();
    if (!normalized) {
      continue;
    }

    const shouldFlush =
      previewText.length === 0 ||
      (normalized.length - lastFlushedLength >= minCharDelta &&
        now() - lastFlushAt >= updateIntervalMs);

    if (!shouldFlush) {
      continue;
    }

    await publishPreview(normalized);
    lastFlushAt = now();
    lastFlushedLength = normalized.length;
  }

  const replyText = formatText ? formatText(fullText.trim()) : fullText.trim();
  if (!replyText) {
    return {
      text: "",
      previewMode,
      messageIds: [],
    };
  }

  if (previewText.length > 0) {
    await publishPreview(replyText);
  }

  const messageIds: number[] = [];
  const pages = splitTelegramMessageText(replyText);
  if (pages.length === 0) {
    return {
      text: "",
      previewMode,
      messageIds,
    };
  }

  if (previewMode === "legacy" && legacyMessageId != null) {
    if (previewText !== pages[0]) {
      await editMessage({
        botToken,
        chatId,
        messageId: legacyMessageId,
        text: pages[0],
      });
    }
    messageIds.push(legacyMessageId);
  } else {
    const messageId = await sendMessage({
      botToken,
      chatId,
      text: pages[0],
      replyToMessageId,
    });
    if (typeof messageId === "number") {
      messageIds.push(messageId);
    }
  }

  for (const page of pages.slice(1)) {
    const messageId = await sendMessage({
      botToken,
      chatId,
      text: page,
    });
    if (typeof messageId === "number") {
      messageIds.push(messageId);
    }
  }

  return {
    text: replyText,
    previewMode,
    messageIds,
  };
}
