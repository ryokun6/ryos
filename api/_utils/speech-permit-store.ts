import { getAssistantVisibleText } from "../../src/apps/chats/utils/aiMessageText.js";
import {
  redisKeys,
  sha256RedisIdentifier,
} from "../../src/shared/redisKeys.js";
import { findAIConversationAssistantMessage } from "../ai/conversations/_helpers/store.js";
import type { RedisLike } from "./redis.js";
import {
  SPEECH_DRAFT_TTL_SECONDS,
  SPEECH_PERMIT_ERRORS,
  SPEECH_PERMIT_MAX_USES,
  SPEECH_PERMIT_TTL_SECONDS,
  hashSpeechText,
  isBoundSpeechChunk,
  isRyoChatSpeechSource,
  normalizeSpeakableText,
  parseSpeechDraftRecord,
  parseSpeechPermitRecord,
  speechHashesEqual,
  speechOwnerUsername,
  type SpeechDraftRecord,
  type SpeechPermitError,
  type SpeechPermitRecord,
} from "./speech-permit.js";

export type SpeechPermitRedis = Pick<
  RedisLike,
  "get" | "set" | "del"
>;

export type SpeechPermitFailure = {
  ok: false;
  status: number;
  error: SpeechPermitError;
  message: string;
};

export type MintSpeechPermitResult =
  | {
      ok: true;
      permitId: string;
      contentHash: string;
      expiresInSeconds: number;
      messageId: string;
    }
  | SpeechPermitFailure;

export type ConsumeSpeechPermitResult =
  | {
      ok: true;
      text: string;
      messageId: string;
      contentHash: string;
    }
  | SpeechPermitFailure;

async function speechDraftKey(
  owner: string,
  messageId: string
): Promise<string> {
  const ownerHash = await sha256RedisIdentifier(owner);
  return redisKeys.media.speechDraft(ownerHash, messageId);
}

export async function upsertSpeechDraft(input: {
  redis: SpeechPermitRedis;
  owner: string;
  messageId: string;
  text: string;
  now?: number;
}): Promise<SpeechDraftRecord | null> {
  const text = input.text;
  if (!input.owner || !input.messageId || !text.trim()) return null;
  const record: SpeechDraftRecord = {
    owner: input.owner,
    messageId: input.messageId,
    text,
    updatedAt: input.now ?? Date.now(),
  };
  await input.redis.set(await speechDraftKey(input.owner, input.messageId), record, {
    ex: SPEECH_DRAFT_TTL_SECONDS,
  });
  return record;
}

export async function getSpeechDraft(input: {
  redis: SpeechPermitRedis;
  owner: string;
  messageId: string;
}): Promise<SpeechDraftRecord | null> {
  const raw = await input.redis.get(
    await speechDraftKey(input.owner, input.messageId)
  );
  const record = parseSpeechDraftRecord(raw);
  if (!record || record.owner !== input.owner) return null;
  return record;
}

export async function writeSpeechDraftFromTextStream(input: {
  redis: SpeechPermitRedis;
  owner: string;
  messageId: string;
  textStream: AsyncIterable<string>;
}): Promise<void> {
  let accumulated = "";
  let lastWriteAt = 0;
  for await (const chunk of input.textStream) {
    if (!chunk) continue;
    accumulated += chunk;
    const now = Date.now();
    if (lastWriteAt === 0 || now - lastWriteAt >= 80) {
      await upsertSpeechDraft({
        redis: input.redis,
        owner: input.owner,
        messageId: input.messageId,
        text: accumulated,
        now,
      });
      lastWriteAt = now;
    }
  }
  if (accumulated.trim()) {
    await upsertSpeechDraft({
      redis: input.redis,
      owner: input.owner,
      messageId: input.messageId,
      text: accumulated,
    });
  }
}

async function collectSpeakableSources(input: {
  redis: SpeechPermitRedis;
  owner: string;
  messageId: string;
}): Promise<string[]> {
  const sources: string[] = [];
  const draft = await getSpeechDraft(input);
  if (draft?.text) sources.push(draft.text);

  const username = speechOwnerUsername(input.owner);
  if (username) {
    const stored = await findAIConversationAssistantMessage({
      redis: input.redis,
      username,
      messageId: input.messageId,
    });
    if (stored) {
      const visible = getAssistantVisibleText(stored);
      if (visible) sources.push(visible);
    }
  }
  return sources;
}

function failure(
  status: number,
  error: SpeechPermitError,
  message: string
): SpeechPermitFailure {
  return { ok: false, status, error, message };
}

export async function mintSpeechPermit(input: {
  redis: SpeechPermitRedis;
  owner: string;
  messageId: string;
  text: string;
  source?: string | null;
  contentHash?: string | null;
  now?: number;
}): Promise<MintSpeechPermitResult> {
  if (!isRyoChatSpeechSource(input.source)) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.forbiddenSource,
      "Speech permits are limited to Ryo chat."
    );
  }

  const boundText = normalizeSpeakableText(input.text);
  if (!boundText) {
    return failure(
      400,
      SPEECH_PERMIT_ERRORS.textNotBound,
      "Requested speech text is empty after cleaning."
    );
  }

  const expectedHash = hashSpeechText(boundText);
  if (input.contentHash && !speechHashesEqual(input.contentHash, expectedHash)) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.hashMismatch,
      "Requested content hash does not match the cleaned speech text."
    );
  }

  const sources = await collectSpeakableSources({
    redis: input.redis,
    owner: input.owner,
    messageId: input.messageId,
  });
  if (sources.length === 0) {
    return failure(
      404,
      SPEECH_PERMIT_ERRORS.sourceNotFound,
      "No server-held Ryo assistant text for this message."
    );
  }
  if (!sources.some((source) => isBoundSpeechChunk(source, input.text))) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.textNotBound,
      "Requested text is not part of the stored Ryo assistant message."
    );
  }

  const now = input.now ?? Date.now();
  const permitId = crypto.randomUUID();
  const record: SpeechPermitRecord = {
    owner: input.owner,
    messageId: input.messageId,
    text: boundText,
    contentHash: expectedHash,
    usesRemaining: SPEECH_PERMIT_MAX_USES,
    createdAt: now,
    expiresAt: now + SPEECH_PERMIT_TTL_SECONDS * 1000,
  };
  await input.redis.set(redisKeys.media.speechPermit(permitId), record, {
    ex: SPEECH_PERMIT_TTL_SECONDS,
  });

  return {
    ok: true,
    permitId,
    contentHash: expectedHash,
    expiresInSeconds: SPEECH_PERMIT_TTL_SECONDS,
    messageId: input.messageId,
  };
}

export async function consumeSpeechPermit(input: {
  redis: SpeechPermitRedis;
  owner: string;
  permitId: string;
  text?: string | null;
  contentHash?: string | null;
  now?: number;
}): Promise<ConsumeSpeechPermitResult> {
  const permitId = input.permitId.trim();
  if (!permitId) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.required,
      "A speech permit is required for Ryo ElevenLabs voices."
    );
  }

  const key = redisKeys.media.speechPermit(permitId);
  const record = parseSpeechPermitRecord(await input.redis.get(key));
  if (!record) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.invalid,
      "Speech permit is missing or invalid."
    );
  }

  const now = input.now ?? Date.now();
  if (record.expiresAt <= now) {
    await input.redis.del(key);
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.expired,
      "Speech permit has expired."
    );
  }

  if (record.owner !== input.owner) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.ownerMismatch,
      "Speech permit belongs to a different auth context."
    );
  }

  if (record.usesRemaining <= 0) {
    await input.redis.del(key);
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.exhausted,
      "Speech permit has no remaining uses."
    );
  }

  if (
    input.contentHash &&
    !speechHashesEqual(input.contentHash, record.contentHash)
  ) {
    return failure(
      403,
      SPEECH_PERMIT_ERRORS.hashMismatch,
      "Requested content hash does not match the permit."
    );
  }

  if (input.text != null && input.text.trim().length > 0) {
    const clientText = normalizeSpeakableText(input.text);
    if (clientText !== record.text) {
      return failure(
        403,
        SPEECH_PERMIT_ERRORS.textMismatch,
        "Client text does not match the permit-bound assistant text."
      );
    }
  }

  const usesRemaining = record.usesRemaining - 1;
  if (usesRemaining <= 0) {
    await input.redis.del(key);
  } else {
    const ttlSeconds = Math.max(
      1,
      Math.ceil((record.expiresAt - now) / 1000)
    );
    await input.redis.set(
      key,
      { ...record, usesRemaining },
      { ex: ttlSeconds }
    );
  }

  return {
    ok: true,
    text: record.text,
    messageId: record.messageId,
    contentHash: record.contentHash,
  };
}

export async function putSpeechPermitRecord(input: {
  redis: SpeechPermitRedis;
  permitId: string;
  record: SpeechPermitRecord;
  ttlSeconds?: number;
}): Promise<void> {
  await input.redis.set(redisKeys.media.speechPermit(input.permitId), input.record, {
    ex: input.ttlSeconds ?? SPEECH_PERMIT_TTL_SECONDS,
  });
}
