/**
 * Delivery helpers for recovery codes. Each returns whether the message was
 * actually dispatched so callers can decide on fallbacks without leaking which
 * channels a user has configured.
 */

import type { Redis } from "../redis.js";
import { getLinkedTelegramAccountByUsername } from "../telegram-link.js";
import { sendTelegramMessage } from "../telegram.js";
import {
  getStoredUserRecord,
  getUsernameByEmail,
  isValidEmail,
  normalizeEmail,
} from "./_user-record.js";

/**
 * Resolve an account username from a recovery identifier, which may be either a
 * username or a verified recovery email. Returns null when no account matches.
 *
 * Callers MUST NOT branch their HTTP response on the result (to avoid account
 * enumeration) — this only determines whether a code gets dispatched.
 */
export async function resolveRecoveryUsername(
  redis: Redis,
  identifier: string | null | undefined
): Promise<string | null> {
  if (!identifier || typeof identifier !== "string") return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    if (!isValidEmail(trimmed)) return null;
    return getUsernameByEmail(redis, normalizeEmail(trimmed) as string);
  }

  const username = trimmed.toLowerCase();
  const record = await getStoredUserRecord(redis, username);
  return record ? username : null;
}

/**
 * Send a message to a user's linked Telegram chat. Returns false (without
 * throwing) when the user has no linked account or the bot is not configured.
 */
export async function sendTelegramToUser(
  redis: Redis,
  username: string,
  text: string
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return false;

  const linked = await getLinkedTelegramAccountByUsername(redis, username);
  if (!linked?.chatId) return false;

  try {
    await sendTelegramMessage({ botToken, chatId: linked.chatId, text });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the user has a Telegram chat we could deliver to (and the bot is
 * configured). Used to decide whether to offer the Telegram channel.
 */
export async function hasTelegramChannel(
  redis: Redis,
  username: string
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return false;
  const linked = await getLinkedTelegramAccountByUsername(redis, username);
  return !!linked?.chatId;
}
