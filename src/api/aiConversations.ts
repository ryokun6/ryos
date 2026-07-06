import type { AIChatMessage } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  isAIConversationChannel,
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPage,
  type AIConversationRequestContext,
} from "@/shared/contracts/aiConversation";

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

const sessions = new Map<AIConversationChannel, ConversationSession>();
const pendingLoads = new Map<string, Promise<AIConversationHydration>>();
const generations = new Map<string, number>();
const activeOwners = new Map<AIConversationChannel, string>();

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

  const parts = value.parts.map((part) => {
    if (
      !isRecord(part) ||
      part.type !== "text" ||
      typeof part.text !== "string"
    ) {
      throw new Error("Invalid conversation message part");
    }
    return { type: "text" as const, text: part.text };
  });

  return {
    id: value.id,
    seq: value.seq,
    role: value.role,
    parts,
    createdAt: value.createdAt,
  };
}

function parsePage(value: unknown): AIConversationPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.messages) ||
    !isRecord(value.page) ||
    (value.page.nextCursor !== null &&
      typeof value.page.nextCursor !== "string") ||
    typeof value.page.hasMore !== "boolean"
  ) {
    throw new Error("Invalid conversation page response");
  }

  return {
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
    parts: message.parts,
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
    throw new Error(
      `Conversation request failed: ${await readErrorCode(response)}`
    );
  }
  return parsePage(await response.json());
}

async function fetchCompleteConversation(
  channel: AIConversationChannel
): Promise<{
  conversation: AIConversation;
  messages: AIChatMessage[];
}> {
  const newest = await requestConversationPage(channel);
  const pages: AIConversationMessage[][] = [newest.messages];
  let cursor = newest.page.nextCursor;

  while (cursor) {
    const older = await requestConversationPage(channel, cursor);
    if (older.conversation.id !== newest.conversation.id) {
      throw new Error("Conversation changed while loading");
    }
    pages.unshift(older.messages);
    cursor = older.page.nextCursor;
  }

  return {
    conversation: newest.conversation,
    messages: pages.flat().map(toAIChatMessage),
  };
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

export function projectAIConversationMessages(
  messages: readonly AIChatMessage[]
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
  metadata: { createdAt: string };
}> {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text = message.parts
      .flatMap((part) =>
        part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : []
      )
      .join("\n")
      .trim();
    if (!text) return [];
    return [
      {
        id: message.id,
        role: message.role,
        parts: [{ type: "text" as const, text }],
        metadata: {
          createdAt: normalizeCreatedAt(message.metadata?.createdAt),
        },
      },
    ];
  });
}

async function importLocalConversation(
  channel: AIConversationChannel,
  conversation: AIConversation,
  messages: readonly AIChatMessage[]
): Promise<void> {
  const projected = projectAIConversationMessages(messages);
  if (!projected.some((message) => message.role === "user")) return;

  const response = await abortableFetch(
    getApiUrl(`/api/ai/conversations/${channel}/import`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        expectedRevision: 0,
        operationId: crypto.randomUUID(),
        messages: projected.slice(-200),
      }),
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
  const load = (async (): Promise<AIConversationHydration> => {
    let loaded = await fetchCompleteConversation(input.channel);
    if (
      input.importLocalIfEmpty !== false &&
      loaded.conversation.revision === 0 &&
      loaded.messages.length === 0
    ) {
      await importLocalConversation(
        input.channel,
        loaded.conversation,
        input.localMessages
      );
      loaded = await fetchCompleteConversation(input.channel);
    }

    const session: ConversationSession = {
      owner,
      conversation: loaded.conversation,
      messages: loaded.messages,
    };
    if (
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
  return {
    id: session.conversation.id,
    operationId: crypto.randomUUID(),
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
  const session = await loadAIConversation({
    channel,
    username: owner,
    localMessages,
  });
  const generation = incrementGeneration(key);

  const response = await abortableFetch(
    getApiUrl(`/api/ai/conversations/${channel}/reset`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: session.conversation.id,
        operationId: crypto.randomUUID(),
      }),
      timeout: 15_000,
      throwOnHttpError: false,
    }
  );
  if (!response.ok) {
    throw new Error(
      `Conversation reset failed: ${await readErrorCode(response)}`
    );
  }

  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error("Invalid conversation reset response");
  const conversation = parseConversation(value.conversation);
  if (generation !== getGeneration(key)) {
    throw new Error("Conversation changed while resetting");
  }
  sessions.set(channel, { owner, conversation, messages: [] });
  return conversation;
}

export function clearAIConversationSessionCache(): void {
  sessions.clear();
  pendingLoads.clear();
  generations.clear();
  activeOwners.clear();
}
