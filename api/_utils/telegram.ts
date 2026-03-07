export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface ParsedTelegramTextUpdate {
  updateId: number;
  messageId: number;
  chatId: string;
  chatType: string;
  text: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  isPrivateChat: boolean;
  startPayload: string | null;
}

export interface TelegramSendMessageOptions {
  botToken: string;
  chatId: string;
  text: string;
  replyToMessageId?: number;
  disableNotification?: boolean;
  fetchImpl?: typeof fetch;
}

export interface TelegramWebhookOptions {
  botToken: string;
  webhookUrl: string;
  secretToken: string;
  allowedUpdates?: string[];
  fetchImpl?: typeof fetch;
}

export function getTelegramBotUsername(): string {
  const explicit = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (explicit) {
    return explicit;
  }

  const apiEnv =
    process.env.API_RUNTIME_ENV ||
    process.env.API_ENV ||
    process.env.VERCEL_ENV;

  if (apiEnv === "production" || process.env.NODE_ENV === "production") {
    return "ryos_ryobot";
  }

  return "ryos_devbot";
}

export function getTelegramBotApiBaseUrl(): string {
  return (
    process.env.TELEGRAM_BOT_API_BASE_URL?.trim() ||
    "https://api.telegram.org"
  ).replace(/\/$/, "");
}

export function buildTelegramApiUrl(
  botToken: string,
  method: string
): string {
  return `${getTelegramBotApiBaseUrl()}/bot${botToken}/${method}`;
}

export function buildTelegramDeepLink(
  botUsername: string | undefined,
  payload: string
): string | null {
  const username = botUsername?.trim().replace(/^@/, "");
  const normalizedPayload = payload.trim();
  if (!username || !normalizedPayload) {
    return null;
  }

  return `https://t.me/${username}?start=${encodeURIComponent(
    normalizedPayload
  )}`;
}

export function extractTelegramStartPayload(text: string): string | null {
  const match = text
    .trim()
    .match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/);
  const payload = match?.[1]?.trim();
  return payload && payload.length > 0 ? payload : null;
}

export function parseTelegramTextUpdate(
  update: TelegramUpdate | null | undefined
): ParsedTelegramTextUpdate | null {
  if (!update || typeof update.update_id !== "number") {
    return null;
  }

  const message = update.message;
  if (
    !message ||
    typeof message.message_id !== "number" ||
    typeof message.chat?.id !== "number" ||
    typeof message.chat?.type !== "string" ||
    typeof message.text !== "string" ||
    typeof message.from?.id !== "number"
  ) {
    return null;
  }

  const text = message.text.trim();
  if (!text) {
    return null;
  }

  return {
    updateId: update.update_id,
    messageId: message.message_id,
    chatId: String(message.chat.id),
    chatType: message.chat.type,
    text,
    telegramUserId: String(message.from.id),
    telegramUsername:
      typeof message.from.username === "string" && message.from.username.trim()
        ? message.from.username.trim()
        : null,
    firstName:
      typeof message.from.first_name === "string" && message.from.first_name
        ? message.from.first_name
        : null,
    lastName:
      typeof message.from.last_name === "string" && message.from.last_name
        ? message.from.last_name
        : null,
    isPrivateChat: message.chat.type === "private",
    startPayload: extractTelegramStartPayload(text),
  };
}

export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  replyToMessageId,
  disableNotification = false,
  fetchImpl = fetch,
}: TelegramSendMessageOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "sendMessage"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_notification: disableNotification,
      ...(replyToMessageId
        ? { reply_parameters: { message_id: replyToMessageId } }
        : {}),
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram sendMessage failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function setTelegramWebhook({
  botToken,
  webhookUrl,
  secretToken,
  allowedUpdates = ["message"],
  fetchImpl = fetch,
}: TelegramWebhookOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "setWebhook"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: allowedUpdates,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram setWebhook failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function getTelegramBotProfile({
  botToken,
  fetchImpl = fetch,
}: {
  botToken: string;
  fetchImpl?: typeof fetch;
}): Promise<TelegramUser> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "getMe"));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Telegram getMe failed (${response.status})${body ? `: ${body}` : ""}`
    );
  }

  const data = (await response.json()) as {
    ok?: boolean;
    result?: TelegramUser;
  };

  if (!data.ok || !data.result) {
    throw new Error("Telegram getMe returned an unexpected response");
  }

  return data.result;
}
