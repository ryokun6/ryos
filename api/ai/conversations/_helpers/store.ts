import { z } from "zod";
import type { RedisLike } from "../../../_utils/redis.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";
import {
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPage,
} from "../../../../src/shared/contracts/aiConversation.js";
import { ASSISTANT_SUMMON_MESSAGE } from "../../../../src/shared/assistantGreeting.js";

const CONVERSATION_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 15;
const LOCK_ATTEMPTS = 40;
const LOCK_RETRY_MS = 25;
const MAX_MESSAGES = 200;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_MESSAGE_TEXT_LENGTH = 12_000;
const MAX_RECENT_OPERATIONS = 48;
const MAX_MESSAGE_ID_LENGTH = 160;

const storedMessageSchema = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  seq: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
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
  messages: z.array(storedMessageSchema),
  recentOperationIds: z.array(z.string()),
  lastResetOperationId: z.string().nullable(),
});

type StoredConversation = z.infer<typeof storedConversationSchema>;
export type AIConversationRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "expire"
>;

export type AIConversationErrorCode =
  | "conversation_busy"
  | "conversation_changed"
  | "revision_conflict"
  | "message_id_conflict"
  | "conversation_not_empty"
  | "invalid_cursor"
  | "conversation_corrupt";

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

export interface SyncAIConversationInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  messages: readonly unknown[];
  operationId: string;
  expectedConversationId?: string;
  expectedRevision?: number;
  requireEmpty?: boolean;
}

export interface ResetAIConversationInput {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  conversationId: string;
  operationId: string;
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
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_MESSAGE_TEXT_LENGTH)
    .trim();
}

function getMessageText(message: Record<string, unknown>): string {
  if (Array.isArray(message.parts)) {
    const text = message.parts
      .flatMap((part) => {
        if (!isRecord(part) || part.type !== "text") return [];
        return typeof part.text === "string" ? [part.text] : [];
      })
      .join("\n");
    if (text.trim()) return normalizeText(text);
  }
  return typeof message.content === "string"
    ? normalizeText(message.content)
    : "";
}

function isSyntheticMessage(id: string, role: "user" | "assistant", text: string) {
  if (role === "user" && text === ASSISTANT_SUMMON_MESSAGE) return true;
  if (role !== "assistant") return false;
  return id === "1" || id.startsWith("assistant-local-greeting-");
}

export function sanitizeAIConversationMessages(
  messages: readonly unknown[]
): Omit<AIConversationMessage, "seq">[] {
  const sanitized: Omit<AIConversationMessage, "seq">[] = [];

  for (const candidate of messages) {
    if (!isRecord(candidate)) continue;
    if (candidate.role !== "user" && candidate.role !== "assistant") continue;

    const role = candidate.role;
    const text = getMessageText(candidate);
    if (!text) continue;

    const candidateId = getString(candidate.id)?.trim();
    const id =
      candidateId && candidateId.length <= MAX_MESSAGE_ID_LENGTH
        ? candidateId
        : crypto.randomUUID();
    if (isSyntheticMessage(id, role, text)) continue;

    sanitized.push({
      id,
      role,
      parts: [{ type: "text", text }],
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
    messages: [],
    recentOperationIds: [],
    lastResetOperationId: null,
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
  };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function withConversationLock<T>({
  redis,
  username,
  channel,
  task,
}: {
  redis: AIConversationRedis;
  username: string;
  channel: AIConversationChannel;
  task: () => Promise<T>;
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
        return await task();
      } finally {
        const currentToken = await redis.get(key).catch(() => null);
        if (currentToken === token) {
          await redis.del(key).catch(() => 0);
        }
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
  document: StoredConversation
): Promise<void> {
  await redis.set(
    redisKeys.chat.aiConversation(username, document.channel),
    document,
    { ex: CONVERSATION_TTL_SECONDS }
  );
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
    task: async () => {
      const raced = await readConversation(redis, username, channel);
      if (raced) return raced;
      const created = createConversation(channel);
      await saveConversation(redis, username, created);
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
    (total, message) =>
      total + Buffer.byteLength(message.parts[0]?.text ?? "", "utf8"),
    0
  );
  let removed = false;

  while (
    document.messages.length > MAX_MESSAGES ||
    (totalBytes > MAX_TEXT_BYTES && document.messages.length > 1)
  ) {
    const oldest = document.messages.shift();
    if (!oldest) break;
    totalBytes -= Buffer.byteLength(oldest.parts[0]?.text ?? "", "utf8");
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
    existing.parts[0]?.text === incoming.parts[0]?.text
  );
}

export async function syncAIConversationMessages(
  input: SyncAIConversationInput
): Promise<StoredConversation> {
  if (!input.operationId.trim() || input.operationId.length > 160) {
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
    task: async () => {
      const document =
        (await readConversation(input.redis, input.username, input.channel)) ??
        createConversation(input.channel);

      if (document.recentOperationIds.includes(input.operationId)) {
        return document;
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

      const incomingMessages = sanitizeAIConversationMessages(input.messages);
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
      appendOperation(document, input.operationId);
      if (changed) {
        document.revision += 1;
        document.updatedAt = new Date().toISOString();
      }
      await saveConversation(input.redis, input.username, document);
      return document;
    },
  });
}

export async function resetAIConversation(
  input: ResetAIConversationInput
): Promise<{ document: StoredConversation; reset: boolean }> {
  return withConversationLock({
    redis: input.redis,
    username: input.username,
    channel: input.channel,
    task: async () => {
      const current =
        (await readConversation(input.redis, input.username, input.channel)) ??
        createConversation(input.channel);

      if (current.lastResetOperationId === input.operationId) {
        return { document: current, reset: false };
      }
      if (current.id !== input.conversationId) {
        throw new AIConversationError(
          "conversation_changed",
          409,
          "Conversation changed"
        );
      }

      const replacement = createConversation(input.channel);
      replacement.lastResetOperationId = input.operationId;
      replacement.recentOperationIds = [input.operationId];
      await saveConversation(input.redis, input.username, replacement);
      return { document: replacement, reset: true };
    },
  });
}

interface ConversationCursor {
  version: 1;
  conversationId: string;
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
      typeof decoded.beforeSeq !== "number" ||
      !Number.isSafeInteger(decoded.beforeSeq) ||
      decoded.beforeSeq < 1
    ) {
      throw new Error("invalid");
    }
    return {
      version: 1,
      conversationId: decoded.conversationId,
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
    if (decoded.conversationId !== document.id) {
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
  parts: Array<{ type: "text"; text: string }>;
}> {
  return document.messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
  }));
}

export async function deleteAIConversationKeys(
  redis: AIConversationRedis,
  username: string
): Promise<number> {
  return redis.del(
    redisKeys.chat.aiConversation(username, "chat"),
    redisKeys.chat.aiConversationLock(username, "chat"),
    redisKeys.chat.aiConversation(username, "assistant"),
    redisKeys.chat.aiConversationLock(username, "assistant")
  );
}
