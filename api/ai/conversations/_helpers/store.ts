import { z } from "zod";
import type { RedisLike } from "../../../_utils/redis.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";
import {
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPart,
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  AI_PROACTIVE_GREETING_STALE_AFTER_MS,
  isAIProactiveGreetingMessageId,
} from "../../../../src/shared/contracts/aiConversation.js";
import {
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
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

// Documents written before the append-log simplification carry extra fields
// (`legacyImportAllowed`, `pendingTurnId`, `pendingTurnStartedAt`); zod strips
// unknown keys, so they are dropped on the next save.
const storedConversationSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  channel: z.enum(["chat", "assistant"]),
  revision: z.number().int().nonnegative(),
  nextSeq: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  historyTruncated: z.boolean(),
  messages: z.array(storedMessageSchema),
  recentOperationIds: z.array(z.string()),
  lastResetOperationId: z.string().nullable(),
});

type StoredConversation = z.infer<typeof storedConversationSchema>;
export type AIConversationRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "expire" | "eval" | "smembers" | "sadd" | "srem"
>;

export type AIConversationErrorCode =
  | "conversation_busy"
  | "conversation_changed"
  | "revision_conflict"
  | "message_id_conflict"
  | "message_too_large"
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

interface ConversationWriteContext {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  operationId: string;
  expectedConversationId?: string;
  expectedRevision?: number;
}

export interface BeginAIConversationTurnInput extends ConversationWriteContext {
  action:
    | { kind: "user-message"; message: unknown }
    | { kind: "assistant-continuation"; message: unknown }
    | { kind: "regenerate"; targetMessageId?: string };
}

export interface CompleteAIConversationTurnInput
  extends ConversationWriteContext {
  responseMessage: unknown;
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
}

export interface CommitAIConversationRegenerationInput
  extends ConversationWriteContext {
  responseMessage: unknown;
  targetMessageId?: string;
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

/**
 * Project stored conversation messages to plain `{role, content, createdAt}`
 * records (e.g. for memory extraction after a conversation reset).
 */
export function toPlainAIConversationMessages(
  messages: readonly AIConversationMessage[],
): Array<{ role: "user" | "assistant"; content: string; createdAt: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: getPartsText(message.parts),
    createdAt: message.createdAt,
  }));
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
    messages: [],
    recentOperationIds: [],
    lastResetOperationId: null,
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
  const newest = document.messages.reduce(
    (max, message) => (message.seq > (max ?? 0) ? message.seq : max),
    null as number | null,
  );
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

/**
 * JSON.stringify with recursively sorted object keys. The server-persisted
 * copy of a message part and the client's streamed copy are built by
 * different code paths, so plain JSON.stringify equality is sensitive to
 * harmless key-order drift.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!isRecord(entry)) return entry;
    return Object.keys(entry)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = entry[key];
        return sorted;
      }, {});
  });
}

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

/**
 * Provider-executed tool parts (e.g. OpenAI `web_search`) run inside the
 * model provider; the client can never legitimately change them, but its
 * streamed copy routinely differs from the server-persisted one (provider
 * metadata, field presence). Continuations tolerate that drift and keep the
 * stored copy canonical.
 */
function isProviderExecutedToolPart(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const type = getString(value.type);
  return (
    (type === "dynamic-tool" || !!type?.startsWith("tool-")) &&
    typeof value.toolCallId === "string" &&
    value.providerExecuted === true
  );
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

/**
 * Validate an assistant continuation against the stored latest assistant
 * message and return the canonical merged message: stored parts stay
 * authoritative everywhere except for valid pending→terminal client tool
 * transitions, which adopt the incoming part. Benign drift in
 * provider-executed tool parts is tolerated (stored copy kept); any other
 * content change is rejected so a client cannot rewrite assistant content.
 */
function buildValidatedAssistantContinuation(
  document: StoredConversation,
  message: unknown,
): Omit<AIConversationMessage, "seq"> {
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
  const mergedParts = latest.parts.map((existingPart, index) => {
    const incomingPart = incoming.parts[index];
    if (stableStringify(existingPart) === stableStringify(incomingPart)) {
      return existingPart;
    }

    const existingTool = getClientToolPart(existingPart);
    const incomingTool = getClientToolPart(incomingPart);
    const transitionIsValid =
      existingTool !== null &&
      incomingTool !== null &&
      PENDING_CLIENT_TOOL_STATES.has(String(existingTool.state)) &&
      isTerminalClientToolPart(incomingTool) &&
      incomingTool.preliminary !== true &&
      stableStringify(getClientToolIdentity(existingTool)) ===
        stableStringify(getClientToolIdentity(incomingTool));
    if (transitionIsValid) {
      advancedClientTool = true;
      return incomingPart;
    }

    if (
      isProviderExecutedToolPart(existingPart) &&
      isProviderExecutedToolPart(incomingPart) &&
      Reflect.get(existingPart, "toolCallId") ===
        Reflect.get(incomingPart, "toolCallId")
    ) {
      return existingPart;
    }

    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Assistant continuation may only complete pending client tool calls",
    );
  });

  if (!advancedClientTool) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Assistant continuation must complete a pending client tool call",
    );
  }

  return {
    id: latest.id,
    role: latest.role,
    parts: mergedParts,
    createdAt: latest.createdAt,
  };
}

/**
 * Merge incoming messages into the document. New ids append with a fresh
 * `seq`; an assistant message whose content changed is updated in place but
 * re-minted onto a fresh `seq` so `afterSeq` delta reads pick the update up.
 */
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
    existing.seq = document.nextSeq;
    document.nextSeq += 1;
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

function assertOperationId(operationId: string, allowSuffix = false): void {
  const maxLength = allowSuffix
    ? AI_CONVERSATION_OPERATION_ID_MAX_LENGTH +
      TURN_COMPLETION_OPERATION_SUFFIX.length
    : AI_CONVERSATION_OPERATION_ID_MAX_LENGTH;
  if (!operationId.trim() || operationId.length > maxLength) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Invalid operation id",
    );
  }
}

function assertExpectedDocument(
  document: StoredConversation,
  input: Pick<
    ConversationWriteContext,
    "expectedConversationId" | "expectedRevision"
  >,
): void {
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
}

interface WriteAIConversationMessagesInput extends ConversationWriteContext {
  messages: readonly unknown[];
  requireAssistantContinuation?: boolean;
  allowCompletionOperationSuffix?: boolean;
}

async function writeAIConversationMessages(
  input: WriteAIConversationMessagesInput,
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  assertOperationId(input.operationId, input.allowCompletionOperationSuffix);

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
      assertExpectedDocument(document, input);
      let messagesToMerge = input.messages;
      if (input.requireAssistantContinuation) {
        messagesToMerge = [
          buildValidatedAssistantContinuation(document, input.messages[0]),
        ];
      }

      const messagesChanged = mergeConversationMessages(
        document,
        messagesToMerge,
      );
      appendOperation(document, input.operationId);
      if (messagesChanged) {
        document.revision += 1;
        document.updatedAt = new Date().toISOString();
      }
      await saveConversation(input.redis, input.username, document, lockToken);
      return { document, operationApplied: true };
    },
  });
}

function validateRegenerationTarget(
  document: StoredConversation,
  targetMessageId: string | undefined,
): AIConversationMessage {
  const target = targetMessageId
    ? document.messages.find((message) => message.id === targetMessageId)
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

/**
 * Record the start of a conversation turn. For user messages and assistant
 * continuations this appends/updates the message; for regenerations it only
 * validates the target and records the operation id (content changes at
 * commit time). There is no turn lock: concurrent turns append independently
 * and the operation id makes retries idempotent.
 */
export async function beginAIConversationTurn(
  input: BeginAIConversationTurnInput,
): Promise<{ document: StoredConversation; operationApplied: boolean }> {
  if (input.action.kind === "user-message") {
    assertMessageRole(input.action.message, "user");
    return writeAIConversationMessages({
      ...input,
      messages: [input.action.message],
    });
  }
  if (input.action.kind === "assistant-continuation") {
    assertMessageRole(input.action.message, "assistant");
    return writeAIConversationMessages({
      ...input,
      messages: [input.action.message],
      requireAssistantContinuation: true,
    });
  }

  const targetMessageId = input.action.targetMessageId;
  assertOperationId(input.operationId);
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
      assertExpectedDocument(document, input);
      validateRegenerationTarget(document, targetMessageId);
      appendOperation(document, input.operationId);
      await saveConversation(input.redis, input.username, document, lockToken);
      return { document, operationApplied: true };
    },
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
      allowCompletionOperationSuffix: true,
      ...(input.expectedConversationId
        ? { expectedConversationId: input.expectedConversationId }
        : {}),
    })
  ).document;
}

/**
 * Append a standalone assistant message (e.g. a proactive greeting) outside a
 * regular user turn. The optimistic revision guard makes a racing user turn
 * win: any conversation change since the caller's snapshot rejects the write.
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
    ...(input.expectedConversationId
      ? { expectedConversationId: input.expectedConversationId }
      : {}),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
  });
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
        lockToken,
      );
      return { document: replacement, reset: true, clearedMessages };
    },
  });
}

export async function commitAIConversationRegeneration(
  input: CommitAIConversationRegenerationInput,
): Promise<StoredConversation> {
  assertOperationId(input.operationId, true);
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
      assertExpectedDocument(document, input);
      const target = validateRegenerationTarget(
        document,
        input.targetMessageId,
      );
      assertMessageRole(input.responseMessage, "assistant");
      document.messages = document.messages.filter((message) =>
        target.role === "assistant"
          ? message.seq < target.seq
          : message.seq <= target.seq,
      );
      mergeConversationMessages(document, [input.responseMessage]);
      appendOperation(document, input.operationId);
      document.revision += 1;
      document.updatedAt = new Date().toISOString();
      await saveConversation(input.redis, input.username, document, lockToken);
      return document;
    },
  });
}

/**
 * Read the canonical conversation, optionally as a delta: with `afterSeq`
 * only messages whose `seq` is greater are returned. Content updates re-mint
 * `seq`, so deltas include in-place assistant updates; structural changes
 * (reset, regeneration, trimming) are detectable client-side from the
 * returned summary (`messageCount` / `oldestSeq` / conversation id).
 */
export async function getAIConversationSnapshot({
  redis,
  username,
  channel,
  afterSeq,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  afterSeq?: number;
}): Promise<{
  conversation: AIConversation;
  messages: AIConversationMessage[];
}> {
  const document = await getOrCreateAIConversation({
    redis,
    username,
    channel,
  });
  const messages =
    afterSeq === undefined
      ? document.messages
      : document.messages.filter((message) => message.seq > afterSeq);
  return {
    conversation: summarizeConversation(document),
    messages: [...messages].sort((left, right) => left.seq - right.seq),
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
      reason: "already_greeted" | "conversation_active";
    };

export interface AIProactiveGreetingConversationState {
  messages: ReadonlyArray<Pick<AIConversationMessage, "id" | "createdAt">>;
}

/**
 * Server-side decision for proactive greetings, evaluated against the
 * canonical conversation: greet when the thread is brand new ("fresh") or has
 * been idle for a while ("stale"), and never greet twice in a row or while
 * the user is actively chatting. A turn racing the greeting is caught by the
 * optimistic revision guard when the greeting is appended.
 */
export function getAIProactiveGreetingEligibility(
  document: AIProactiveGreetingConversationState,
  now = Date.now(),
): AIProactiveGreetingEligibility {
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
  // The reset-memory keys are no longer written but may exist from before the
  // pending-snapshot machinery was removed; delete them on purge regardless.
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
