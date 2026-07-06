import { z } from "zod";
import type { FileUIPart, TextUIPart, ToolUIPart } from "ai";
import type { RedisLike } from "../../../_utils/redis.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";
import {
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPart,
  type AIConversationPage,
} from "../../../../src/shared/contracts/aiConversation.js";
import { ASSISTANT_SUMMON_MESSAGE } from "../../../../src/shared/assistantGreeting.js";
import {
  canonicalizeAIAttachmentUrl,
  collectAIAttachmentIds,
  deleteAIAttachments,
} from "../../attachments/_helpers/store.js";

const CONVERSATION_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 60;
const LOCK_ATTEMPTS = 40;
const LOCK_RETRY_MS = 25;
const MAX_MESSAGES = 200;
const MAX_CONVERSATION_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGE_TEXT_LENGTH = 128_000;
const MAX_MESSAGE_BYTES = 768 * 1024;
const MAX_PARTS_PER_MESSAGE = 48;
const MAX_TOOL_NAME_LENGTH = 96;
const MAX_TOOL_CALL_ID_LENGTH = 200;
const MAX_TOOL_INPUT_BYTES = 16 * 1024;
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;
const MAX_LARGE_TOOL_OUTPUT_BYTES = 512 * 1024;
const MAX_TOOL_ERROR_LENGTH = 2_000;
const MAX_URL_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 512;
const MAX_RECENT_OPERATIONS = 48;
const MAX_MESSAGE_ID_LENGTH = 160;
const PENDING_TURN_TTL_MS = 2 * 60 * 1000;

const storedMessageV1Schema = z.object({
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

const storedConversationV1Schema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  channel: z.enum(["chat", "assistant"]),
  revision: z.number().int().nonnegative(),
  nextSeq: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  historyTruncated: z.boolean(),
  legacyImportAllowed: z.boolean(),
  messages: z.array(storedMessageV1Schema),
  recentOperationIds: z.array(z.string()),
  lastResetOperationId: z.string().nullable(),
  pendingTurnId: z.string().nullable(),
  pendingTurnStartedAt: z.number().int().nonnegative().nullable(),
});

const toolPartTypeSchema = z.custom<`tool-${string}`>(
  (value) =>
    typeof value === "string" &&
    value.startsWith("tool-") &&
    value.length > 5 &&
    value.length <= MAX_TOOL_NAME_LENGTH + 5 &&
    /^tool-[A-Za-z0-9_-]+$/.test(value)
);

const storedToolPartBaseSchema = z.object({
  type: toolPartTypeSchema,
  toolCallId: z.string().min(1).max(MAX_TOOL_CALL_ID_LENGTH),
  title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
  providerExecuted: z.boolean().optional(),
});

const storedApprovalRequestSchema = z.object({
  id: z.string().min(1).max(MAX_TOOL_CALL_ID_LENGTH),
});

const storedApprovalResponseSchema = z.object({
  id: z.string().min(1).max(MAX_TOOL_CALL_ID_LENGTH),
  approved: z.boolean(),
  reason: z.string().max(MAX_TOOL_ERROR_LENGTH).optional(),
});

const storedToolPartSchema = z.discriminatedUnion("state", [
  storedToolPartBaseSchema.extend({
    state: z.literal("input-streaming"),
    input: z.unknown().optional(),
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("input-available"),
    input: z.unknown(),
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("approval-requested"),
    input: z.unknown(),
    approval: storedApprovalRequestSchema,
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("approval-responded"),
    input: z.unknown(),
    approval: storedApprovalResponseSchema,
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("output-available"),
    input: z.unknown(),
    output: z.unknown(),
    preliminary: z.boolean().optional(),
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("output-error"),
    input: z.unknown().optional(),
    errorText: z.string().max(MAX_TOOL_ERROR_LENGTH),
  }),
  storedToolPartBaseSchema.extend({
    state: z.literal("output-denied"),
    input: z.unknown(),
    approval: storedApprovalResponseSchema.extend({
      approved: z.literal(false),
    }),
  }),
]);

const storedPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
    state: z.enum(["streaming", "done"]).optional(),
  }),
  z.object({
    type: z.literal("file"),
    mediaType: z.string().min(1).max(128),
    filename: z.string().min(1).max(160).optional(),
    url: z.string().min(1).max(MAX_URL_LENGTH),
  }),
  storedToolPartSchema,
  z.object({
    type: z.literal("source-url"),
    sourceId: z.string().min(1).max(MAX_TOOL_CALL_ID_LENGTH),
    url: z.string().url().max(MAX_URL_LENGTH),
    title: z.string().max(MAX_TITLE_LENGTH).optional(),
  }),
  z.object({
    type: z.literal("source-document"),
    sourceId: z.string().min(1).max(MAX_TOOL_CALL_ID_LENGTH),
    mediaType: z.string().min(1).max(128),
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    filename: z.string().min(1).max(160).optional(),
  }),
]);

const storedMessageV2Schema = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  seq: z.number().int().positive(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(storedPartSchema).min(1).max(MAX_PARTS_PER_MESSAGE),
  createdAt: z.string(),
});

const storedConversationV2Schema = z.object({
  version: z.literal(2),
  id: z.string().uuid(),
  channel: z.enum(["chat", "assistant"]),
  revision: z.number().int().nonnegative(),
  nextSeq: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  historyTruncated: z.boolean(),
  legacyImportAllowed: z.boolean(),
  messages: z.array(storedMessageV2Schema),
  recentOperationIds: z.array(z.string()),
  lastResetOperationId: z.string().nullable(),
  pendingTurnId: z.string().nullable(),
  pendingTurnStartedAt: z.number().int().nonnegative().nullable(),
});

interface StoredConversation {
  version: 2;
  id: string;
  channel: AIConversationChannel;
  revision: number;
  nextSeq: number;
  createdAt: string;
  updatedAt: string;
  historyTruncated: boolean;
  legacyImportAllowed: boolean;
  messages: AIConversationMessage[];
  recentOperationIds: string[];
  lastResetOperationId: string | null;
  pendingTurnId: string | null;
  pendingTurnStartedAt: number | null;
}
export type AIConversationRedis = Pick<
  RedisLike,
  | "get"
  | "set"
  | "del"
  | "expire"
  | "eval"
  | "sadd"
  | "srem"
  | "smembers"
>;

export type AIConversationErrorCode =
  | "conversation_busy"
  | "conversation_changed"
  | "revision_conflict"
  | "message_id_conflict"
  | "conversation_not_empty"
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

function normalizeText(text: string, maxLength = MAX_MESSAGE_TEXT_LENGTH): string {
  return text
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n")
    .slice(0, maxLength)
    .trim();
}

function getToolName(type: `tool-${string}`): string {
  return type.slice(5);
}

function isToolConversationPart(
  part: AIConversationPart
): part is ToolUIPart {
  return part.type.startsWith("tool-");
}

function getToolPartType(value: unknown): `tool-${string}` | null {
  return toolPartTypeSchema.safeParse(value).success
    ? (value as `tool-${string}`)
    : null;
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

function cloneJsonValue(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? undefined : JSON.parse(serialized);
}

function omitObjectFields(
  value: unknown,
  fields: ReadonlySet<string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitObjectFields(item, fields));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      fields.has(key)
        ? []
        : [[key, omitObjectFields(child, fields)] as const]
    )
  );
}

function omittedToolPayload(reason: "private" | "too_large", byteLength: number) {
  return {
    synced: false,
    reason,
    byteLength: Number.isFinite(byteLength) ? byteLength : null,
  };
}

function sanitizeToolPayload({
  toolName,
  direction,
  value,
}: {
  toolName: string;
  direction: "input" | "output";
  value: unknown;
}): unknown {
  const originalByteLength = jsonByteLength(value);
  if (
    direction === "output" &&
    (toolName === "memoryRead" || toolName === "read")
  ) {
    return omittedToolPayload("private", originalByteLength);
  }

  let normalized: unknown;
  try {
    normalized = cloneJsonValue(value);
  } catch {
    return omittedToolPayload("too_large", originalByteLength);
  }

  if (
    direction === "input" &&
    (toolName === "write" || toolName === "edit")
  ) {
    normalized = omitObjectFields(
      normalized,
      new Set(["content", "newContent", "replacement"])
    );
  }
  if (direction === "output" && toolName === "webFetch") {
    normalized = omitObjectFields(normalized, new Set(["content"]));
  }
  if (toolName === "infiniteMacControl") {
    normalized = omitObjectFields(normalized, new Set(["screenImageDataUrl"]));
  }

  const maxBytes =
    direction === "input"
      ? MAX_TOOL_INPUT_BYTES
      : toolName === "generateHtml"
        ? MAX_LARGE_TOOL_OUTPUT_BYTES
        : MAX_TOOL_OUTPUT_BYTES;
  const normalizedByteLength = jsonByteLength(normalized);
  return normalizedByteLength <= maxBytes
    ? normalized
    : omittedToolPayload("too_large", originalByteLength);
}

function sanitizeToolBase(part: Record<string, unknown>) {
  const type = getToolPartType(part.type);
  const toolCallId = getString(part.toolCallId)?.trim();
  if (
    !type ||
    !toolCallId ||
    toolCallId.length > MAX_TOOL_CALL_ID_LENGTH
  ) {
    return null;
  }
  const title =
    typeof part.title === "string"
      ? normalizeText(part.title, MAX_TITLE_LENGTH)
      : "";
  return {
    type,
    toolCallId,
    ...(title ? { title } : {}),
    ...(typeof part.providerExecuted === "boolean"
      ? { providerExecuted: part.providerExecuted }
      : {}),
  };
}

function sanitizeApproval(
  value: unknown,
  mode: "requested" | "responded"
):
  | { id: string }
  | { id: string; approved: boolean; reason?: string }
  | null {
  if (!isRecord(value)) return null;
  const id = getString(value.id)?.trim();
  if (!id || id.length > MAX_TOOL_CALL_ID_LENGTH) return null;
  if (mode === "requested") return { id };
  if (typeof value.approved !== "boolean") return null;
  const reason =
    typeof value.reason === "string"
      ? normalizeText(value.reason, MAX_TOOL_ERROR_LENGTH)
      : "";
  return {
    id,
    approved: value.approved,
    ...(reason ? { reason } : {}),
  };
}

function sanitizeToolPart(
  part: Record<string, unknown>
): AIConversationPart | null {
  const base = sanitizeToolBase(part);
  if (!base || typeof part.state !== "string") return null;
  const toolName = getToolName(base.type);
  const input = sanitizeToolPayload({
    toolName,
    direction: "input",
    value: part.input,
  });

  switch (part.state) {
    case "input-streaming":
      return {
        ...base,
        state: "input-streaming",
        ...(part.input === undefined ? {} : { input }),
      };
    case "input-available":
      return { ...base, state: "input-available", input };
    case "approval-requested": {
      const approval = sanitizeApproval(part.approval, "requested");
      return approval
        ? { ...base, state: "approval-requested", input, approval }
        : null;
    }
    case "approval-responded": {
      const approval = sanitizeApproval(part.approval, "responded");
      return approval
        ? { ...base, state: "approval-responded", input, approval }
        : null;
    }
    case "output-available":
      return {
        ...base,
        state: "output-available",
        input,
        output: sanitizeToolPayload({
          toolName,
          direction: "output",
          value: part.output,
        }),
        ...(typeof part.preliminary === "boolean"
          ? { preliminary: part.preliminary }
          : {}),
      };
    case "output-error": {
      const errorText =
        typeof part.errorText === "string"
          ? normalizeText(part.errorText, MAX_TOOL_ERROR_LENGTH)
          : "";
      if (!errorText) return null;
      return {
        ...base,
        state: "output-error",
        ...(part.input === undefined ? {} : { input }),
        errorText,
      };
    }
    case "output-denied": {
      const approval = sanitizeApproval(part.approval, "responded");
      if (!approval || approval.approved !== false) return null;
      return { ...base, state: "output-denied", input, approval };
    }
    default:
      return null;
  }
}

function sanitizeFilePart(
  part: Record<string, unknown>,
  role: "user" | "assistant"
): AIConversationPart | null {
  if (
    typeof part.mediaType !== "string" ||
    !part.mediaType.startsWith("image/") ||
    part.mediaType.length > 128
  ) {
    return null;
  }
  const ownedUrl = canonicalizeAIAttachmentUrl(part.url);
  let url = ownedUrl;
  if (!url && role === "assistant" && typeof part.url === "string") {
    try {
      const parsed = new URL(part.url);
      if (parsed.protocol === "https:" && part.url.length <= MAX_URL_LENGTH) {
        url = part.url;
      }
    } catch {
      url = null;
    }
  }
  if (!url) return null;
  const filename =
    typeof part.filename === "string"
      ? normalizeText(part.filename, 160)
      : "";
  return {
    type: "file",
    mediaType: part.mediaType,
    ...(filename ? { filename } : {}),
    url,
  };
}

function sanitizeSourcePart(
  part: Record<string, unknown>
): AIConversationPart | null {
  const sourceId = getString(part.sourceId)?.trim();
  if (!sourceId || sourceId.length > MAX_TOOL_CALL_ID_LENGTH) return null;

  if (part.type === "source-url") {
    if (typeof part.url !== "string" || part.url.length > MAX_URL_LENGTH) {
      return null;
    }
    try {
      if (new URL(part.url).protocol !== "https:") return null;
    } catch {
      return null;
    }
    const title =
      typeof part.title === "string"
        ? normalizeText(part.title, MAX_TITLE_LENGTH)
        : "";
    return {
      type: "source-url",
      sourceId,
      url: part.url,
      ...(title ? { title } : {}),
    };
  }

  if (
    part.type !== "source-document" ||
    typeof part.mediaType !== "string" ||
    part.mediaType.length > 128 ||
    typeof part.title !== "string"
  ) {
    return null;
  }
  const title = normalizeText(part.title, MAX_TITLE_LENGTH);
  if (!title) return null;
  const filename =
    typeof part.filename === "string"
      ? normalizeText(part.filename, 160)
      : "";
  return {
    type: "source-document",
    sourceId,
    mediaType: part.mediaType,
    title,
    ...(filename ? { filename } : {}),
  };
}

function sanitizeMessageParts(
  candidate: Record<string, unknown>,
  role: "user" | "assistant"
): AIConversationPart[] {
  const parts: AIConversationPart[] = [];
  let remainingTextLength = MAX_MESSAGE_TEXT_LENGTH;
  const candidates = Array.isArray(candidate.parts)
    ? candidate.parts
    : typeof candidate.content === "string"
      ? [{ type: "text", text: candidate.content }]
      : [];

  for (const rawPart of candidates.slice(0, MAX_PARTS_PER_MESSAGE)) {
    if (!isRecord(rawPart) || typeof rawPart.type !== "string") continue;
    if (rawPart.type === "text" && typeof rawPart.text === "string") {
      const text = normalizeText(rawPart.text, remainingTextLength);
      if (!text) continue;
      parts.push({
        type: "text",
        text,
        ...(rawPart.state === "streaming" || rawPart.state === "done"
          ? { state: rawPart.state }
          : {}),
      });
      remainingTextLength -= text.length;
      continue;
    }
    if (rawPart.type === "file") {
      const filePart = sanitizeFilePart(rawPart, role);
      if (filePart) parts.push(filePart);
      continue;
    }
    if (role !== "assistant") continue;
    if (rawPart.type.startsWith("tool-")) {
      const toolPart = sanitizeToolPart(rawPart);
      if (toolPart) parts.push(toolPart);
      continue;
    }
    if (
      rawPart.type === "source-url" ||
      rawPart.type === "source-document"
    ) {
      const sourcePart = sanitizeSourcePart(rawPart);
      if (sourcePart) parts.push(sourcePart);
    }
  }

  while (jsonByteLength(parts) > MAX_MESSAGE_BYTES) {
    const outputIndex = parts.findLastIndex(
      (part) =>
        isToolConversationPart(part) &&
        part.state === "output-available" &&
        (!isRecord(part.output) || part.output.synced !== false)
    );
    if (outputIndex >= 0) {
      const outputPart = parts[outputIndex];
      if (
        outputPart &&
        isToolConversationPart(outputPart) &&
        outputPart.state === "output-available"
      ) {
        parts[outputIndex] = {
          ...outputPart,
          output: omittedToolPayload(
            "too_large",
            jsonByteLength(outputPart.output)
          ),
        };
        continue;
      }
    }
    const removableIndex = parts.findLastIndex(
      (part) => part.type !== "text" && part.type !== "file"
    );
    if (removableIndex < 0) break;
    parts.splice(removableIndex, 1);
  }
  return parts;
}

function getPartsText(parts: readonly AIConversationPart[]): string {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
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
    const parts = sanitizeMessageParts(candidate, role);
    if (parts.length === 0) continue;
    const text = getPartsText(parts);

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
    version: 2,
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

  const current = storedConversationV2Schema.safeParse(value);
  if (current.success && current.data.channel === channel) {
    return current.data as StoredConversation;
  }

  const legacy = storedConversationV1Schema.safeParse(value);
  if (legacy.success && legacy.data.channel === channel) {
    return {
      ...legacy.data,
      version: 2,
      messages: legacy.data.messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) => ({
          type: "text",
          text: part.text,
        })),
      })),
    };
  }

  throw new AIConversationError(
    "conversation_corrupt",
    503,
    "Stored conversation is invalid"
  );
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

function trimConversation(
  document: StoredConversation
): AIConversationMessage[] {
  let totalBytes = document.messages.reduce(
    (total, message) => total + jsonByteLength(message.parts),
    0
  );
  const removed: AIConversationMessage[] = [];

  while (
    document.messages.length > MAX_MESSAGES ||
    (totalBytes > MAX_CONVERSATION_BYTES && document.messages.length > 1)
  ) {
    const oldest = document.messages.shift();
    if (!oldest) break;
    totalBytes -= jsonByteLength(oldest.parts);
    removed.push(oldest);
  }

  if (removed.length > 0) document.historyTruncated = true;
  return removed;
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
): { changed: boolean; removedAttachmentIds: string[] } {
  const incomingMessages = sanitizeAIConversationMessages(messages);
  const byId = new Map(
    document.messages.map((message) => [message.id, message])
  );
  let changed = false;
  const removedAttachmentIds = new Set<string>();

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

    const incomingAttachmentIds = new Set(
      collectAIAttachmentIds([{ parts: incoming.parts }])
    );
    for (const attachmentId of collectAIAttachmentIds([
      { parts: existing.parts },
    ])) {
      if (!incomingAttachmentIds.has(attachmentId)) {
        removedAttachmentIds.add(attachmentId);
      }
    }
    existing.parts = incoming.parts;
    changed = true;
  }

  document.messages.sort((left, right) => left.seq - right.seq);
  for (const removed of trimConversation(document)) {
    for (const attachmentId of collectAIAttachmentIds([removed])) {
      removedAttachmentIds.add(attachmentId);
    }
  }
  const retainedAttachmentIds = new Set(
    collectAIAttachmentIds(document.messages)
  );
  return {
    changed,
    removedAttachmentIds: [...removedAttachmentIds].filter(
      (attachmentId) => !retainedAttachmentIds.has(attachmentId)
    ),
  };
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
): Promise<StoredConversation> {
  if (!input.operationId.trim() || input.operationId.length > 160) {
    throw new AIConversationError(
      "message_id_conflict",
      422,
      "Invalid operation id"
    );
  }

  let removedAttachmentIds: string[] = [];
  const document = await withConversationLock({
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

      const merged = mergeConversationMessages(document, input.messages);
      removedAttachmentIds = merged.removedAttachmentIds;
      if (input.turn?.action === "complete") {
        document.pendingTurnId = null;
        document.pendingTurnStartedAt = null;
      }
      appendOperation(document, input.operationId);
      document.legacyImportAllowed = false;
      if (merged.changed) {
        document.revision += 1;
        document.updatedAt = new Date().toISOString();
      }
      await saveConversation(
        input.redis,
        input.username,
        document,
        lockToken
      );
      return document;
    },
  });
  if (removedAttachmentIds.length > 0) {
    await deleteAIAttachments({
      redis: input.redis,
      username: input.username,
      attachmentIds: removedAttachmentIds,
    }).catch(() => 0);
  }
  return document;
}

export async function beginAIConversationTurn(
  input: BeginAIConversationTurnInput
): Promise<StoredConversation> {
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
  return writeAIConversationMessages({
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
  });
}

export async function importAIConversationMessages(
  input: ImportAIConversationMessagesInput
): Promise<StoredConversation> {
  return writeAIConversationMessages({
    ...input,
    requireEmpty: true,
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
  let removedAttachmentIds: string[] = [];
  const result = await withConversationLock({
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
      const removedMessages = document.messages.filter((message) =>
        target.role === "assistant"
          ? message.seq >= target.seq
          : message.seq > target.seq
      );
      document.messages = document.messages.filter((message) =>
        target.role === "assistant"
          ? message.seq < target.seq
          : message.seq <= target.seq
      );
      assertMessageRole(input.responseMessage, "assistant");
      const merged = mergeConversationMessages(document, [
        input.responseMessage,
      ]);
      const retainedAttachmentIds = new Set(
        collectAIAttachmentIds(document.messages)
      );
      removedAttachmentIds = [
        ...new Set([
          ...collectAIAttachmentIds(removedMessages),
          ...merged.removedAttachmentIds,
        ]),
      ].filter((attachmentId) => !retainedAttachmentIds.has(attachmentId));
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
  if (removedAttachmentIds.length > 0) {
    await deleteAIAttachments({
      redis: input.redis,
      username: input.username,
      attachmentIds: removedAttachmentIds,
    }).catch(() => 0);
  }
  return result;
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
  parts: Array<TextUIPart | FileUIPart>;
}> {
  return document.messages.flatMap((message) => {
    const parts = message.parts.filter(
      (part): part is TextUIPart | FileUIPart =>
        part.type === "text" || part.type === "file"
    );
    return parts.length > 0
      ? [{ id: message.id, role: message.role, parts }]
      : [];
  });
}

export function getAIConversationRegenerationModelMessages(
  document: StoredConversation,
  targetMessageId?: string
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: Array<TextUIPart | FileUIPart>;
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
  return retained.flatMap((message) => {
    const parts = message.parts.filter(
      (part): part is TextUIPart | FileUIPart =>
        part.type === "text" || part.type === "file"
    );
    return parts.length > 0
      ? [{ id: message.id, role: message.role, parts }]
      : [];
  });
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
