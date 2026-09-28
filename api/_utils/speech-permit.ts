/**
 * Ryo speech permits.
 *
 * `/api/speech` will synthesize a Ryo ElevenLabs voice only for text the
 * server already holds — either a streaming speech draft written by `/api/chat`
 * or a persisted assistant message. The client sends a permit id; the bound
 * text is what gets spoken.
 *
 * `source: "ryo-chat"` remains the first (spoofable) gate. Permits are the
 * non-spoofable layer on top.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { cleanTextForSpeech } from "../../src/apps/chats/utils/textForSpeech.js";
import { RYO_CHAT_SPEECH_SOURCE } from "./speech-policy.js";

export const SPEECH_DRAFT_TTL_SECONDS = 10 * 60;
export const SPEECH_PERMIT_TTL_SECONDS = 5 * 60;
export const SPEECH_PERMIT_MAX_USES = 2;
export const SPEECH_PERMIT_TEXT_MAX_LENGTH = 128_000;
export const SPEECH_PERMIT_MESSAGE_ID_MAX_LENGTH = 160;

export const SPEECH_PERMIT_ERRORS = {
  forbiddenSource: "ryo_voice_forbidden",
  required: "speech_permit_required",
  invalid: "speech_permit_invalid",
  expired: "speech_permit_expired",
  exhausted: "speech_permit_exhausted",
  ownerMismatch: "speech_permit_owner_mismatch",
  textMismatch: "speech_permit_text_mismatch",
  hashMismatch: "speech_permit_hash_mismatch",
  sourceNotFound: "speech_source_not_found",
  textNotBound: "speech_text_not_bound",
} as const;

export type SpeechPermitError =
  (typeof SPEECH_PERMIT_ERRORS)[keyof typeof SPEECH_PERMIT_ERRORS];

export interface SpeechDraftRecord {
  owner: string;
  messageId: string;
  text: string;
  updatedAt: number;
}

export interface SpeechPermitRecord {
  owner: string;
  messageId: string;
  text: string;
  contentHash: string;
  usesRemaining: number;
  createdAt: number;
  expiresAt: number;
}

export function resolveSpeechOwner(input: {
  username?: string | null;
  ip: string;
}): string {
  const username = input.username?.trim().toLowerCase();
  if (username) return `user:${username}`;
  return `anon:${input.ip}`;
}

export function speechOwnerUsername(owner: string): string | null {
  return owner.startsWith("user:") ? owner.slice("user:".length) : null;
}

export function normalizeSpeakableText(text: string): string {
  return cleanTextForSpeech(text);
}

export function hashSpeechText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function speechHashesEqual(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * True when `requestedText` is a speakable slice of server-held assistant
 * text. Cleaning runs on both sides so markdown/URL stripping matches the
 * chat TTS queue. Raw inclusion covers streaming slices that have not been
 * cleaned yet.
 */
export function isBoundSpeechChunk(
  sourceText: string,
  requestedText: string
): boolean {
  const chunk = normalizeSpeakableText(requestedText);
  if (!chunk) return false;
  if (normalizeSpeakableText(sourceText).includes(chunk)) return true;
  const rawChunk = requestedText.trim();
  return rawChunk.length > 0 && sourceText.includes(rawChunk);
}

export function isRyoChatSpeechSource(source: string | null | undefined): boolean {
  return source === RYO_CHAT_SPEECH_SOURCE;
}

export function parseJsonRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export function parseSpeechDraftRecord(raw: unknown): SpeechDraftRecord | null {
  const value = parseJsonRecord(raw);
  if (!value) return null;
  const owner = typeof value.owner === "string" ? value.owner : "";
  const messageId = typeof value.messageId === "string" ? value.messageId : "";
  const text = typeof value.text === "string" ? value.text : "";
  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : 0;
  if (!owner || !messageId || !text) return null;
  return { owner, messageId, text, updatedAt };
}

export function parseSpeechPermitRecord(raw: unknown): SpeechPermitRecord | null {
  const value = parseJsonRecord(raw);
  if (!value) return null;
  const owner = typeof value.owner === "string" ? value.owner : "";
  const messageId = typeof value.messageId === "string" ? value.messageId : "";
  const text = typeof value.text === "string" ? value.text : "";
  const contentHash =
    typeof value.contentHash === "string" ? value.contentHash : "";
  const usesRemaining =
    typeof value.usesRemaining === "number" &&
    Number.isFinite(value.usesRemaining)
      ? value.usesRemaining
      : 0;
  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : 0;
  const expiresAt =
    typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
      ? value.expiresAt
      : 0;
  if (!owner || !messageId || !text || !contentHash) return null;
  return {
    owner,
    messageId,
    text,
    contentHash,
    usesRemaining,
    createdAt,
    expiresAt,
  };
}
