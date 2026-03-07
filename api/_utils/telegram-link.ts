import { generateAuthToken } from "./auth/index.js";
import type { RedisLike } from "./redis.js";

export const TELEGRAM_LINK_CODE_TTL_SECONDS = 10 * 60;
export const TELEGRAM_HISTORY_LIMIT = 16;
export const TELEGRAM_HISTORY_TTL_SECONDS = 14 * 24 * 60 * 60;
export const TELEGRAM_UPDATE_TTL_SECONDS = 24 * 60 * 60;

export interface TelegramLinkCodeRecord {
  username: string;
  createdAt: number;
}

export interface TelegramPendingLinkSessionRecord
  extends TelegramLinkCodeRecord {
  code: string;
}

export interface LinkedTelegramAccount {
  username: string;
  telegramUserId: string;
  chatId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedAt: number;
}

export interface TelegramConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  imageUrl?: string;
}

export function buildTelegramLinkCodeKey(code: string): string {
  return `telegram:link:code:${code}`;
}

export function buildTelegramPendingLinkKey(username: string): string {
  return `telegram:link:username:${username.toLowerCase()}`;
}

export function buildTelegramUserKey(telegramUserId: string): string {
  return `telegram:user:${telegramUserId}`;
}

export function buildTelegramUsernameKey(username: string): string {
  return `telegram:username:${username.toLowerCase()}`;
}

export function buildTelegramHistoryKey(chatId: string): string {
  return `telegram:history:${chatId}`;
}

export function buildTelegramProcessedUpdateKey(updateId: number): string {
  return `telegram:update:${updateId}`;
}

function parseJsonRecord<T>(raw: unknown): T | null {
  try {
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function parseTelegramConversationMessage(
  raw: unknown
): TelegramConversationMessage | null {
  const parsed = parseJsonRecord<TelegramConversationMessage>(raw);
  if (
    !parsed ||
    (parsed.role !== "user" && parsed.role !== "assistant") ||
    typeof parsed.content !== "string" ||
    typeof parsed.createdAt !== "number"
  ) {
    return null;
  }
  return parsed;
}

export function parseLinkedTelegramAccount(
  raw: unknown
): LinkedTelegramAccount | null {
  const parsed = parseJsonRecord<LinkedTelegramAccount>(raw);
  if (
    !parsed ||
    typeof parsed.username !== "string" ||
    typeof parsed.telegramUserId !== "string" ||
    typeof parsed.chatId !== "string" ||
    typeof parsed.linkedAt !== "number"
  ) {
    return null;
  }

  return {
    username: parsed.username.toLowerCase(),
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    telegramUsername: parsed.telegramUsername ?? null,
    firstName: parsed.firstName ?? null,
    lastName: parsed.lastName ?? null,
    linkedAt: parsed.linkedAt,
  };
}

export function parseTelegramLinkCodeRecord(
  raw: unknown
): TelegramLinkCodeRecord | null {
  const parsed = parseJsonRecord<TelegramLinkCodeRecord>(raw);
  if (
    !parsed ||
    typeof parsed.username !== "string" ||
    typeof parsed.createdAt !== "number"
  ) {
    return null;
  }

  return {
    username: parsed.username.toLowerCase(),
    createdAt: parsed.createdAt,
  };
}

export function parseTelegramPendingLinkSessionRecord(
  raw: unknown
): TelegramPendingLinkSessionRecord | null {
  const parsed = parseJsonRecord<TelegramPendingLinkSessionRecord>(raw);
  if (
    !parsed ||
    typeof parsed.username !== "string" ||
    typeof parsed.code !== "string" ||
    typeof parsed.createdAt !== "number"
  ) {
    return null;
  }

  return {
    username: parsed.username.toLowerCase(),
    code: parsed.code,
    createdAt: parsed.createdAt,
  };
}

export async function getTelegramPendingLinkSession(
  redis: RedisLike,
  username: string
): Promise<{ code: string; expiresIn: number } | null> {
  const pendingKey = buildTelegramPendingLinkKey(username);
  const raw = await redis.get<string>(pendingKey);
  const pending = parseTelegramPendingLinkSessionRecord(raw);

  if (!pending) {
    return null;
  }

  const expiresIn = await redis.ttl(buildTelegramLinkCodeKey(pending.code));
  if (expiresIn <= 0) {
    await redis.del(pendingKey);
    return null;
  }

  return {
    code: pending.code,
    expiresIn,
  };
}

export async function createTelegramLinkCode(
  redis: RedisLike,
  username: string,
  ttlSeconds: number = TELEGRAM_LINK_CODE_TTL_SECONDS
): Promise<{ code: string; expiresIn: number }> {
  const normalizedUsername = username.toLowerCase();
  const existingSession = await getTelegramPendingLinkSession(
    redis,
    normalizedUsername
  );
  if (existingSession) {
    return existingSession;
  }

  const code = generateAuthToken().slice(0, 24);
  const createdAt = Date.now();
  await redis.set(
    buildTelegramLinkCodeKey(code),
    JSON.stringify({
      username: normalizedUsername,
      createdAt,
    } satisfies TelegramLinkCodeRecord),
    { ex: ttlSeconds }
  );
  await redis.set(
    buildTelegramPendingLinkKey(normalizedUsername),
    JSON.stringify({
      username: normalizedUsername,
      code,
      createdAt,
    } satisfies TelegramPendingLinkSessionRecord),
    { ex: ttlSeconds }
  );

  return { code, expiresIn: ttlSeconds };
}

export async function consumeTelegramLinkCode(
  redis: RedisLike,
  code: string
): Promise<TelegramLinkCodeRecord | null> {
  const key = buildTelegramLinkCodeKey(code);
  const raw = await redis.get<string>(key);
  const parsed = parseTelegramLinkCodeRecord(raw);

  if (!parsed) {
    return null;
  }

  await redis.del(key, buildTelegramPendingLinkKey(parsed.username));
  return parsed;
}

export async function getLinkedTelegramAccountByUsername(
  redis: RedisLike,
  username: string
): Promise<LinkedTelegramAccount | null> {
  const raw = await redis.get<string>(buildTelegramUsernameKey(username));
  return parseLinkedTelegramAccount(raw);
}

export async function getLinkedTelegramAccountByTelegramUserId(
  redis: RedisLike,
  telegramUserId: string
): Promise<LinkedTelegramAccount | null> {
  const raw = await redis.get<string>(buildTelegramUserKey(telegramUserId));
  return parseLinkedTelegramAccount(raw);
}

export async function unlinkTelegramAccountByUsername(
  redis: RedisLike,
  username: string
): Promise<void> {
  const existing = await getLinkedTelegramAccountByUsername(redis, username);
  if (!existing) {
    return;
  }

  await redis.del(
    buildTelegramUsernameKey(existing.username),
    buildTelegramUserKey(existing.telegramUserId)
  );
}

export async function linkTelegramAccount(
  redis: RedisLike,
  options: {
    code: string;
    telegramUserId: string;
    chatId: string;
    telegramUsername?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }
): Promise<LinkedTelegramAccount | null> {
  const codeRecord = await consumeTelegramLinkCode(redis, options.code);
  if (!codeRecord) {
    return null;
  }

  const username = codeRecord.username.toLowerCase();
  const existingByUsername = await getLinkedTelegramAccountByUsername(
    redis,
    username
  );
  const existingByTelegram = await getLinkedTelegramAccountByTelegramUserId(
    redis,
    options.telegramUserId
  );

  if (
    existingByUsername &&
    existingByUsername.telegramUserId !== options.telegramUserId
  ) {
    await redis.del(buildTelegramUserKey(existingByUsername.telegramUserId));
  }

  if (existingByTelegram && existingByTelegram.username !== username) {
    await redis.del(buildTelegramUsernameKey(existingByTelegram.username));
  }

  const linkRecord: LinkedTelegramAccount = {
    username,
    telegramUserId: options.telegramUserId,
    chatId: options.chatId,
    telegramUsername: options.telegramUsername?.trim() || null,
    firstName: options.firstName?.trim() || null,
    lastName: options.lastName?.trim() || null,
    linkedAt: Date.now(),
  };

  const serialized = JSON.stringify(linkRecord);
  await redis.set(buildTelegramUsernameKey(username), serialized);
  await redis.set(buildTelegramUserKey(options.telegramUserId), serialized);

  return linkRecord;
}

export async function hasProcessedTelegramUpdate(
  redis: RedisLike,
  updateId: number
): Promise<boolean> {
  const count = await redis.exists(buildTelegramProcessedUpdateKey(updateId));
  return count > 0;
}

export async function markTelegramUpdateProcessed(
  redis: RedisLike,
  updateId: number,
  ttlSeconds: number = TELEGRAM_UPDATE_TTL_SECONDS
): Promise<void> {
  await redis.set(buildTelegramProcessedUpdateKey(updateId), "1", {
    ex: ttlSeconds,
  });
}

export async function loadTelegramConversationHistory(
  redis: RedisLike,
  chatId: string,
  limit: number = TELEGRAM_HISTORY_LIMIT
): Promise<TelegramConversationMessage[]> {
  const values = await redis.lrange<string>(buildTelegramHistoryKey(chatId), 0, limit - 1);
  return (values || [])
    .map((value) => parseTelegramConversationMessage(value))
    .filter(
      (value): value is TelegramConversationMessage => value !== null
    )
    .reverse();
}

export async function appendTelegramConversationMessage(
  redis: RedisLike,
  chatId: string,
  message: TelegramConversationMessage,
  options: {
    limit?: number;
    ttlSeconds?: number;
  } = {}
): Promise<void> {
  const limit = options.limit ?? TELEGRAM_HISTORY_LIMIT;
  const ttlSeconds = options.ttlSeconds ?? TELEGRAM_HISTORY_TTL_SECONDS;
  const key = buildTelegramHistoryKey(chatId);

  await redis.lpush(key, JSON.stringify(message));
  await redis.ltrim(key, 0, limit - 1);
  await redis.expire(key, ttlSeconds);
}
