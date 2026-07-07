import type { AIChatMessage } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  isAIConversationChannel,
  isAIProactiveGreetingMessageId,
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPage,
  type AIConversationPart,
  type AIConversationRequestContext,
} from "@/shared/contracts/aiConversation";
import {
  AI_ATTACHMENT_MAX_BYTES,
  isAIAttachmentMediaType,
  parseAIAttachmentUrl,
} from "@/shared/contracts/aiAttachment";

interface ConversationSession {
  owner: string;
  conversation: AIConversation;
  messages: AIChatMessage[];
}

export interface AIConversationHydration extends ConversationSession {
  stale: boolean;
}

interface LoadAIConversationInput {
  channel: AIConversationChannel;
  username: string;
  localMessages: readonly AIChatMessage[];
  force?: boolean;
  importLocalIfEmpty?: boolean;
}

type ProjectedAIConversationMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
  metadata: { createdAt: string };
};

export interface AIConversationImportRequestBody {
  conversationId: string;
  expectedRevision: number;
  operationId: string;
  messages: ProjectedAIConversationMessage[];
  historyTruncated: boolean;
}

const LEGACY_IMPORT_MAX_MESSAGES = 200;
const LEGACY_IMPORT_MAX_MESSAGE_BYTES = 700 * 1024;
const LEGACY_IMPORT_MAX_PARTS_PER_MESSAGE = 48;
const LEGACY_IMPORT_MAX_TEXT_CODE_POINTS = 128_000;
const LEGACY_TOOL_PAYLOAD_MAX_BYTES = 256 * 1024;
const LEGACY_TOOL_PAYLOAD_FIELDS = ["input", "output", "rawInput"] as const;
const VERCEL_AI_CONVERSATION_REQUEST_BYTES = 4 * 1024 * 1024;
export const AI_CONVERSATION_REQUEST_MAX_BYTES =
  VERCEL_AI_CONVERSATION_REQUEST_BYTES - 64 * 1024;
export const AI_CONVERSATION_IMPORT_REQUEST_MAX_BYTES =
  AI_CONVERSATION_REQUEST_MAX_BYTES;
export const AI_CONVERSATION_TOOL_PAYLOAD_OMISSION = {
  omitted: true,
  reason: "oversized_legacy_tool_payload",
} as const;

const sessions = new Map<AIConversationChannel, ConversationSession>();
const pendingLoads = new Map<string, Promise<AIConversationHydration>>();
const generations = new Map<string, number>();
const activeOwners = new Map<AIConversationChannel, string>();
const localOperationIds = new Map<string, string[]>();
const MAX_LOCAL_OPERATION_IDS = 64;
let cacheEpoch = 0;
const utf8Encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sessionKey(username: string, channel: AIConversationChannel): string {
  return `${username.toLowerCase()}:${channel}`;
}

function getGeneration(key: string): number {
  return generations.get(key) ?? 0;
}

function incrementGeneration(key: string): number {
  const next = getGeneration(key) + 1;
  generations.set(key, next);
  return next;
}

function createLocalOperationId(
  owner: string,
  channel: AIConversationChannel
): string {
  const operationId = crypto.randomUUID();
  const key = sessionKey(owner, channel);
  localOperationIds.set(
    key,
    [...(localOperationIds.get(key) ?? []), operationId].slice(
      -MAX_LOCAL_OPERATION_IDS
    )
  );
  return operationId;
}

export function isLocalAIConversationOperation(
  channel: AIConversationChannel,
  username: string,
  operationId: string
): boolean {
  return (
    localOperationIds
      .get(sessionKey(username.toLowerCase(), channel))
      ?.includes(operationId) ?? false
  );
}

export function getCachedAIConversationIdentity(
  channel: AIConversationChannel,
  username: string
): Pick<AIConversation, "id" | "revision"> | null {
  const session = sessions.get(channel);
  if (!session || session.owner !== username.toLowerCase()) return null;
  return {
    id: session.conversation.id,
    revision: session.conversation.revision,
  };
}

function parseConversation(value: unknown): AIConversation {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isAIConversationChannel(value.channel) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.messageCount !== "number" ||
    !Number.isSafeInteger(value.messageCount) ||
    value.messageCount < 0 ||
    (value.oldestSeq !== null &&
      (typeof value.oldestSeq !== "number" ||
        !Number.isSafeInteger(value.oldestSeq))) ||
    (value.newestSeq !== null &&
      (typeof value.newestSeq !== "number" ||
        !Number.isSafeInteger(value.newestSeq))) ||
    typeof value.historyTruncated !== "boolean" ||
    typeof value.canImportLegacy !== "boolean"
  ) {
    throw new Error("Invalid conversation response");
  }

  return {
    id: value.id,
    channel: value.channel,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messageCount: value.messageCount,
    oldestSeq: value.oldestSeq,
    newestSeq: value.newestSeq,
    historyTruncated: value.historyTruncated,
    canImportLegacy: value.canImportLegacy,
  };
}

function parseMessage(value: unknown): AIConversationMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.seq !== "number" ||
    !Number.isSafeInteger(value.seq) ||
    value.seq < 1 ||
    (value.role !== "user" && value.role !== "assistant") ||
    !Array.isArray(value.parts) ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error("Invalid conversation message response");
  }

  if (
    !value.parts.every(
      (part) => isRecord(part) && typeof part.type === "string"
    )
  ) {
    throw new Error("Invalid conversation message part");
  }

  return {
    id: value.id,
    seq: value.seq,
    role: value.role,
    parts: value.parts as AIConversationPart[],
    createdAt: value.createdAt,
  };
}

function parsePage(value: unknown): AIConversationPage {
  if (
    !isRecord(value) ||
    typeof value.owner !== "string" ||
    !Array.isArray(value.messages) ||
    !isRecord(value.page) ||
    (value.page.nextCursor !== null &&
      typeof value.page.nextCursor !== "string") ||
    typeof value.page.hasMore !== "boolean"
  ) {
    throw new Error("Invalid conversation page response");
  }

  return {
    owner: value.owner.toLowerCase(),
    conversation: parseConversation(value.conversation),
    messages: value.messages.map(parseMessage),
    page: {
      nextCursor: value.page.nextCursor,
      hasMore: value.page.hasMore,
    },
  };
}

function toAIChatMessage(message: AIConversationMessage): AIChatMessage {
  const timestamp = new Date(message.createdAt);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Invalid conversation message timestamp");
  }
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map((part) =>
      part.type === "file" && parseAIAttachmentUrl(part.url)
        ? { ...part, url: getApiUrl(part.url) }
        : part
    ),
    metadata: { createdAt: timestamp },
  };
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && typeof value.error === "string") {
      return value.error;
    }
  } catch {
    // Fall through to the HTTP status.
  }
  return `http_${response.status}`;
}

class AIConversationPageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`Conversation request failed: ${code}`);
    this.name = "AIConversationPageError";
  }
}

async function requestConversationPage(
  channel: AIConversationChannel,
  cursor?: string
): Promise<AIConversationPage> {
  const search = new URLSearchParams({ limit: "100" });
  if (cursor) search.set("cursor", cursor);
  const response = await abortableFetch(
    getApiUrl(`/api/ai/conversations/${channel}?${search.toString()}`),
    {
      timeout: 15_000,
      throwOnHttpError: false,
    }
  );
  if (!response.ok) {
    throw new AIConversationPageError(
      response.status,
      await readErrorCode(response)
    );
  }
  return parsePage(await response.json());
}

async function fetchCompleteConversation(
  channel: AIConversationChannel
): Promise<{
  owner: string;
  conversation: AIConversation;
  messages: AIChatMessage[];
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const newest = await requestConversationPage(channel);
    const pages: AIConversationMessage[][] = [newest.messages];
    let cursor = newest.page.nextCursor;
    let changedWhilePaging = false;

    while (cursor) {
      let older: AIConversationPage;
      try {
        older = await requestConversationPage(channel, cursor);
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof AIConversationPageError &&
          error.status === 409 &&
          (error.code === "conversation_changed" ||
            error.code === "revision_conflict")
        ) {
          changedWhilePaging = true;
          break;
        }
        throw error;
      }
      if (
        older.owner !== newest.owner ||
        older.conversation.id !== newest.conversation.id ||
        older.conversation.revision !== newest.conversation.revision
      ) {
        changedWhilePaging = true;
        break;
      }
      pages.unshift(older.messages);
      cursor = older.page.nextCursor;
    }

    if (!changedWhilePaging) {
      return {
        owner: newest.owner,
        conversation: newest.conversation,
        messages: pages.flat().map(toAIChatMessage),
      };
    }
  }

  throw new Error("Conversation changed while loading");
}

function normalizeCreatedAt(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

export async function uploadAIConversationImage(
  dataUrl: string
): Promise<{ mediaType: string; url: string }> {
  const match = /^data:([^;,]+);base64,/.exec(dataUrl);
  const mediaType = match?.[1];
  if (!isAIAttachmentMediaType(mediaType)) {
    throw new Error("Unsupported AI conversation image type");
  }
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size <= 0 || blob.size > AI_ATTACHMENT_MAX_BYTES) {
    throw new Error("AI conversation image exceeds the upload limit");
  }

  const response = await abortableFetch(getApiUrl("/api/ai/attachments"), {
    method: "POST",
    headers: { "Content-Type": mediaType },
    body: blob,
    timeout: 30_000,
  });
  const result: unknown = await response.json();
  if (
    !isRecord(result) ||
    typeof result.url !== "string" ||
    result.mediaType !== mediaType
  ) {
    throw new Error("Invalid AI attachment response");
  }
  return { mediaType, url: getApiUrl(result.url) };
}

function cloneConversationPart(
  part: AIChatMessage["parts"][number]
): AIConversationPart | null {
  try {
    const cloned: unknown = JSON.parse(JSON.stringify(part));
    return isRecord(cloned) && typeof cloned.type === "string"
      ? (cloned as AIConversationPart)
      : null;
  } catch {
    return null;
  }
}

function projectAIConversationMessagesWithStatus(
  messages: readonly AIChatMessage[]
): {
  messages: ProjectedAIConversationMessage[];
  historyTruncated: boolean;
} {
  const projected: ProjectedAIConversationMessage[] = [];
  let historyTruncated = false;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      historyTruncated = true;
      continue;
    }
    const clonedParts = message.parts.map(cloneConversationPart);
    const parts = clonedParts.filter(
      (part): part is AIConversationPart => part !== null
    );
    if (parts.length !== clonedParts.length) historyTruncated = true;
    if (parts.length === 0) {
      historyTruncated = true;
      continue;
    }
    projected.push({
      id: message.id,
      role: message.role,
      parts,
      metadata: {
        createdAt: normalizeCreatedAt(message.metadata?.createdAt),
      },
    });
  }
  return { messages: projected, historyTruncated };
}

export function projectAIConversationMessages(
  messages: readonly AIChatMessage[]
): ProjectedAIConversationMessage[] {
  return projectAIConversationMessagesWithStatus(messages).messages;
}

function jsonByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? Number.POSITIVE_INFINITY
      : utf8Encoder.encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isToolPart(part: AIConversationPart): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function createToolPayloadOmission(): typeof AI_CONVERSATION_TOOL_PAYLOAD_OMISSION {
  return { ...AI_CONVERSATION_TOOL_PAYLOAD_OMISSION };
}

function compactLegacyImportMessage(
  message: ProjectedAIConversationMessage
): {
  message: ProjectedAIConversationMessage;
  payloadTruncated: boolean;
  fitsMessageBudget: boolean;
} {
  const payloads: Array<{
    part: Record<string, unknown>;
    field: (typeof LEGACY_TOOL_PAYLOAD_FIELDS)[number];
    bytes: number;
    omitted: boolean;
  }> = [];
  let payloadTruncated = false;

  const parts = message.parts.map((part) => {
    if (!isToolPart(part)) return part;
    const cloned: Record<string, unknown> = { ...part };
    for (const field of LEGACY_TOOL_PAYLOAD_FIELDS) {
      if (!Object.hasOwn(cloned, field)) continue;
      if (cloned[field] === undefined) continue;
      const bytes = jsonByteLength(cloned[field]);
      const payload = { part: cloned, field, bytes, omitted: false };
      payloads.push(payload);
      if (bytes > LEGACY_TOOL_PAYLOAD_MAX_BYTES) {
        cloned[field] = createToolPayloadOmission();
        payload.omitted = true;
        payloadTruncated = true;
      }
    }
    return cloned as AIConversationPart;
  });

  let partsBytes = jsonByteLength(parts);
  if (partsBytes > LEGACY_IMPORT_MAX_MESSAGE_BYTES) {
    const remainingPayloads = payloads
      .filter((payload) => !payload.omitted)
      .sort((left, right) => right.bytes - left.bytes);
    for (const payload of remainingPayloads) {
      payload.part[payload.field] = createToolPayloadOmission();
      payloadTruncated = true;
      partsBytes = jsonByteLength(parts);
      if (partsBytes <= LEGACY_IMPORT_MAX_MESSAGE_BYTES) break;
    }
  }

  const text = parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : []
    )
    .join("\n");
  const fitsMessageBudget =
    parts.length <= LEGACY_IMPORT_MAX_PARTS_PER_MESSAGE &&
    [...text].length <= LEGACY_IMPORT_MAX_TEXT_CODE_POINTS &&
    partsBytes <= LEGACY_IMPORT_MAX_MESSAGE_BYTES;
  return {
    message: { ...message, parts },
    payloadTruncated,
    fitsMessageBudget,
  };
}

function groupLegacyImportTurns(
  messages: readonly ProjectedAIConversationMessage[]
): ProjectedAIConversationMessage[][] {
  const turns: ProjectedAIConversationMessage[][] = [];
  let current: ProjectedAIConversationMessage[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

export function buildAIConversationImportRequest({
  conversationId,
  expectedRevision = 0,
  operationId,
  messages,
  requestByteLimit = AI_CONVERSATION_IMPORT_REQUEST_MAX_BYTES,
}: {
  conversationId: string;
  expectedRevision?: number;
  operationId: string;
  messages: readonly AIChatMessage[];
  requestByteLimit?: number;
}): AIConversationImportRequestBody {
  const projection = projectAIConversationMessagesWithStatus(messages);
  const projected = projection.messages;
  const turns = groupLegacyImportTurns(projected).map((turn) => {
    const compacted = turn.map(compactLegacyImportMessage);
    return {
      messages: compacted.map((entry) => entry.message),
      payloadTruncated: compacted.some((entry) => entry.payloadTruncated),
      fitsMessageBudget: compacted.every((entry) => entry.fitsMessageBudget),
    };
  });

  let selected: ProjectedAIConversationMessage[] = [];
  let selectedPayloadTruncated = false;
  let omittedHistory = false;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn.fitsMessageBudget) {
      omittedHistory = true;
      break;
    }

    const candidateMessages = [...turn.messages, ...selected];
    const candidatePayloadTruncated: boolean =
      projection.historyTruncated ||
      selectedPayloadTruncated ||
      turn.payloadTruncated;
    const candidate: AIConversationImportRequestBody = {
      conversationId,
      expectedRevision,
      operationId,
      messages: candidateMessages,
      historyTruncated: candidatePayloadTruncated,
    };
    if (
      candidateMessages.length > LEGACY_IMPORT_MAX_MESSAGES ||
      jsonByteLength(candidate) > requestByteLimit
    ) {
      omittedHistory = true;
      break;
    }

    selected = candidateMessages;
    selectedPayloadTruncated = candidatePayloadTruncated;
  }

  const historyTruncated =
    projection.historyTruncated ||
    selectedPayloadTruncated ||
    omittedHistory ||
    selected.length !== projected.length;
  const request: AIConversationImportRequestBody = {
    conversationId,
    expectedRevision,
    operationId,
    messages: selected,
    historyTruncated,
  };
  if (jsonByteLength(request) > requestByteLimit) {
    throw new Error("Conversation import envelope exceeds its request limit");
  }
  if (
    messages.some((message) => message.role === "user") &&
    !request.messages.some((message) => message.role === "user")
  ) {
    throw new Error("Conversation import could not retain a user turn");
  }
  return request;
}

async function externalizeLocalImages(
  messages: readonly AIChatMessage[]
): Promise<AIChatMessage[]> {
  const uploads = new Map<string, Promise<{ mediaType: string; url: string }>>();
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file" || !part.url.startsWith("data:")) return part;
          let upload = uploads.get(part.url);
          if (!upload) {
            upload = uploadAIConversationImage(part.url);
            uploads.set(part.url, upload);
          }
          const stored = await upload;
          return { ...part, ...stored };
        })
      ),
    }))
  );
}

function buildLegacyAIConversationRequestBody({
  common,
  messages,
}: {
  common: Record<string, unknown>;
  messages: readonly AIChatMessage[];
}): Record<string, unknown> {
  const projected = projectAIConversationMessagesWithStatus(messages).messages;
  const turns = groupLegacyImportTurns(
    projected.map((message) => compactLegacyImportMessage(message).message)
  );
  let requiredUser: AIChatMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      requiredUser = message;
      break;
    }
  }
  const newestTurn = turns.at(-1);

  if (
    requiredUser &&
    !newestTurn?.some((message) => message.id === requiredUser.id)
  ) {
    throw new Error("Current user turn could not be prepared safely");
  }

  if (!newestTurn) {
    const request = { ...common, messages: [] };
    if (jsonByteLength(request) > AI_CONVERSATION_REQUEST_MAX_BYTES) {
      throw new Error("AI conversation request exceeds the safe request limit");
    }
    return request;
  }

  let selectedMessages = [...newestTurn];
  let request = { ...common, messages: selectedMessages };
  if (jsonByteLength(request) > AI_CONVERSATION_REQUEST_MAX_BYTES) {
    throw new Error(
      "Current conversation turn exceeds the safe AI request limit"
    );
  }

  for (let index = turns.length - 2; index >= 0; index -= 1) {
    const candidateMessages = [...turns[index], ...selectedMessages];
    const candidate = { ...common, messages: candidateMessages };
    if (jsonByteLength(candidate) > AI_CONVERSATION_REQUEST_MAX_BYTES) break;
    selectedMessages = candidateMessages;
    request = candidate;
  }

  return request;
}

export function buildAIConversationRequestBody({
  body,
  id,
  messages,
  trigger,
  messageId,
  conversation,
}: {
  body?: Record<string, unknown>;
  id: string;
  messages: readonly AIChatMessage[];
  trigger: "submit-message" | "regenerate-message";
  messageId?: string;
  conversation?: AIConversationRequestContext;
}): Record<string, unknown> {
  const common = {
    ...body,
    id,
    trigger,
    ...(messageId ? { messageId } : {}),
  };
  if (!conversation) {
    return buildLegacyAIConversationRequestBody({ common, messages });
  }
  if (trigger === "regenerate-message") {
    return { ...common, conversation };
  }

  const message = messages.at(-1);
  if (!message) {
    throw new Error("Conversation action is missing its current message");
  }
  return { ...common, conversation, message };
}

async function importLocalConversation(
  channel: AIConversationChannel,
  owner: string,
  conversation: AIConversation,
  messages: readonly AIChatMessage[]
): Promise<void> {
  const operationId = createLocalOperationId(owner, channel);
  const request = buildAIConversationImportRequest({
    conversationId: conversation.id,
    expectedRevision: conversation.revision,
    operationId,
    messages: await externalizeLocalImages(messages),
  });
  if (!request.messages.some((message) => message.role === "user")) return;

  const response = await abortableFetch(
    getApiUrl(`/api/ai/conversations/${channel}/import`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      timeout: 15_000,
      throwOnHttpError: false,
    }
  );
  if (!response.ok) {
    const code = await readErrorCode(response);
    if (
      code === "conversation_not_empty" ||
      code === "revision_conflict" ||
      code === "conversation_changed"
    ) {
      return;
    }
    throw new Error(`Conversation import failed: ${code}`);
  }
}

export async function loadAIConversation(
  input: LoadAIConversationInput
): Promise<AIConversationHydration> {
  const owner = input.username.toLowerCase();
  const key = sessionKey(owner, input.channel);
  activeOwners.set(input.channel, owner);
  const cached = sessions.get(input.channel);
  if (!input.force && cached?.owner === owner) {
    return { ...cached, stale: false };
  }

  const existingLoad = pendingLoads.get(key);
  if (existingLoad) return existingLoad;

  const generation = getGeneration(key);
  const loadEpoch = cacheEpoch;
  const load = (async (): Promise<AIConversationHydration> => {
    let loaded = await fetchCompleteConversation(input.channel);
    if (loaded.owner !== owner) {
      throw new Error("Authenticated conversation owner changed");
    }
    if (
      loadEpoch !== cacheEpoch ||
      generation !== getGeneration(key) ||
      activeOwners.get(input.channel) !== owner
    ) {
      const current = sessions.get(input.channel);
      return current?.owner === owner
        ? { ...current, stale: true }
        : { ...loaded, stale: true };
    }
    // Legacy import is allowed while the server has no real content: an empty
    // conversation, or one whose only messages are server-generated proactive
    // greetings (the server drops those in favor of the imported history).
    if (
      input.importLocalIfEmpty !== false &&
      loaded.conversation.canImportLegacy &&
      loaded.messages.every(
        (message) =>
          message.role === "assistant" &&
          isAIProactiveGreetingMessageId(message.id)
      )
    ) {
      await importLocalConversation(
        input.channel,
        owner,
        loaded.conversation,
        input.localMessages
      );
      loaded = await fetchCompleteConversation(input.channel);
    }
    if (loaded.owner !== owner) {
      throw new Error("Authenticated conversation owner changed");
    }

    const session: ConversationSession = {
      owner,
      conversation: loaded.conversation,
      messages: loaded.messages,
    };
    if (
      loadEpoch !== cacheEpoch ||
      generation !== getGeneration(key) ||
      activeOwners.get(input.channel) !== owner
    ) {
      const current = sessions.get(input.channel);
      return current?.owner === owner
        ? { ...current, stale: true }
        : { ...session, stale: true };
    }
    sessions.set(input.channel, session);
    return { ...session, stale: false };
  })().finally(() => {
    if (pendingLoads.get(key) === load) pendingLoads.delete(key);
  });

  pendingLoads.set(key, load);
  return load;
}

export async function getAIConversationRequestContext({
  channel,
  username,
  localMessages,
}: {
  channel: AIConversationChannel;
  username: string | null;
  localMessages: readonly AIChatMessage[];
}): Promise<AIConversationRequestContext | undefined> {
  if (!username) return undefined;
  const session = await loadAIConversation({
    channel,
    username,
    localMessages,
  });
  if (session.stale) {
    throw new Error("Conversation changed while preparing the request");
  }
  const operationId = createLocalOperationId(username.toLowerCase(), channel);
  return {
    id: session.conversation.id,
    revision: session.conversation.revision,
    operationId,
  };
}

export async function resetAIConversationSession({
  channel,
  username,
  localMessages,
}: {
  channel: AIConversationChannel;
  username: string;
  localMessages: readonly AIChatMessage[];
}): Promise<AIConversation> {
  const owner = username.toLowerCase();
  const key = sessionKey(owner, channel);
  let session = await loadAIConversation({
    channel,
    username: owner,
    localMessages,
  });
  if (session.stale) {
    throw new Error("Conversation changed while resetting");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestEpoch = cacheEpoch;
    const requestGeneration = incrementGeneration(key);
    const operationId = createLocalOperationId(owner, channel);
    const response = await abortableFetch(
      getApiUrl(`/api/ai/conversations/${channel}/reset`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: session.conversation.id,
          operationId,
        }),
        timeout: 15_000,
        throwOnHttpError: false,
      }
    );
    if (!response.ok) {
      const code = await readErrorCode(response);
      if (
        attempt === 0 &&
        (code === "conversation_changed" || code === "revision_conflict")
      ) {
        invalidateAIConversationSession(channel, owner);
        session = await loadAIConversation({
          channel,
          username: owner,
          localMessages: [],
          force: true,
          importLocalIfEmpty: false,
        });
        if (session.stale) {
          throw new Error("Conversation changed while resetting");
        }
        continue;
      }
      throw new Error(`Conversation reset failed: ${code}`);
    }

    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      typeof value.owner !== "string" ||
      value.owner.toLowerCase() !== owner
    ) {
      throw new Error("Invalid conversation reset response");
    }
    const conversation = parseConversation(value.conversation);
    if (
      requestEpoch !== cacheEpoch ||
      requestGeneration !== getGeneration(key) ||
      activeOwners.get(channel) !== owner
    ) {
      throw new Error("Conversation changed while resetting");
    }
    incrementGeneration(key);
    sessions.set(channel, { owner, conversation, messages: [] });
    return conversation;
  }

  throw new Error("Conversation reset failed after refreshing");
}

export function clearAIConversationSessionCache(): void {
  cacheEpoch += 1;
  sessions.clear();
  pendingLoads.clear();
  activeOwners.clear();
  localOperationIds.clear();
}

export function invalidateAIConversationSession(
  channel: AIConversationChannel,
  username?: string | null
): void {
  const session = sessions.get(channel);
  const owner =
    username?.toLowerCase() ??
    session?.owner ??
    activeOwners.get(channel) ??
    null;
  if (owner) {
    const key = sessionKey(owner, channel);
    incrementGeneration(key);
    pendingLoads.delete(key);
  }
  if (
    !session ||
    !username ||
    session.owner === username.toLowerCase()
  ) {
    sessions.delete(channel);
  }
}
