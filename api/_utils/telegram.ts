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

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
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
  photoFileId: string | null;
}

export interface TelegramSendMessageOptions {
  botToken: string;
  chatId: string;
  text: string;
  replyToMessageId?: number;
  disableNotification?: boolean;
  fetchImpl?: typeof fetch;
}

export interface TelegramSendMessageDraftOptions {
  botToken: string;
  chatId: string;
  draftId: number;
  text: string;
  fetchImpl?: typeof fetch;
}

export interface TelegramEditMessageOptions {
  botToken: string;
  chatId: string;
  messageId: number;
  text: string;
  fetchImpl?: typeof fetch;
}

export interface TelegramDeleteMessageOptions {
  botToken: string;
  chatId: string;
  messageId: number;
  fetchImpl?: typeof fetch;
}

export interface TelegramChatActionOptions {
  botToken: string;
  chatId: string;
  action: "typing";
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

export function extractTelegramCommand(
  text: string
): { command: string; args: string | null } | null {
  const match = text
    .trim()
    .match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+))?$/);
  const command = match?.[1]?.trim().toLowerCase();
  if (!command) {
    return null;
  }

  const args = match?.[2]?.trim();
  return {
    command,
    args: args && args.length > 0 ? args : null,
  };
}

export function extractTelegramStartPayload(text: string): string | null {
  const extractedCommand = extractTelegramCommand(text);
  if (extractedCommand?.command !== "start") {
    return null;
  }

  return extractedCommand.args;
}

export function matchesTelegramCommand(
  text: string,
  commands: string[]
): boolean {
  const extractedCommand = extractTelegramCommand(text);
  if (!extractedCommand) {
    return false;
  }

  return commands.some(
    (command) => extractedCommand.command === command.trim().toLowerCase()
  );
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
    typeof message.from?.id !== "number"
  ) {
    return null;
  }

  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  const hasText = typeof message.text === "string" && message.text.trim().length > 0;
  const hasCaption = typeof message.caption === "string" && message.caption.trim().length > 0;

  if (!hasText && !hasPhoto) {
    return null;
  }

  const text = hasText
    ? message.text!.trim()
    : hasCaption
      ? message.caption!.trim()
      : "";

  const photoFileId = hasPhoto
    ? message.photo![message.photo!.length - 1].file_id
    : null;

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
    startPayload: text ? extractTelegramStartPayload(text) : null,
    photoFileId,
  };
}

export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  replyToMessageId,
  disableNotification = false,
  fetchImpl = fetch,
}: TelegramSendMessageOptions): Promise<number | null> {
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
    try {
      const data = (await response.json()) as {
        ok?: boolean;
        result?: { message_id?: number };
      };
      return typeof data.result?.message_id === "number" ? data.result.message_id : null;
    } catch {
      return null;
    }
  }

  const body = await response.text();
  throw new Error(
    `Telegram sendMessage failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function sendTelegramMessageDraft({
  botToken,
  chatId,
  draftId,
  text,
  fetchImpl = fetch,
}: TelegramSendMessageDraftOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "sendMessageDraft"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      draft_id: draftId,
      text,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram sendMessageDraft failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function editTelegramMessageText({
  botToken,
  chatId,
  messageId,
  text,
  fetchImpl = fetch,
}: TelegramEditMessageOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "editMessageText"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram editMessageText failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function deleteTelegramMessage({
  botToken,
  chatId,
  messageId,
  fetchImpl = fetch,
}: TelegramDeleteMessageOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "deleteMessage"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram deleteMessage failed (${response.status})${
      body ? `: ${body}` : ""
    }`
  );
}

export async function sendTelegramChatAction({
  botToken,
  chatId,
  action,
  fetchImpl = fetch,
}: TelegramChatActionOptions): Promise<void> {
  const response = await fetchImpl(buildTelegramApiUrl(botToken, "sendChatAction"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      action,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Telegram sendChatAction failed (${response.status})${
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

export async function getTelegramFileUrl({
  botToken,
  fileId,
  fetchImpl = fetch,
}: {
  botToken: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const response = await fetchImpl(
    buildTelegramApiUrl(botToken, "getFile"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Telegram getFile failed (${response.status})${body ? `: ${body}` : ""}`
    );
  }

  const data = (await response.json()) as {
    ok?: boolean;
    result?: { file_id: string; file_path?: string };
  };

  if (!data.ok || !data.result?.file_path) {
    throw new Error("Telegram getFile returned no file_path");
  }

  return `${getTelegramBotApiBaseUrl()}/file/bot${botToken}/${data.result.file_path}`;
}

export async function downloadTelegramFile({
  botToken,
  fileId,
  fetchImpl = fetch,
}: {
  botToken: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ data: Uint8Array; mimeType: string }> {
  const fileUrl = await getTelegramFileUrl({ botToken, fileId, fetchImpl });
  const response = await fetchImpl(fileUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download Telegram file (${response.status})`
    );
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = await response.arrayBuffer();

  return {
    data: new Uint8Array(buffer),
    mimeType: contentType,
  };
}
