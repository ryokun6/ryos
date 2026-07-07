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
  AI_PROACTIVE_GREETING_STALE_AFTER_MS,
  isAIProactiveGreetingMessageId,
} from "../../../../src/shared/contracts/aiConversation.js";
import {
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
  parseAIAttachmentName,
  parseAIAttachmentUrl,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { ASSISTANT_SUMMON_MESSAGE } from "../../../../src/shared/assistantGreeting.js";
import {
  AIAttachmentReferenceError,
  collectAIAttachmentNamesFromMessages,
  withAIAttachmentReferenceLock,
} from "../../attachments/_helpers/store.js";

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
const RESET_MEMORY_PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_MEMORY_LOCK_TTL_SECONDS = 120;
const MAX_RESET_MEMORY_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const RESET_MEMORY_VALUE_PREFIX = "v1:";
const TURN_COMPLETION_OPERATION_SUFFIX = ":complete";

export function getAIConversationTurnCompletionOperationId(
  turnId: string,
): string {
  return `${turnId}${TURN_COMPLETION_OPERATION_SUFFIX}`;
}

const storedPartSchema = z.custom<AIConversationPart>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, "type") === "string",
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

const pendingResetMemoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

const pendingResetMemorySnapshotSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  channel: z.enum(["chat", "assistant"]),
  timeZone: z.string().max(100).nullable(),
  createdAt: z.string(),
  messages: z.array(pendingResetMemoryMessageSchema).max(MAX_MESSAGES),
  attachmentNames: z
    .array(z.string().refine((name) => parseAIAttachmentName(name) !== null))
    .max(512)
    .default([]),
});

type StoredConversation = z.infer<typeof storedConversationSchema>;
export type PendingAIConversationResetMemory = z.infer<
  typeof pendingResetMemorySnapshotSchema
>;
export type AIConversationRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "expire" | "eval" | "smembers" | "sadd" | "srem"
>;

export type AIConversationErrorCode =
  | "conversation_busy"
  | "conversation_changed"
  | "revision_conflict"
  | "message_id_conflict"
  | "conversation_not_empty"
  | "message_too_large"
  | "attachment_not_found"
  | "invalid_cursor"
  | "conversation_corrupt"
  | "account_deleted";

export class AIConversationError extends Error {
  constructor(
    readonly code: AIConversationErrorCode,
    readonly status: 409 | 422 | 503,
    message: string,
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
  requireAssistantContinuation?: boolean;
  /** Reject the write while another conversation turn is still pending. */
  requireNoPendingTurn?: boolean;
  /**
   * Keep `legacyImportAllowed` untouched. Used for proactive greetings so a
   * server-generated greeting on an otherwise-empty conversation does not
   * permanently block a legacy device from importing its local history.
   */
  preserveLegacyImport?: boolean;
  historyTruncated?: boolean;
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

export interface CompleteAIConversationTurnInput extends ConversationWriteContext {
  turnId: string;
  responseMessage: unknown;
}

export interface ImportAIConversationMessagesInput extends ConversationWriteContext {
  messages: readonly unknown[];
  historyTruncated?: boolean;
}

export interface AppendAIConversationAssistantMessageInput
  extends ConversationWriteContext {
  message: unknown;
}

export interface ResetAIConversationInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  conversationId: string;
  operationId: string;
  timeZone?: string;
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

export interface CommitAIConversationRegenerationInput extends RegenerateAIConversationInput {
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
  return text.replaceAll("\0", "").replace(/\r\n?/g, "\n");
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
    if (
      !attachment ||
      !isAIAttachmentMediaType(mediaType) ||
      (attachment.mediaType !== null && attachment.mediaType !== mediaType)
    ) {
      return null;
    }
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
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
}

function serializePendingResetMemory(
  snapshot: PendingAIConversationResetMemory,
): string {
  return `${RESET_MEMORY_VALUE_PREFIX}${JSON.stringify(snapshot)}`;
}

function parsePendingResetMemory(
  raw: unknown,
): PendingAIConversationResetMemory | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string" || !raw.startsWith(RESET_MEMORY_VALUE_PREFIX)) {
    throw new Error("Stored reset memory snapshot is invalid");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw.slice(RESET_MEMORY_VALUE_PREFIX.length));
  } catch {
    throw new Error("Stored reset memory snapshot is invalid");
  }
  const parsed = pendingResetMemorySnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Stored reset memory snapshot is invalid");
  }
  return parsed.data;
}

function removeOldestResetMemoryTurn(
  messages: PendingAIConversationResetMemory["messages"],
): void {
  const nextUserMessage = messages.findIndex(
    (message, index) => index > 0 && message.role === "user",
  );
  messages.splice(0, nextUserMessage > 0 ? nextUserMessage : 1);
}

function buildPendingResetMemory({
  current,
  existing,
  channel,
  timeZone,
}: {
  current: StoredConversation;
  existing: PendingAIConversationResetMemory | null;
  channel: AIConversationChannel;
  timeZone?: string;
}): PendingAIConversationResetMemory | null {
  const canRetainExisting = existing?.channel === channel;
  const retainedExistingMessages =
    canRetainExisting && existing ? existing.messages : [];
  const currentMessages = current.messages.map((message) => ({
    role: message.role,
    content: getPartsText(message.parts),
    createdAt: message.createdAt,
  }));
  const attachmentNames = [
    ...new Set([
      ...(canRetainExisting && existing ? existing.attachmentNames : []),
      ...collectAIAttachmentNamesFromMessages(current.messages),
    ]),
  ].slice(0, 512);
  const snapshot: PendingAIConversationResetMemory = {
    version: 1,
    id: canRetainExisting && existing ? existing.id : crypto.randomUUID(),
    channel,
    timeZone: timeZone?.trim().slice(0, 100) || null,
    createdAt:
      canRetainExisting && existing
        ? existing.createdAt
        : new Date().toISOString(),
    messages: [...retainedExistingMessages, ...currentMessages],
    attachmentNames,
  };

  while (
    snapshot.messages.length > MAX_MESSAGES ||
    (snapshot.messages.length > 1 &&
      Buffer.byteLength(serializePendingResetMemory(snapshot), "utf8") >
        MAX_RESET_MEMORY_SNAPSHOT_BYTES)
  ) {
    removeOldestResetMemoryTurn(snapshot.messages);
  }

  return snapshot.messages.some((message) => message.role === "user") ||
    snapshot.attachmentNames.length > 0
    ? snapshot
    : null;
}

function isSyntheticMessage(
  id: string,
  role: "user" | "assistant",
  text: string,
) {
  if (role === "user" && text === ASSISTANT_SUMMON_MESSAGE) return true;
  if (role !== "assistant") return false;
  return id === "1" || id.startsWith("assistant-local-greeting-");
}

function throwMessageTooLarge(): never {
  throw new AIConversationError(
    "message_too_large",
    422,
    "Conversation message exceeds its storage limit",
  );
}

export function sanitizeAIConversationMessages(
  messages: readonly unknown[],
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

function createConversation(
  channel: AIConversationChannel,
): StoredConversation {
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
  channel: AIConversationChannel,
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
        "Stored conversation is invalid",
      );
    }
  }

  if (isRecord(value) && value.version === 2) {
    value = { ...value, version: 1 };
  }
  const parsed = storedConversationSchema.safeParse(value);
  if (!parsed.success || parsed.data.channel !== channel) {
    throw new AIConversationError(
      "conversation_corrupt",
      503,
      "Stored conversation is invalid",
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

const SAVE_RESET_CONVERSATION_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -2
end
if ARGV[4] ~= "" then
  redis.call("SET", KEYS[4], ARGV[4], "EX", ARGV[5])
end
redis.call("SET", KEYS[3], ARGV[2], "EX", ARGV[3])
return 1
`;

const DELETE_IF_UNCHANGED_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
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
          redisKeys.chat.aiConversationTombstone(username),
        );
        if (tombstone !== null) {
          throw new AIConversationError(
            "account_deleted",
            409,
            "Account was deleted",
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
    "Conversation is busy",
  );
}

async function readConversation(
  redis: AIConversationRedis,
  username: string,
  channel: AIConversationChannel,
): Promise<StoredConversation | null> {
  const raw = await redis.get(redisKeys.chat.aiConversation(username, channel));
  return parseStoredConversation(raw, channel);
}

async function saveConversation(
  redis: AIConversationRedis,
  username: string,
  document: StoredConversation,
  lockToken: string,
): Promise<void> {
  const result = await redis.eval<number>(
    SAVE_CONVERSATION_SCRIPT,
    [
      redisKeys.chat.aiConversationLock(username, document.channel),
      redisKeys.chat.aiConversationTombstone(username),
      redisKeys.chat.aiConversation(username, document.channel),
    ],
    [lockToken, JSON.stringify(document), CONVERSATION_TTL_SECONDS],
  );
  if (result === -2) {
    throw new AIConversationError(
      "account_deleted",
      409,
      "Account was deleted",
    );
  }
  if (result !== 1) {
    throw new AIConversationError(
      "conversation_busy",
      503,
      "Conversation lock expired",
    );
  }
}

async function saveResetConversation({
  redis,
  username,
  document,
  lockToken,
  pendingResetMemory,
}: {
  redis: AIConversationRedis;
  username: string;
  document: StoredConversation;
  lockToken: string;
  pendingResetMemory: PendingAIConversationResetMemory | null;
}): Promise<void> {
  const result = await redis.eval<number>(
    SAVE_RESET_CONVERSATION_SCRIPT,
    [
      redisKeys.chat.aiConversationLock(username, document.channel),
      redisKeys.chat.aiConversationTombstone(username),
      redisKeys.chat.aiConversation(username, document.channel),
      redisKeys.chat.aiConversationResetMemory(username, document.channel),
    ],
    [
      lockToken,
      JSON.stringify(document),
      CONVERSATION_TTL_SECONDS,
      pendingResetMemory ? serializePendingResetMemory(pendingResetMemory) : "",
      RESET_MEMORY_PENDING_TTL_SECONDS,
    ],
  );
  if (result === -2) {
    throw new AIConversationError(
      "account_deleted",
      409,
      "Account was deleted",
    );
  }
  if (result !== 1) {
    throw new AIConversationError(
      "conversation_busy",
      503,
      "Conversation lock expired",
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
        CONVERSATION_TTL_SECONDS,
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
  operationId: string,
): void {
  document.recentOperationIds = [
    ...document.recentOperationIds.filter((id) => id !== operationId),
    operationId,
  ].slice(-MAX_RECENT_OPERATIONS);
}

function trimConversation(document: StoredConversation): void {
  let totalBytes = document.messages.reduce(
    (total, message) => total + jsonByteLength(message.parts),
    0,
  );
  let removed = false;

  while (
    document.messages.length > MAX_MESSAGES ||
    (totalBytes > MAX_CONVERSATION_BYTES && document.messages.length > 1)
  ) {
    const nextTurn = document.messages.findIndex(
      (message, index) => index > 0 && message.role === "user",
    );
    const removedMessages = document.messages.splice(
      0,
      nextTurn > 0 ? nextTurn : 1,
    );
    for (const message of removedMessages) {
      totalBytes -= jsonByteLength(message.parts);
    }
    removed = true;
  }

  if (removed) document.historyTruncated = true;
}

function sameMessageContent(
  existing: AIConversationMessage,
  incoming: Omit<AIConversationMessage, "seq">,
): boolean {
  return (
    existing.role === incoming.role &&
    JSON.stringify(existing.parts) === JSON.stringify(incoming.parts)
  );
}

const PENDING_CLIENT_TOOL_STATES = new Set([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
]);

function getClientToolPart(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const type = getString(value.type);
  if (
    (type !== "dynamic-tool" && !type?.startsWith("tool-")) ||
    typeof value.toolCallId !== "string" ||
    typeof value.state !== "string" ||
    value.providerExecuted === true
  ) {
    return null;
  }
  return value;
}

function isTerminalClientToolPart(part: Record<string, unknown>): boolean {
  if (part.state === "output-available") {
    return Object.hasOwn(part, "output");
  }
  if (part.state === "output-error") {
    return typeof part.errorText === "string";
  }
  if (part.state === "output-denied") {
    return isRecord(part.approval) && part.approval.approved === false;
  }
  return false;
}

function getClientToolIdentity(part: Record<string, unknown>): unknown {
  return {
    type: part.type,
    toolName: part.type === "dynamic-tool" ? part.toolName : undefined,
    toolCallId: part.toolCallId,
    input: part.input,
    providerExecuted: part.providerExecuted,
    title: part.title,
    toolMetadata: part.toolMetadata,
    callProviderMetadata: part.callProviderMetadata,
  };
}

function assertValidAssistantContinuation(
  document: StoredConversation,
  message: unknown,
): void {
  const [incoming] = sanitizeAIConversationMessages([message]);
  const latest = document.messages.at(-1);
  if (
    !incoming ||
    incoming.role !== "assistant" ||
    !latest ||
    latest.role !== "assistant" ||
    incoming.id !== latest.id ||
    incoming.parts.length !== latest.parts.length
  ) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Assistant continuation must update the latest stored assistant message",
    );
  }

  let advancedClientTool = false;
  for (let index = 0; index < latest.parts.length; index += 1) {
    const existingPart = latest.parts[index];
    const incomingPart = incoming.parts[index];
    if (JSON.stringify(existingPart) === JSON.stringify(incomingPart)) continue;

    const existingTool = getClientToolPart(existingPart);
    const incomingTool = getClientToolPart(incomingPart);
    const transitionIsValid =
      existingTool !== null &&
      incomingTool !== null &&
      PENDING_CLIENT_TOOL_STATES.has(String(existingTool.state)) &&
      isTerminalClientToolPart(incomingTool) &&
      incomingTool.preliminary !== true &&
      JSON.stringify(getClientToolIdentity(existingTool)) ===
        JSON.stringify(getClientToolIdentity(incomingTool));
    if (!transitionIsValid) {
      throw new AIConversationError(
        "message_id_conflict",
        422,
        "Assistant continuation may only complete pending client tool calls",
      );
    }
    advancedClientTool = true;
  }

  if (!advancedClientTool) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Assistant continuation must complete a pending client tool call",
    );
  }
}

function mergeConversationMessages(
  document: StoredConversation,
  messages: readonly unknown[],
): boolean {
  const incomingMessages = sanitizeAIConversationMessages(messages);
  const byId = new Map(
    document.messages.map((message) => [message.id, message]),
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
        "Message id was reused with different content",
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
  expectedRole: "user" | "assistant",
): void {
  if (!isRecord(message) || message.role !== expectedRole) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      `Conversation action requires a ${expectedRole} message`,
    );
  }
}

async function writeAIConversationMessages(
  input: WriteAIConversationMessagesInput,
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  const maxOperationIdLength =
    input.turn?.action === "complete" &&
    input.operationId ===
      getAIConversationTurnCompletionOperationId(input.turn.id)
      ? AI_CONVERSATION_OPERATION_ID_MAX_LENGTH +
        TURN_COMPLETION_OPERATION_SUFFIX.length
      : AI_CONVERSATION_OPERATION_ID_MAX_LENGTH;
  if (
    !input.operationId.trim() ||
    input.operationId.length > maxOperationIdLength
  ) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Invalid operation id",
    );
  }

  try {
    return await withAIAttachmentReferenceLock({
      redis: input.redis,
      username: input.username,
      messages: input.messages,
      task: () =>
        withConversationLock({
          redis: input.redis,
          username: input.username,
          channel: input.channel,
          task: async (lockToken) => {
            const document =
              (await readConversation(
                input.redis,
                input.username,
                input.channel,
              )) ?? createConversation(input.channel);

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
                "Conversation changed",
              );
            }
            if (
              input.expectedRevision !== undefined &&
              input.expectedRevision !== document.revision
            ) {
              throw new AIConversationError(
                "revision_conflict",
                409,
                "Conversation revision changed",
              );
            }
            // A legacy import may replace a conversation whose only content is
            // server-generated proactive greetings: the greeting is disposable
            // while the device-local history it would otherwise block is not.
            const existingAreOnlyProactiveGreetings =
              document.messages.length > 0 &&
              document.messages.every(
                (message) =>
                  message.role === "assistant" &&
                  isAIProactiveGreetingMessageId(message.id),
              );
            if (
              input.requireEmpty &&
              document.messages.length > 0 &&
              !existingAreOnlyProactiveGreetings
            ) {
              throw new AIConversationError(
                "conversation_not_empty",
                409,
                "Conversation already has messages",
              );
            }
            if (input.requireEmpty && !document.legacyImportAllowed) {
              throw new AIConversationError(
                "conversation_not_empty",
                409,
                "Legacy import is no longer allowed",
              );
            }
            if (input.requireAssistantContinuation) {
              assertValidAssistantContinuation(document, input.messages[0]);
            }

            const pendingIsStale =
              document.pendingTurnStartedAt !== null &&
              Date.now() - document.pendingTurnStartedAt > PENDING_TURN_TTL_MS;
            if (
              input.requireNoPendingTurn &&
              document.pendingTurnId &&
              !pendingIsStale
            ) {
              throw new AIConversationError(
                "conversation_busy",
                409,
                "Another conversation turn is still running",
              );
            }

            let droppedProactiveGreetings = false;
            if (input.requireEmpty && existingAreOnlyProactiveGreetings) {
              document.messages = [];
              droppedProactiveGreetings = true;
            }

            if (input.turn) {
              if (input.turn.action === "begin") {
                if (
                  document.pendingTurnId &&
                  document.pendingTurnId !== input.turn.id &&
                  !pendingIsStale
                ) {
                  throw new AIConversationError(
                    "conversation_busy",
                    409,
                    "Another conversation turn is still running",
                  );
                }
                document.pendingTurnId = input.turn.id;
                document.pendingTurnStartedAt = Date.now();
              } else if (document.pendingTurnId !== input.turn.id) {
                throw new AIConversationError(
                  "revision_conflict",
                  409,
                  "Conversation turn is no longer active",
                );
              }
            }

            const messagesChanged = mergeConversationMessages(
              document,
              input.messages,
            );
            const truncationChanged =
              input.historyTruncated === true && !document.historyTruncated;
            if (input.historyTruncated) {
              document.historyTruncated = true;
            }
            if (input.turn?.action === "complete") {
              document.pendingTurnId = null;
              document.pendingTurnStartedAt = null;
            }
            appendOperation(document, input.operationId);
            if (!input.preserveLegacyImport) {
              document.legacyImportAllowed = false;
            }
            if (
              messagesChanged ||
              truncationChanged ||
              droppedProactiveGreetings
            ) {
              document.revision += 1;
              document.updatedAt = new Date().toISOString();
            }
            await saveConversation(
              input.redis,
              input.username,
              document,
              lockToken,
            );
            return { document, operationApplied: true };
          },
        }),
    });
  } catch (error) {
    if (error instanceof AIAttachmentReferenceError) {
      throw new AIConversationError(
        "attachment_not_found",
        422,
        "Referenced attachment is missing",
      );
    }
    if (error instanceof Error && error.message === "attachment_busy") {
      throw new AIConversationError(
        "conversation_busy",
        503,
        "Attachment index is busy",
      );
    }
    throw error;
  }
}

export async function beginAIConversationTurn(
  input: BeginAIConversationTurnInput,
): Promise<StoredConversation> {
  return (await beginAIConversationTurnWithStatus(input)).document;
}

export async function beginAIConversationTurnWithStatus(
  input: BeginAIConversationTurnInput,
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
    requireAssistantContinuation:
      input.action.kind === "assistant-continuation",
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
  input: CompleteAIConversationTurnInput,
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
  input: ImportAIConversationMessagesInput,
): Promise<StoredConversation> {
  return (
    await writeAIConversationMessages({
      ...input,
      requireEmpty: true,
    })
  ).document;
}

/**
 * Append a standalone assistant message (e.g. a proactive greeting) outside a
 * regular user turn. The write is optimistic: it fails cleanly when a turn is
 * pending or when the conversation moved past the caller's snapshot, and it
 * keeps `legacyImportAllowed` intact so a greeting never blocks a legacy
 * device from importing its local history later.
 */
export async function appendAIConversationAssistantMessage(
  input: AppendAIConversationAssistantMessageInput,
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  assertMessageRole(input.message, "assistant");
  return writeAIConversationMessages({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    operationId: input.operationId,
    messages: [input.message],
    requireNoPendingTurn: true,
    preserveLegacyImport: true,
    ...(input.expectedConversationId
      ? { expectedConversationId: input.expectedConversationId }
      : {}),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
  });
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

export async function getPendingAIConversationResetMemory({
  redis,
  username,
  channel,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
}): Promise<PendingAIConversationResetMemory | null> {
  const raw = await redis.get(
    redisKeys.chat.aiConversationResetMemory(username, channel),
  );
  return parsePendingResetMemory(raw);
}

export type ProcessPendingAIConversationResetMemoryResult =
  | { status: "none" }
  | { status: "busy" }
  | { status: "processed"; snapshotId: string }
  | { status: "superseded"; snapshotId: string };

export async function processPendingAIConversationResetMemory({
  redis,
  username,
  channel,
  processSnapshot,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  processSnapshot: (
    snapshot: PendingAIConversationResetMemory,
  ) => Promise<unknown>;
}): Promise<ProcessPendingAIConversationResetMemoryResult> {
  const pendingKey = redisKeys.chat.aiConversationResetMemory(
    username,
    channel,
  );
  const lockKey = redisKeys.chat.aiConversationResetMemoryLock(
    username,
    channel,
  );
  const lockToken = crypto.randomUUID();
  const claimed = await redis.set(lockKey, lockToken, {
    nx: true,
    ex: RESET_MEMORY_LOCK_TTL_SECONDS,
  });
  if (claimed === null || claimed === undefined) {
    return { status: "busy" };
  }

  try {
    const raw = await redis.get(pendingKey);
    const snapshot = parsePendingResetMemory(raw);
    if (!snapshot || typeof raw !== "string") {
      return { status: "none" };
    }

    await processSnapshot(snapshot);
    const deleted = await redis.eval<number>(
      DELETE_IF_UNCHANGED_SCRIPT,
      [pendingKey],
      [raw],
    );
    return deleted === 1
      ? { status: "processed", snapshotId: snapshot.id }
      : { status: "superseded", snapshotId: snapshot.id };
  } finally {
    await redis
      .eval<number>(RELEASE_LOCK_SCRIPT, [lockKey], [lockToken])
      .catch(() => 0);
  }
}

export async function resetAIConversation(
  input: ResetAIConversationInput,
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
          "Conversation changed",
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
      const existingPending = await getPendingAIConversationResetMemory({
        redis: input.redis,
        username: input.username,
        channel: input.channel,
      });
      const pendingResetMemory = buildPendingResetMemory({
        current,
        existing: existingPending,
        channel: input.channel,
        timeZone: input.timeZone,
      });
      await saveResetConversation({
        redis: input.redis,
        username: input.username,
        document: replacement,
        lockToken,
        pendingResetMemory,
      });
      return { document: replacement, reset: true, clearedMessages };
    },
  });
}

export async function prepareAIConversationRegeneration(
  input: RegenerateAIConversationInput,
): Promise<StoredConversation> {
  const document = await getOrCreateAIConversation(input);
  validateRegenerationTarget(document, input);
  return document;
}

function validateRegenerationTarget(
  document: StoredConversation,
  input: RegenerateAIConversationInput,
): AIConversationMessage {
  if (
    input.expectedConversationId &&
    input.expectedConversationId !== document.id
  ) {
    throw new AIConversationError(
      "conversation_changed",
      409,
      "Conversation changed",
    );
  }
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== document.revision
  ) {
    throw new AIConversationError(
      "revision_conflict",
      409,
      "Conversation revision changed",
    );
  }
  const target = input.targetMessageId
    ? document.messages.find((message) => message.id === input.targetMessageId)
    : document.messages.findLast((message) => message.role === "assistant");
  if (!target) {
    throw new AIConversationError(
      "message_id_conflict",
      409,
      "Regeneration target was not found",
    );
  }
  return target;
}

export async function commitAIConversationRegeneration(
  input: CommitAIConversationRegenerationInput,
): Promise<StoredConversation> {
  try {
    return await withAIAttachmentReferenceLock({
      redis: input.redis,
      username: input.username,
      messages: [input.responseMessage],
      task: () =>
        withConversationLock({
          redis: input.redis,
          username: input.username,
          channel: input.channel,
          task: async (lockToken) => {
            const document =
              (await readConversation(
                input.redis,
                input.username,
                input.channel,
              )) ?? createConversation(input.channel);
            if (document.recentOperationIds.includes(input.operationId)) {
              return document;
            }
            if (document.pendingTurnId !== input.turnId) {
              throw new AIConversationError(
                "revision_conflict",
                409,
                "Conversation turn is no longer active",
              );
            }
            const target = validateRegenerationTarget(document, input);
            assertMessageRole(input.responseMessage, "assistant");
            document.messages = document.messages.filter((message) =>
              target.role === "assistant"
                ? message.seq < target.seq
                : message.seq <= target.seq,
            );
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
              lockToken,
            );
            return document;
          },
        }),
    });
  } catch (error) {
    if (error instanceof AIAttachmentReferenceError) {
      throw new AIConversationError(
        "attachment_not_found",
        422,
        "Referenced attachment is missing",
      );
    }
    if (error instanceof Error && error.message === "attachment_busy") {
      throw new AIConversationError(
        "conversation_busy",
        503,
        "Attachment index is busy",
      );
    }
    throw error;
  }
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
      Buffer.from(value, "base64url").toString("utf8"),
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
        "Conversation changed",
      );
    }
    beforeSeq = decoded.beforeSeq;
  }

  const eligible = document.messages.filter(
    (message) => message.seq < beforeSeq,
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
  document: StoredConversation,
): AIConversation {
  return summarizeConversation(document);
}

export type AIProactiveGreetingEligibility =
  | { eligible: true; mode: "fresh" | "stale" }
  | {
      eligible: false;
      reason: "turn_in_progress" | "already_greeted" | "conversation_active";
    };

export interface AIProactiveGreetingConversationState {
  messages: ReadonlyArray<Pick<AIConversationMessage, "id" | "createdAt">>;
  pendingTurnId: string | null;
  pendingTurnStartedAt: number | null;
}

/**
 * Server-side decision for proactive greetings, evaluated against the
 * canonical conversation: greet when the thread is brand new ("fresh") or has
 * been idle for a while ("stale"), and never greet twice in a row, mid-turn,
 * or while the user is actively chatting.
 */
export function getAIProactiveGreetingEligibility(
  document: AIProactiveGreetingConversationState,
  now = Date.now(),
): AIProactiveGreetingEligibility {
  const pendingIsStale =
    document.pendingTurnStartedAt !== null &&
    now - document.pendingTurnStartedAt > PENDING_TURN_TTL_MS;
  if (document.pendingTurnId && !pendingIsStale) {
    return { eligible: false, reason: "turn_in_progress" };
  }
  if (document.messages.length === 0) {
    return { eligible: true, mode: "fresh" };
  }

  const last = document.messages[document.messages.length - 1];
  if (isAIProactiveGreetingMessageId(last.id)) {
    return { eligible: false, reason: "already_greeted" };
  }
  const lastTimestamp = new Date(last.createdAt).getTime();
  if (
    !Number.isFinite(lastTimestamp) ||
    now - lastTimestamp < AI_PROACTIVE_GREETING_STALE_AFTER_MS
  ) {
    return { eligible: false, reason: "conversation_active" };
  }
  return { eligible: true, mode: "stale" };
}

export function getAIConversationModelMessages(
  document: StoredConversation,
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
  targetMessageId?: string,
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
}> {
  const targetIndex = targetMessageId
    ? document.messages.findIndex((message) => message.id === targetMessageId)
    : document.messages.findLastIndex(
        (message) => message.role === "assistant",
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
  username: string,
): Promise<number> {
  await redis.set(redisKeys.chat.aiConversationTombstone(username), "1");
  return redis.del(
    redisKeys.chat.aiConversation(username, "chat"),
    redisKeys.chat.aiConversationLock(username, "chat"),
    redisKeys.chat.aiConversationResetMemory(username, "chat"),
    redisKeys.chat.aiConversationResetMemoryLock(username, "chat"),
    redisKeys.chat.aiConversation(username, "assistant"),
    redisKeys.chat.aiConversationLock(username, "assistant"),
    redisKeys.chat.aiConversationResetMemory(username, "assistant"),
    redisKeys.chat.aiConversationResetMemoryLock(username, "assistant"),
  );
}

export async function clearAIConversationTombstone(
  redis: AIConversationRedis,
  username: string,
): Promise<void> {
  await redis.del(redisKeys.chat.aiConversationTombstone(username));
}
