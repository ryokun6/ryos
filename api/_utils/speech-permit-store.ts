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
  parseJsonRecord,
  parseSpeechDraftRecord,
  speechHashesEqual,
  speechOwnerUsername,
  type SpeechDraftRecord,
  type SpeechPermitError,
  type SpeechPermitRecord,
} from "./speech-permit.js";

export type SpeechPermitRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "eval"
>;

/**
 * Atomic consume: re-check owner / expiry / uses / optional hash+text, then
 * decrement. Parallel /api/speech calls cannot both observe the same
 * usesRemaining and both succeed.
 */
export const CONSUME_SPEECH_PERMIT_SCRIPT = `-- ryos:speech-permit-consume-v1
local raw = redis.call("GET", KEYS[1])
if not raw then
  return cjson.encode({ok=false, error="speech_permit_invalid"})
end
local decoded = cjson.decode(raw)
if type(decoded) ~= "table" then
  return cjson.encode({ok=false, error="speech_permit_invalid"})
end
local expiresAt = tonumber(decoded.expiresAt) or 0
local now = tonumber(ARGV[2]) or 0
if expiresAt <= now then
  redis.call("DEL", KEYS[1])
  return cjson.encode({ok=false, error="speech_permit_expired"})
end
if decoded.owner ~= ARGV[1] then
  return cjson.encode({ok=false, error="speech_permit_owner_mismatch"})
end
local uses = tonumber(decoded.usesRemaining) or 0
if uses <= 0 then
  return cjson.encode({ok=false, error="speech_permit_exhausted"})
end
if ARGV[3] ~= "" and decoded.contentHash ~= ARGV[3] then
  return cjson.encode({ok=false, error="speech_permit_hash_mismatch"})
end
if ARGV[4] ~= "" and decoded.text ~= ARGV[4] then
  return cjson.encode({ok=false, error="speech_permit_text_mismatch"})
end
uses = uses - 1
decoded.usesRemaining = uses
local ttl = math.max(1, math.ceil((expiresAt - now) / 1000))
redis.call("SET", KEYS[1], cjson.encode(decoded), "EX", ttl)
return cjson.encode({
  ok=true,
  text=decoded.text,
  messageId=decoded.messageId,
  contentHash=decoded.contentHash
})
`;

const CONSUME_ERROR_MESSAGES: Record<SpeechPermitError, string> = {
  [SPEECH_PERMIT_ERRORS.forbiddenSource]: "Speech permits are limited to Ryo chat.",
  [SPEECH_PERMIT_ERRORS.required]:
    "A speech permit is required for Ryo ElevenLabs voices.",
  [SPEECH_PERMIT_ERRORS.invalid]: "Speech permit is missing or invalid.",
  [SPEECH_PERMIT_ERRORS.expired]: "Speech permit has expired.",
  [SPEECH_PERMIT_ERRORS.exhausted]: "Speech permit has no remaining uses.",
  [SPEECH_PERMIT_ERRORS.ownerMismatch]:
    "Speech permit belongs to a different auth context.",
  [SPEECH_PERMIT_ERRORS.textMismatch]:
    "Client text does not match the permit-bound assistant text.",
  [SPEECH_PERMIT_ERRORS.hashMismatch]:
    "Requested content hash does not match the permit.",
  [SPEECH_PERMIT_ERRORS.sourceNotFound]:
    "No server-held Ryo assistant text for this message.",
  [SPEECH_PERMIT_ERRORS.textNotBound]:
    "Requested text is not part of the stored Ryo assistant message.",
};

function consumeFailure(error: SpeechPermitError): SpeechPermitFailure {
  const status = error === SPEECH_PERMIT_ERRORS.sourceNotFound ? 404 : 403;
  return failure(status, error, CONSUME_ERROR_MESSAGES[error]);
}

function parseConsumeScriptResult(
  raw: unknown
): ConsumeSpeechPermitResult {
  const value =
    typeof raw === "string"
      ? parseJsonRecord(raw)
      : raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
  if (!value) {
    return consumeFailure(SPEECH_PERMIT_ERRORS.invalid);
  }
  if (value.ok === true) {
    const text = typeof value.text === "string" ? value.text : "";
    const messageId = typeof value.messageId === "string" ? value.messageId : "";
    const contentHash =
      typeof value.contentHash === "string" ? value.contentHash : "";
    if (!text || !messageId || !contentHash) {
      return consumeFailure(SPEECH_PERMIT_ERRORS.invalid);
    }
    return { ok: true, text, messageId, contentHash };
  }
  const error =
    typeof value.error === "string" &&
    (Object.values(SPEECH_PERMIT_ERRORS) as string[]).includes(value.error)
      ? (value.error as SpeechPermitError)
      : SPEECH_PERMIT_ERRORS.invalid;
  return consumeFailure(error);
}

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
  const cleanedClientText =
    input.text != null && input.text.trim().length > 0
      ? normalizeSpeakableText(input.text)
      : "";
  const contentHash = input.contentHash?.trim().toLowerCase() ?? "";

  // Hash/text mismatch must not consume a use. Check them in the same
  // atomic script as the decrement so parallel requests cannot over-use.
  const raw = await input.redis.eval<unknown>(
    CONSUME_SPEECH_PERMIT_SCRIPT,
    [key],
    [
      input.owner,
      input.now ?? Date.now(),
      contentHash,
      cleanedClientText,
    ]
  );
  return parseConsumeScriptResult(raw);
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
