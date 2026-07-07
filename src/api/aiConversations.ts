import type { AIChatMessage } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  isAIConversationChannel,
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPart,
  type AIConversationRequestContext,
  type AIConversationSnapshot,
} from "@/shared/contracts/aiConversation";
import {
  AI_ATTACHMENT_MAX_BYTES,
  isAIAttachmentMediaType,
  parseAIAttachmentUrl,
} from "@/shared/contracts/aiAttachment";

interface ConversationSession {
  owner: string;
  conversation: AIConversation;
  /** Canonical server messages (with `seq`), sorted ascending. */
  serverMessages: AIConversationMessage[];
  /** The same messages projected for the AI SDK / UI. */
  messages: AIChatMessage[];
}

export interface AIConversationHydration {
  owner: string;
  conversation: AIConversation;
  messages: AIChatMessage[];
  stale: boolean;
}

interface LoadAIConversationInput {
  channel: AIConversationChannel;
  username: string;
  force?: boolean;
}

type ProjectedAIConversationMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
  metadata: { createdAt: string };
};

// Budgets for anonymous requests, which still ship the full local message
// history to `/api/chat` (authenticated requests send only the current
// action; the server owns the history).
const ANON_MAX_MESSAGE_BYTES = 700 * 1024;
const ANON_MAX_PARTS_PER_MESSAGE = 48;
const ANON_MAX_TEXT_CODE_POINTS = 128_000;
const ANON_TOOL_PAYLOAD_MAX_BYTES = 256 * 1024;
const ANON_TOOL_PAYLOAD_FIELDS = ["input", "output", "rawInput"] as const;
const VERCEL_AI_CONVERSATION_REQUEST_BYTES = 4 * 1024 * 1024;
export const AI_CONVERSATION_REQUEST_MAX_BYTES =
  VERCEL_AI_CONVERSATION_REQUEST_BYTES - 64 * 1024;
export const AI_CONVERSATION_TOOL_PAYLOAD_OMISSION = {
  omitted: true,
  reason: "oversized_legacy_tool_payload",
} as const;

const sessions = new Map<AIConversationChannel, ConversationSession>();
// Sessions that must be revalidated against the server before reuse. The
// cached messages stay usable as the base for an `afterSeq` delta read.
const staleSessions = new Set<AIConversationChannel>();
const pendingLoads = new Map<string, Promise<AIConversationHydration>>();
const generations = new Map<string, number>();
const activeOwners = new Map<AIConversationChannel, string>();
let cacheEpoch = 0;
const utf8Encoder = new TextEncoder();

// Operation ids minted by this device. Realtime `ai-conversation-updated`
// events echo the originating operation id, so tracking ours lets the sender
// skip re-hydrating for changes it already has (insertion order = age).
const MAX_TRACKED_LOCAL_OPERATIONS = 64;
const localOperationIds = new Set<string>();

export function trackLocalAIConversationOperation(operationId: string): void {
  localOperationIds.delete(operationId);
  localOperationIds.add(operationId);
  while (localOperationIds.size > MAX_TRACKED_LOCAL_OPERATIONS) {
    const oldest = localOperationIds.values().next().value;
    if (oldest === undefined) break;
    localOperationIds.delete(oldest);
  }
}

export function isLocalAIConversationOperation(operationId: string): boolean {
  return localOperationIds.has(operationId);
}

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
    typeof value.historyTruncated !== "boolean"
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

function parseSnapshot(value: unknown): AIConversationSnapshot {
  if (
    !isRecord(value) ||
    typeof value.owner !== "string" ||
    !Array.isArray(value.messages)
  ) {
    throw new Error("Invalid conversation snapshot response");
  }

  return {
    owner: value.owner.toLowerCase(),
    conversation: parseConversation(value.conversation),
    messages: value.messages.map(parseMessage),
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

async function fetchConversationSnapshot(
  channel: AIConversationChannel,
  afterSeq?: number
): Promise<AIConversationSnapshot> {
  const search = new URLSearchParams();
  if (afterSeq !== undefined && afterSeq > 0) {
    search.set("afterSeq", String(afterSeq));
  }
  const query = search.toString();
  const response = await abortableFetch(
    getApiUrl(`/api/ai/conversations/${channel}${query ? `?${query}` : ""}`),
    {
      timeout: 15_000,
      throwOnHttpError: false,
    }
  );
  if (!response.ok) {
    throw new Error(
      `Conversation request failed: ${await readErrorCode(response)}`
    );
  }
  return parseSnapshot(await response.json());
}

/**
 * Merge an `afterSeq` delta into the cached server message list. Returns
 * null when the merged list does not match the summary the server returned —
 * a structural change (reset / regeneration / trim) happened and the caller
 * must fall back to a full fetch.
 */
export function mergeAIConversationDelta(
  existing: readonly AIConversationMessage[],
  delta: AIConversationSnapshot
): AIConversationMessage[] | null {
  const byId = new Map(existing.map((message) => [message.id, message] as const));
  for (const message of delta.messages) {
    byId.set(message.id, message);
  }
  const merged = [...byId.values()].sort((left, right) => left.seq - right.seq);

  const summary = delta.conversation;
  const oldestSeq = merged[0]?.seq ?? null;
  const newestSeq = merged.at(-1)?.seq ?? null;
  if (
    merged.length !== summary.messageCount ||
    oldestSeq !== summary.oldestSeq ||
    newestSeq !== summary.newestSeq
  ) {
    return null;
  }
  return merged;
}

async function fetchSessionState(
  channel: AIConversationChannel,
  cached: ConversationSession | undefined,
  owner: string
): Promise<Omit<ConversationSession, "owner"> & { owner: string }> {
  // Delta read: ask only for messages newer than what we already have. A
  // structural change is detected from the returned summary and falls back
  // to one full fetch.
  if (cached && cached.owner === owner && cached.serverMessages.length > 0) {
    const lastSeq = cached.serverMessages.at(-1)!.seq;
    const delta = await fetchConversationSnapshot(channel, lastSeq);
    if (delta.owner === owner && delta.conversation.id === cached.conversation.id) {
      if (
        delta.conversation.revision === cached.conversation.revision &&
        delta.messages.length === 0
      ) {
        return { ...cached, conversation: delta.conversation };
      }
      const merged = mergeAIConversationDelta(cached.serverMessages, delta);
      if (merged) {
        return {
          owner: delta.owner,
          conversation: delta.conversation,
          serverMessages: merged,
          messages: merged.map(toAIChatMessage),
        };
      }
    }
  }

  const snapshot = await fetchConversationSnapshot(channel);
  return {
    owner: snapshot.owner,
    conversation: snapshot.conversation,
    serverMessages: snapshot.messages,
    messages: snapshot.messages.map(toAIChatMessage),
  };
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

function projectAIConversationMessages(
  messages: readonly AIChatMessage[]
): ProjectedAIConversationMessage[] {
  const projected: ProjectedAIConversationMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = message.parts
      .map(cloneConversationPart)
      .filter((part): part is AIConversationPart => part !== null);
    if (parts.length === 0) continue;
    projected.push({
      id: message.id,
      role: message.role,
      parts,
      metadata: {
        createdAt: normalizeCreatedAt(message.metadata?.createdAt),
      },
    });
  }
  return projected;
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

function compactAnonymousMessage(
  message: ProjectedAIConversationMessage
): ProjectedAIConversationMessage {
  const payloads: Array<{
    part: Record<string, unknown>;
    field: (typeof ANON_TOOL_PAYLOAD_FIELDS)[number];
    bytes: number;
    omitted: boolean;
  }> = [];

  const parts = message.parts.map((part) => {
    if (!isToolPart(part)) return part;
    const cloned: Record<string, unknown> = { ...part };
    for (const field of ANON_TOOL_PAYLOAD_FIELDS) {
      if (!Object.hasOwn(cloned, field)) continue;
      if (cloned[field] === undefined) continue;
      const bytes = jsonByteLength(cloned[field]);
      const payload = { part: cloned, field, bytes, omitted: false };
      payloads.push(payload);
      if (bytes > ANON_TOOL_PAYLOAD_MAX_BYTES) {
        cloned[field] = createToolPayloadOmission();
        payload.omitted = true;
      }
    }
    return cloned as AIConversationPart;
  });

  let partsBytes = jsonByteLength(parts);
  if (partsBytes > ANON_MAX_MESSAGE_BYTES) {
    const remainingPayloads = payloads
      .filter((payload) => !payload.omitted)
      .sort((left, right) => right.bytes - left.bytes);
    for (const payload of remainingPayloads) {
      payload.part[payload.field] = createToolPayloadOmission();
      partsBytes = jsonByteLength(parts);
      if (partsBytes <= ANON_MAX_MESSAGE_BYTES) break;
    }
  }

  return { ...message, parts };
}

function fitsAnonymousMessageBudget(
  message: ProjectedAIConversationMessage
): boolean {
  const text = message.parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : []
    )
    .join("\n");
  return (
    message.parts.length <= ANON_MAX_PARTS_PER_MESSAGE &&
    [...text].length <= ANON_MAX_TEXT_CODE_POINTS &&
    jsonByteLength(message.parts) <= ANON_MAX_MESSAGE_BYTES
  );
}

function groupConversationTurns(
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

function buildAnonymousAIConversationRequestBody({
  common,
  messages,
}: {
  common: Record<string, unknown>;
  messages: readonly AIChatMessage[];
}): Record<string, unknown> {
  const projected = projectAIConversationMessages(messages).map(
    compactAnonymousMessage
  );
  const turns = groupConversationTurns(projected);
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
    const turn = turns[index];
    if (!turn.every(fitsAnonymousMessageBudget)) break;
    const candidateMessages = [...turn, ...selectedMessages];
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
    return buildAnonymousAIConversationRequestBody({ common, messages });
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

export async function loadAIConversation(
  input: LoadAIConversationInput
): Promise<AIConversationHydration> {
  const owner = input.username.toLowerCase();
  const key = sessionKey(owner, input.channel);
  activeOwners.set(input.channel, owner);
  const cached = sessions.get(input.channel);
  if (
    !input.force &&
    cached?.owner === owner &&
    !staleSessions.has(input.channel)
  ) {
    return {
      owner: cached.owner,
      conversation: cached.conversation,
      messages: cached.messages,
      stale: false,
    };
  }

  const existingLoad = pendingLoads.get(key);
  if (existingLoad) return existingLoad;

  const generation = getGeneration(key);
  const loadEpoch = cacheEpoch;
  const load = (async (): Promise<AIConversationHydration> => {
    const loaded = await fetchSessionState(
      input.channel,
      cached?.owner === owner ? cached : undefined,
      owner
    );
    if (loaded.owner !== owner) {
      throw new Error("Authenticated conversation owner changed");
    }

    const session: ConversationSession = {
      owner,
      conversation: loaded.conversation,
      serverMessages: loaded.serverMessages,
      messages: loaded.messages,
    };
    if (
      loadEpoch !== cacheEpoch ||
      generation !== getGeneration(key) ||
      activeOwners.get(input.channel) !== owner
    ) {
      const current = sessions.get(input.channel);
      const winner = current?.owner === owner ? current : session;
      return {
        owner: winner.owner,
        conversation: winner.conversation,
        messages: winner.messages,
        stale: true,
      };
    }
    sessions.set(input.channel, session);
    staleSessions.delete(input.channel);
    return {
      owner: session.owner,
      conversation: session.conversation,
      messages: session.messages,
      stale: false,
    };
  })().finally(() => {
    if (pendingLoads.get(key) === load) pendingLoads.delete(key);
  });

  pendingLoads.set(key, load);
  return load;
}

export async function getAIConversationRequestContext({
  channel,
  username,
}: {
  channel: AIConversationChannel;
  username: string | null;
}): Promise<AIConversationRequestContext | undefined> {
  if (!username) return undefined;
  const session = await loadAIConversation({
    channel,
    username,
  });
  if (session.stale) {
    throw new Error("Conversation changed while preparing the request");
  }
  const operationId = crypto.randomUUID();
  trackLocalAIConversationOperation(operationId);
  return {
    id: session.conversation.id,
    revision: session.conversation.revision,
    operationId,
  };
}

export async function resetAIConversationSession({
  channel,
  username,
}: {
  channel: AIConversationChannel;
  username: string;
}): Promise<AIConversation> {
  const owner = username.toLowerCase();
  const key = sessionKey(owner, channel);
  let session = await loadAIConversation({
    channel,
    username: owner,
  });
  if (session.stale) {
    throw new Error("Conversation changed while resetting");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestEpoch = cacheEpoch;
    const requestGeneration = incrementGeneration(key);
    const resetOperationId = crypto.randomUUID();
    trackLocalAIConversationOperation(resetOperationId);
    const response = await abortableFetch(
      getApiUrl(`/api/ai/conversations/${channel}/reset`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: session.conversation.id,
          operationId: resetOperationId,
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
          force: true,
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
    sessions.set(channel, {
      owner,
      conversation,
      serverMessages: [],
      messages: [],
    });
    staleSessions.delete(channel);
    return conversation;
  }

  throw new Error("Conversation reset failed after refreshing");
}

export function getAIConversationSessionSnapshot(
  channel: AIConversationChannel
): { owner: string; conversation: AIConversation } | null {
  const session = sessions.get(channel);
  if (!session) return null;
  return { owner: session.owner, conversation: session.conversation };
}

export function clearAIConversationSessionCache(): void {
  cacheEpoch += 1;
  sessions.clear();
  staleSessions.clear();
  pendingLoads.clear();
  activeOwners.clear();
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
  if (!session) return;
  if (username && session.owner !== username.toLowerCase()) return;
  // Keep the messages as a delta base; the next load revalidates via
  // `afterSeq` instead of a full refetch.
  staleSessions.add(channel);
}
