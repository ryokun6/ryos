import { z } from "zod";
import type { RedisLike } from "../../../_utils/redis.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";
import {
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPart,
  type AIConversationPage,
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
} from "../../../../src/shared/contracts/aiConversation.js";
import {
  getAIAttachmentUrl,
  parseAIAttachmentUrl,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { ASSISTANT_SUMMON_MESSAGE } from "../../../../src/shared/assistantGreeting.js";

const CONVERSATION_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 60;
const LOCK_ATTEMPTS = 40;
const LOCK_RETRY_MS = 25;
const MAX_MESSAGES = 200;
const MAX_CONVERSATION_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 768 * 1024;
const MAX_MESSAGE_TEXT_LENGTH = 128_000;
const MAX_PARTS_PER_MESSAGE = 48;
const MAX_RECENT_OPERATIONS = 48;
const MAX_MESSAGE_ID_LENGTH = 160;
const PENDING_TURN_TTL_MS = 2 * 60 * 1000;

const storedPartSchema = z.custom<AIConversationPart>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, "type") === "string"
);

const storedMessageSchema = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  seq: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(storedPartSchema),
  createdAt: z.string(),
});

const storedConversationSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  channel: z.enum(["chat", "assistant"]),
  revision: z.number().int().nonnegative(),
  nextSeq: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  historyTruncated: z.boolean(),
  legacyImportAllowed: z.boolean(),
  messages: z.array(storedMessageSchema),
  recentOperationIds: z.array(z.string()),
  lastResetOperationId: z.string().nullable(),
  pendingTurnId: z.string().nullable(),
  pendingTurnStartedAt: z.number().int().nonnegative().nullable(),
});

type StoredConversation = z.infer<typeof storedConversationSchema>;
export type AIConversationRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "expire" | "eval"
>;

export type AIConversationErrorCode =
  | "conversation_busy"
  | "conversation_changed"
  | "revision_conflict"
  | "message_id_conflict"
  | "conversation_not_empty"
  | "message_too_large"
  | "invalid_cursor"
  | "conversation_corrupt"
  | "account_deleted";

export class AIConversationError extends Error {
  constructor(
    readonly code: AIConversationErrorCode,
    readonly status: 409 | 422 | 503,
    message: string
  ) {
    super(message);
    this.name = "AIConversationError";
  }
}

interface WriteAIConversationMessagesInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  messages: readonly unknown[];
  operationId: string;
  expectedConversationId?: string;
  expectedRevision?: number;
  requireEmpty?: boolean;
  turn?: {
    id: string;
    action: "begin" | "complete";
  };
}

interface ConversationWriteContext {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  operationId: string;
  expectedConversationId?: string;
  expectedRevision?: number;
}

export interface BeginAIConversationTurnInput extends ConversationWriteContext {
  turnId: string;
  action:
    | { kind: "user-message"; message: unknown }
    | { kind: "assistant-continuation"; message: unknown }
    | { kind: "regenerate" };
}

export interface CompleteAIConversationTurnInput
  extends ConversationWriteContext {
  turnId: string;
  responseMessage: unknown;
}

export interface ImportAIConversationMessagesInput
  extends ConversationWriteContext {
  messages: readonly unknown[];
}

export interface ResetAIConversationInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  conversationId: string;
  operationId: string;
}

export interface RegenerateAIConversationInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  operationId: string;
  expectedConversationId?: string;
  expectedRevision?: number;
  targetMessageId?: string;
}

export interface CommitAIConversationRegenerationInput
  extends RegenerateAIConversationInput {
  responseMessage: unknown;
  turnId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function getMessageTimestamp(message: Record<string, unknown>): string {
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return (
    parseTimestamp(metadata?.createdAt) ??
    parseTimestamp(message.createdAt) ??
    parseTimestamp(message.timestamp) ??
    new Date().toISOString()
  );
}

function normalizeText(text: string): string {
  return text
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n");
}

function jsonByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? Number.POSITIVE_INFINITY
      : Buffer.byteLength(serialized, "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function clonePart(value: unknown): AIConversationPart | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const type = value.type;
  const allowed =
    type === "text" ||
    type === "reasoning" ||
    type === "file" ||
    type === "source-url" ||
    type === "source-document" ||
    type === "step-start" ||
    type === "dynamic-tool" ||
    type.startsWith("tool-") ||
    type.startsWith("data-");
  if (!allowed) return null;

  let cloned: unknown;
  try {
    cloned = JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
  const parsed = storedPartSchema.safeParse(cloned);
  if (!parsed.success) return null;

  if (type === "text" || type === "reasoning") {
    if (typeof Reflect.get(parsed.data, "text") !== "string") return null;
    return {
      ...parsed.data,
      text: normalizeText(Reflect.get(parsed.data, "text")),
    } as AIConversationPart;
  }

  if (type === "file") {
    const url = Reflect.get(parsed.data, "url");
    const mediaType = Reflect.get(parsed.data, "mediaType");
    const attachment = parseAIAttachmentUrl(url);
    if (!attachment || attachment.mediaType !== mediaType) return null;
    return {
      ...parsed.data,
      url: getAIAttachmentUrl(attachment.name),
    } as AIConversationPart;
  }
  return parsed.data;
}

function getPartsText(parts: readonly AIConversationPart[]): string {
  return parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : []
    )
    .join("\n");
}

function isSyntheticMessage(
  id: string,
  role: "user" | "assistant",
  text: string
) {
  if (role === "user" && text === ASSISTANT_SUMMON_MESSAGE) return true;
  if (role !== "assistant") return false;
  return id === "1" || id.startsWith("assistant-local-greeting-");
}

function throwMessageTooLarge(): never {
  throw new AIConversationError(
    "message_too_large",
    422,
    "Conversation message exceeds its storage limit"
  );
}

export function sanitizeAIConversationMessages(
  messages: readonly unknown[]
): Omit<AIConversationMessage, "seq">[] {
  const sanitized: Omit<AIConversationMessage, "seq">[] = [];

  for (const candidate of messages) {
    if (!isRecord(candidate)) continue;
    if (candidate.role !== "user" && candidate.role !== "assistant") continue;

    const role = candidate.role;
    const rawParts = Array.isArray(candidate.parts)
      ? candidate.parts
      : typeof candidate.content === "string"
        ? [{ type: "text", text: candidate.content }]
        : [];
    if (
      rawParts.length > MAX_PARTS_PER_MESSAGE ||
      jsonByteLength(rawParts) > MAX_MESSAGE_BYTES
    ) {
      throwMessageTooLarge();
    }
    const parts = rawParts
      .map(clonePart)
      .filter((part): part is AIConversationPart => part !== null);
    if (parts.length === 0) continue;
    const text = getPartsText(parts);
    if ([...text].length > MAX_MESSAGE_TEXT_LENGTH) throwMessageTooLarge();

    const candidateId = getString(candidate.id)?.trim();
    const id =
      candidateId && candidateId.length <= MAX_MESSAGE_ID_LENGTH
        ? candidateId
        : crypto.randomUUID();
    if (isSyntheticMessage(id, role, text)) continue;

    sanitized.push({
      id,
      role,
      parts,
      createdAt: getMessageTimestamp(candidate),
    });
  }

  return sanitized;
}

function createConversation(channel: AIConversationChannel): StoredConversation {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    channel,
    revision: 0,
    nextSeq: 1,
    createdAt: now,
    updatedAt: now,
    historyTruncated: false,
    legacyImportAllowed: true,
    messages: [],
    recentOperationIds: [],
    lastResetOperationId: null,
    pendingTurnId: null,
    pendingTurnStartedAt: null,
  };
}

function parseStoredConversation(
  raw: unknown,
  channel: AIConversationChannel
): StoredConversation | null {
  if (raw === null || raw === undefined) return null;

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AIConversationError(
        "conversation_corrupt",
        503,
        "Stored conversation is invalid"
      );
    }
  }

  const parsed = storedConversationSchema.safeParse(value);
  if (!parsed.success || parsed.data.channel !== channel) {
    throw new AIConversationError(
      "conversation_corrupt",
      503,
      "Stored conversation is invalid"
    );
  }
  return parsed.data;
}

function summarizeConversation(document: StoredConversation): AIConversation {
  const oldest = document.messages[0]?.seq ?? null;
  const newest = document.messages.at(-1)?.seq ?? null;
  return {
    id: document.id,
    channel: document.channel,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    messageCount: document.messages.length,
    oldestSeq: oldest,
    newestSeq: newest,
    historyTruncated: document.historyTruncated,
    canImportLegacy: document.legacyImportAllowed,
  };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const SAVE_CONVERSATION_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -2
end
redis.call("SET", KEYS[3], ARGV[2], "EX", ARGV[3])
return 1
`;

async function withConversationLock<T>({
  redis,
  username,
  channel,
  task,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  task: (lockToken: string) => Promise<T>;
}): Promise<T> {
  const key = redisKeys.chat.aiConversationLock(username, channel);
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const claimed = await redis.set(key, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (claimed !== null && claimed !== undefined) {
      try {
        const tombstone = await redis.get(
          redisKeys.chat.aiConversationTombstone(username)
        );
        if (tombstone !== null) {
          throw new AIConversationError(
            "account_deleted",
            409,
            "Account was deleted"
          );
        }
        return await task(token);
      } finally {
        await redis
          .eval<number>(RELEASE_LOCK_SCRIPT, [key], [token])
          .catch(() => 0);
      }
    }
    await sleep(LOCK_RETRY_MS);
  }

  throw new AIConversationError(
    "conversation_busy",
    503,
    "Conversation is busy"
  );
}

async function readConversation(
  redis: AIConversationRedis,
  username: string,
  channel: AIConversationChannel
): Promise<StoredConversation | null> {
  const raw = await redis.get(
    redisKeys.chat.aiConversation(username, channel)
  );
  return parseStoredConversation(raw, channel);
}

async function saveConversation(
  redis: AIConversationRedis,
  username: string,
  document: StoredConversation,
  lockToken: string
): Promise<void> {
  const result = await redis.eval<number>(
    SAVE_CONVERSATION_SCRIPT,
    [
      redisKeys.chat.aiConversationLock(username, document.channel),
      redisKeys.chat.aiConversationTombstone(username),
      redisKeys.chat.aiConversation(username, document.channel),
    ],
    [lockToken, JSON.stringify(document), CONVERSATION_TTL_SECONDS]
  );
  if (result === -2) {
    throw new AIConversationError(
      "account_deleted",
      409,
      "Account was deleted"
    );
  }
  if (result !== 1) {
    throw new AIConversationError(
      "conversation_busy",
      503,
      "Conversation lock expired"
    );
  }
}

export async function getOrCreateAIConversation({
  redis,
  username,
  channel,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
}): Promise<StoredConversation> {
  const existing = await readConversation(redis, username, channel);
  if (existing) {
    void redis
      .expire(
        redisKeys.chat.aiConversation(username, channel),
        CONVERSATION_TTL_SECONDS
      )
      .catch(() => 0);
    return existing;
  }

  return withConversationLock({
    redis,
    username,
    channel,
    task: async (lockToken) => {
      const raced = await readConversation(redis, username, channel);
      if (raced) return raced;
      const created = createConversation(channel);
      await saveConversation(redis, username, created, lockToken);
      return created;
    },
  });
}

function appendOperation(
  document: StoredConversation,
  operationId: string
): void {
  document.recentOperationIds = [
    ...document.recentOperationIds.filter((id) => id !== operationId),
    operationId,
  ].slice(-MAX_RECENT_OPERATIONS);
}

function trimConversation(document: StoredConversation): void {
  let totalBytes = document.messages.reduce(
    (total, message) => total + jsonByteLength(message.parts),
    0
  );
  let removed = false;

  while (
    document.messages.length > MAX_MESSAGES ||
    (totalBytes > MAX_CONVERSATION_BYTES && document.messages.length > 1)
  ) {
    const oldest = document.messages.shift();
    if (!oldest) break;
    totalBytes -= jsonByteLength(oldest.parts);
    removed = true;
  }

  if (removed) document.historyTruncated = true;
}

function sameMessageContent(
  existing: AIConversationMessage,
  incoming: Omit<AIConversationMessage, "seq">
): boolean {
  return (
    existing.role === incoming.role &&
    JSON.stringify(existing.parts) === JSON.stringify(incoming.parts)
  );
}

function mergeConversationMessages(
  document: StoredConversation,
  messages: readonly unknown[]
): boolean {
  const incomingMessages = sanitizeAIConversationMessages(messages);
  const byId = new Map(
    document.messages.map((message) => [message.id, message])
  );
  let changed = false;

  for (const incoming of incomingMessages) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      const stored: AIConversationMessage = {
        ...incoming,
        seq: document.nextSeq,
      };
      document.nextSeq += 1;
      document.messages.push(stored);
      byId.set(stored.id, stored);
      changed = true;
      continue;
    }

    if (sameMessageContent(existing, incoming)) continue;
    if (existing.role !== "assistant" || incoming.role !== "assistant") {
      throw new AIConversationError(
        "message_id_conflict",
        409,
        "Message id was reused with different content"
      );
    }

    existing.parts = incoming.parts;
    changed = true;
  }

  document.messages.sort((left, right) => left.seq - right.seq);
  trimConversation(document);
  return changed;
}

function assertMessageRole(
  message: unknown,
  expectedRole: "user" | "assistant"
): void {
  if (!isRecord(message) || message.role !== expectedRole) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      `Conversation action requires a ${expectedRole} message`
    );
  }
}

async function writeAIConversationMessages(
  input: WriteAIConversationMessagesInput
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  if (
    !input.operationId.trim() ||
    input.operationId.length > AI_CONVERSATION_OPERATION_ID_MAX_LENGTH
  ) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Invalid operation id"
    );
  }

  return withConversationLock({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    task: async (lockToken) => {
      const document =
        (await readConversation(input.redis, input.username, input.channel)) ??
        createConversation(input.channel);

      if (document.recentOperationIds.includes(input.operationId)) {
        return { document, operationApplied: false };
      }
      if (
        input.expectedConversationId &&
        input.expectedConversationId !== document.id
      ) {
        throw new AIConversationError(
          "conversation_changed",
          409,
          "Conversation changed"
        );
      }
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== document.revision
      ) {
        throw new AIConversationError(
          "revision_conflict",
          409,
          "Conversation revision changed"
        );
      }
      if (input.requireEmpty && document.messages.length > 0) {
        throw new AIConversationError(
          "conversation_not_empty",
          409,
          "Conversation already has messages"
        );
      }
      if (input.requireEmpty && !document.legacyImportAllowed) {
        throw new AIConversationError(
          "conversation_not_empty",
          409,
          "Legacy import is no longer allowed"
        );
      }

      if (input.turn) {
        const pendingIsStale =
          document.pendingTurnStartedAt !== null &&
          Date.now() - document.pendingTurnStartedAt > PENDING_TURN_TTL_MS;
        if (input.turn.action === "begin") {
          if (
            document.pendingTurnId &&
            document.pendingTurnId !== input.turn.id &&
            !pendingIsStale
          ) {
            throw new AIConversationError(
              "conversation_busy",
              409,
              "Another conversation turn is still running"
            );
          }
          document.pendingTurnId = input.turn.id;
          document.pendingTurnStartedAt = Date.now();
        } else if (document.pendingTurnId !== input.turn.id) {
          throw new AIConversationError(
            "revision_conflict",
            409,
            "Conversation turn is no longer active"
          );
        }
      }

      const changed = mergeConversationMessages(document, input.messages);
      if (input.turn?.action === "complete") {
        document.pendingTurnId = null;
        document.pendingTurnStartedAt = null;
      }
      appendOperation(document, input.operationId);
      document.legacyImportAllowed = false;
      if (changed) {
        document.revision += 1;
        document.updatedAt = new Date().toISOString();
      }
      await saveConversation(
        input.redis,
        input.username,
        document,
        lockToken
      );
      return { document, operationApplied: true };
    },
  });
}

export async function beginAIConversationTurn(
  input: BeginAIConversationTurnInput
): Promise<StoredConversation> {
  return (await beginAIConversationTurnWithStatus(input)).document;
}

export async function beginAIConversationTurnWithStatus(
  input: BeginAIConversationTurnInput
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  let messages: readonly unknown[] = [];
  if (input.action.kind === "user-message") {
    assertMessageRole(input.action.message, "user");
    messages = [input.action.message];
  } else if (input.action.kind === "assistant-continuation") {
    assertMessageRole(input.action.message, "assistant");
    messages = [input.action.message];
  }

  return writeAIConversationMessages({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    operationId: input.operationId,
    messages,
    turn: { id: input.turnId, action: "begin" },
    ...(input.expectedConversationId
      ? { expectedConversationId: input.expectedConversationId }
      : {}),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
  });
}

export async function completeAIConversationTurn(
  input: CompleteAIConversationTurnInput
): Promise<StoredConversation> {
  assertMessageRole(input.responseMessage, "assistant");
  return (
    await writeAIConversationMessages({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    operationId: input.operationId,
    messages: [input.responseMessage],
    turn: { id: input.turnId, action: "complete" },
    ...(input.expectedConversationId
      ? { expectedConversationId: input.expectedConversationId }
      : {}),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
    })
  ).document;
}

export async function importAIConversationMessages(
  input: ImportAIConversationMessagesInput
): Promise<StoredConversation> {
  return (
    await writeAIConversationMessages({
      ...input,
      requireEmpty: true,
    })
  ).document;
}

export async function releaseAIConversationTurn({
  redis,
  username,
  channel,
  turnId,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  turnId: string;
}): Promise<void> {
  await withConversationLock({
    redis,
    username,
    channel,
    task: async (lockToken) => {
      const document = await readConversation(redis, username, channel);
      if (!document || document.pendingTurnId !== turnId) return;
      document.pendingTurnId = null;
      document.pendingTurnStartedAt = null;
      await saveConversation(redis, username, document, lockToken);
    },
  });
}

export async function resetAIConversation(
  input: ResetAIConversationInput
): Promise<{
  document: StoredConversation;
  reset: boolean;
  clearedMessages: AIConversationMessage[];
}> {
  return withConversationLock({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    task: async (lockToken) => {
      const current =
        (await readConversation(input.redis, input.username, input.channel)) ??
        createConversation(input.channel);

      if (current.lastResetOperationId === input.operationId) {
        return { document: current, reset: false, clearedMessages: [] };
      }
      if (current.id !== input.conversationId) {
        throw new AIConversationError(
          "conversation_changed",
          409,
          "Conversation changed"
        );
      }

      const replacement = createConversation(input.channel);
      replacement.legacyImportAllowed = false;
      replacement.lastResetOperationId = input.operationId;
      replacement.recentOperationIds = [input.operationId];
      const clearedMessages = current.messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) => ({ ...part })),
      }));
      await saveConversation(
        input.redis,
        input.username,
        replacement,
        lockToken
      );
      return { document: replacement, reset: true, clearedMessages };
    },
  });
}

export async function prepareAIConversationRegeneration(
  input: RegenerateAIConversationInput
): Promise<StoredConversation> {
  const document = await getOrCreateAIConversation(input);
  validateRegenerationTarget(document, input);
  return document;
}

function validateRegenerationTarget(
  document: StoredConversation,
  input: RegenerateAIConversationInput
): AIConversationMessage {
  if (
    input.expectedConversationId &&
    input.expectedConversationId !== document.id
  ) {
    throw new AIConversationError(
      "conversation_changed",
      409,
      "Conversation changed"
    );
  }
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== document.revision
  ) {
    throw new AIConversationError(
      "revision_conflict",
      409,
      "Conversation revision changed"
    );
  }
  const target = input.targetMessageId
    ? document.messages.find((message) => message.id === input.targetMessageId)
    : document.messages.findLast((message) => message.role === "assistant");
  if (!target) {
    throw new AIConversationError(
      "message_id_conflict",
      409,
      "Regeneration target was not found"
    );
  }
  return target;
}

export async function commitAIConversationRegeneration(
  input: CommitAIConversationRegenerationInput
): Promise<StoredConversation> {
  return withConversationLock({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    task: async (lockToken) => {
      const document =
        (await readConversation(input.redis, input.username, input.channel)) ??
        createConversation(input.channel);
      if (document.recentOperationIds.includes(input.operationId)) {
        return document;
      }
      if (document.pendingTurnId !== input.turnId) {
        throw new AIConversationError(
          "revision_conflict",
          409,
          "Conversation turn is no longer active"
        );
      }
      const target = validateRegenerationTarget(document, input);
      document.messages = document.messages.filter((message) =>
        target.role === "assistant"
          ? message.seq < target.seq
          : message.seq <= target.seq
      );
      assertMessageRole(input.responseMessage, "assistant");
      mergeConversationMessages(document, [input.responseMessage]);
      appendOperation(document, input.operationId);
      document.legacyImportAllowed = false;
      document.pendingTurnId = null;
      document.pendingTurnStartedAt = null;
      document.revision += 1;
      document.updatedAt = new Date().toISOString();
      await saveConversation(
        input.redis,
        input.username,
        document,
        lockToken
      );
      return document;
    },
  });
}

interface ConversationCursor {
  version: 1;
  conversationId: string;
  revision: number;
  beforeSeq: number;
}

function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): ConversationCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (
      !isRecord(decoded) ||
      decoded.version !== 1 ||
      typeof decoded.conversationId !== "string" ||
      typeof decoded.revision !== "number" ||
      !Number.isSafeInteger(decoded.revision) ||
      decoded.revision < 0 ||
      typeof decoded.beforeSeq !== "number" ||
      !Number.isSafeInteger(decoded.beforeSeq) ||
      decoded.beforeSeq < 1
    ) {
      throw new Error("invalid");
    }
    return {
      version: 1,
      conversationId: decoded.conversationId,
      revision: decoded.revision,
      beforeSeq: decoded.beforeSeq,
    };
  } catch {
    throw new AIConversationError("invalid_cursor", 422, "Invalid cursor");
  }
}

export async function getAIConversationPage({
  redis,
  username,
  channel,
  limit,
  cursor,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  limit: number;
  cursor?: string;
}): Promise<AIConversationPage> {
  const document = await getOrCreateAIConversation({
    redis,
    username,
    channel,
  });
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let beforeSeq = Number.POSITIVE_INFINITY;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (
      decoded.conversationId !== document.id ||
      decoded.revision !== document.revision
    ) {
      throw new AIConversationError(
        "conversation_changed",
        409,
        "Conversation changed"
      );
    }
    beforeSeq = decoded.beforeSeq;
  }

  const eligible = document.messages.filter(
    (message) => message.seq < beforeSeq
  );
  const messages = eligible.slice(-normalizedLimit);
  const hasMore = eligible.length > messages.length;
  const nextCursor =
    hasMore && messages[0]
      ? encodeCursor({
          version: 1,
          conversationId: document.id,
          revision: document.revision,
          beforeSeq: messages[0].seq,
        })
      : null;

  return {
    conversation: summarizeConversation(document),
    messages,
    page: { nextCursor, hasMore },
  };
}

export function getAIConversationSummary(
  document: StoredConversation
): AIConversation {
  return summarizeConversation(document);
}

export function getAIConversationModelMessages(
  document: StoredConversation
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
}> {
  return document.messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  }));
}

export function getAIConversationRegenerationModelMessages(
  document: StoredConversation,
  targetMessageId?: string
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
}> {
  const targetIndex = targetMessageId
    ? document.messages.findIndex((message) => message.id === targetMessageId)
    : document.messages.findLastIndex(
        (message) => message.role === "assistant"
      );
  if (targetIndex < 0) return [];
  const target = document.messages[targetIndex];
  const retained =
    target?.role === "assistant"
      ? document.messages.slice(0, targetIndex)
      : document.messages.slice(0, targetIndex + 1);
  return retained.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  }));
}

export async function deleteAIConversationKeys(
  redis: AIConversationRedis,
  username: string
): Promise<number> {
  await redis.set(redisKeys.chat.aiConversationTombstone(username), "1");
  return redis.del(
    redisKeys.chat.aiConversation(username, "chat"),
    redisKeys.chat.aiConversationLock(username, "chat"),
    redisKeys.chat.aiConversation(username, "assistant"),
    redisKeys.chat.aiConversationLock(username, "assistant")
  );
}

export async function clearAIConversationTombstone(
  redis: AIConversationRedis,
  username: string
): Promise<void> {
  await redis.del(redisKeys.chat.aiConversationTombstone(username));
}
