import type { AIChatMessage } from "@/types/chat";
import type { ToolUIPart as AIToolUIPart } from "ai";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  isAIConversationChannel,
  type AIConversation,
  type AIConversationChannel,
  type AIConversationMessage,
  type AIConversationPart,
  type AIConversationPage,
  type AIConversationRequestContext,
} from "@/shared/contracts/aiConversation";
import {
  getAIAttachmentIdFromUrl,
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
} from "@/shared/contracts/aiAttachment";
import {
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
} from "@/utils/storageUpload";

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

function isApproval(value: unknown, approved?: boolean): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (approved === undefined || value.approved === approved) &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isAIConversationPart(value: unknown): value is AIConversationPart {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "text") {
    return (
      typeof value.text === "string" &&
      (value.state === undefined ||
        value.state === "streaming" ||
        value.state === "done")
    );
  }
  if (value.type === "file") {
    return (
      typeof value.mediaType === "string" &&
      typeof value.url === "string" &&
      (value.filename === undefined || typeof value.filename === "string")
    );
  }
  if (value.type === "source-url") {
    return (
      typeof value.sourceId === "string" &&
      typeof value.url === "string" &&
      (value.title === undefined || typeof value.title === "string")
    );
  }
  if (value.type === "source-document") {
    return (
      typeof value.sourceId === "string" &&
      typeof value.mediaType === "string" &&
      typeof value.title === "string" &&
      (value.filename === undefined || typeof value.filename === "string")
    );
  }
  if (
    !value.type.startsWith("tool-") ||
    typeof value.toolCallId !== "string" ||
    typeof value.state !== "string"
  ) {
    return false;
  }
  switch (value.state) {
    case "input-streaming":
      return true;
    case "input-available":
      return "input" in value;
    case "approval-requested":
      return "input" in value && isApproval(value.approval);
    case "approval-responded":
      return (
        "input" in value &&
        isRecord(value.approval) &&
        typeof value.approval.approved === "boolean" &&
        isApproval(value.approval, value.approval.approved)
      );
    case "output-available":
      return "input" in value && "output" in value;
    case "output-error":
      return typeof value.errorText === "string";
    case "output-denied":
      return "input" in value && isApproval(value.approval, false);
    default:
      return false;
  }
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

  if (!value.parts.every(isAIConversationPart)) {
    throw new Error("Invalid conversation message part");
  }

  return {
    id: value.id,
    seq: value.seq,
    role: value.role,
    parts: value.parts,
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
    parts: message.parts.map((part) => {
      if (part.type !== "file") return part;
      const attachmentId = getAIAttachmentIdFromUrl(part.url);
      return attachmentId
        ? {
            ...part,
            url: getApiUrl(getAIAttachmentUrl(attachmentId)),
          }
        : part;
    }),
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
  owner: string;
  conversation: AIConversation;
  messages: AIChatMessage[];
}> {
  const newest = await requestConversationPage(channel);
  const pages: AIConversationMessage[][] = [newest.messages];
  let cursor = newest.page.nextCursor;

  while (cursor) {
    const older = await requestConversationPage(channel, cursor);
    if (
      older.owner !== newest.owner ||
      older.conversation.id !== newest.conversation.id ||
      older.conversation.revision !== newest.conversation.revision
    ) {
      throw new Error("Conversation changed while loading");
    }
    pages.unshift(older.messages);
    cursor = older.page.nextCursor;
  }

  return {
    owner: newest.owner,
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

function isStorageUploadInstruction(
  value: unknown
): value is StorageUploadInstruction {
  if (
    !isRecord(value) ||
    (value.provider !== "vercel-blob" && value.provider !== "s3") ||
    typeof value.pathname !== "string" ||
    typeof value.contentType !== "string" ||
    typeof value.maximumSizeInBytes !== "number"
  ) {
    return false;
  }
  if (value.uploadMethod === "vercel-client-token") {
    return value.provider === "vercel-blob" && typeof value.clientToken === "string";
  }
  return (
    value.provider === "s3" &&
    (value.uploadMethod === "presigned-put" ||
      value.uploadMethod === "api-proxy-put") &&
    typeof value.uploadUrl === "string" &&
    typeof value.storageUrl === "string"
  );
}

function isToolPart(
  part: AIChatMessage["parts"][number]
): part is AIToolUIPart {
  return part.type.startsWith("tool-");
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function uploadAIConversationImage(
  dataUrl: string,
  filename?: string
): Promise<{ mediaType: string; url: string }> {
  const dataUrlMatch = /^data:([^;,]+);base64,/.exec(dataUrl);
  if (!dataUrlMatch || !isAIAttachmentMediaType(dataUrlMatch[1])) {
    throw new Error("Unsupported AI conversation image type");
  }

  const imageResponse = await fetch(dataUrl);
  const blob = await imageResponse.blob();
  const mediaType = dataUrlMatch[1];
  const prepareResponse = await abortableFetch(
    getApiUrl("/api/ai/attachments"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepare",
        mediaType,
        size: blob.size,
        sha256: await sha256Blob(blob),
        ...(filename ? { filename } : {}),
      }),
      timeout: 30_000,
    }
  );
  const prepared: unknown = await prepareResponse.json();
  if (
    !isRecord(prepared) ||
    typeof prepared.attachmentId !== "string" ||
    !isStorageUploadInstruction(prepared.upload)
  ) {
    throw new Error("Invalid AI attachment upload response");
  }

  const uploaded = await uploadBlobWithStorageInstruction(blob, prepared.upload);
  const completeResponse = await abortableFetch(
    getApiUrl("/api/ai/attachments"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        attachmentId: prepared.attachmentId,
        storageUrl: uploaded.storageUrl,
      }),
      timeout: 30_000,
    }
  );
  const completed: unknown = await completeResponse.json();
  if (
    !isRecord(completed) ||
    typeof completed.url !== "string" ||
    typeof completed.mediaType !== "string"
  ) {
    throw new Error("Invalid AI attachment completion response");
  }
  return {
    mediaType: completed.mediaType,
    url: getApiUrl(completed.url),
  };
}

function projectRichPart(part: AIChatMessage["parts"][number]): AIConversationPart[] {
  if (
    part.type === "text" ||
    part.type === "file" ||
    part.type === "source-url" ||
    part.type === "source-document"
  ) {
    return [part];
  }
  if (!isToolPart(part)) return [];

  try {
    const serialized = JSON.stringify(part);
    if (serialized.length <= 512 * 1024) {
      return [JSON.parse(serialized) as AIConversationPart];
    }
  } catch {
    return [];
  }

  if (part.state === "output-available") {
    return [
      {
        type: part.type,
        toolCallId: part.toolCallId,
        state: "output-available",
        input: { synced: false, reason: "too_large" },
        output: { synced: false, reason: "too_large" },
      },
    ];
  }
  return [];
}

export function projectAIConversationMessages(
  messages: readonly AIChatMessage[]
): Array<{
  id: string;
  role: "user" | "assistant";
  parts: AIConversationPart[];
  metadata: { createdAt: string };
}> {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const parts = message.parts.flatMap(projectRichPart);
    if (parts.length === 0) return [];
    return [
      {
        id: message.id,
        role: message.role,
        parts,
        metadata: {
          createdAt: normalizeCreatedAt(message.metadata?.createdAt),
        },
      },
    ];
  });
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
    return { ...common, messages };
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

async function externalizeLocalConversationImages(
  messages: readonly AIChatMessage[]
): Promise<AIChatMessage[]> {
  const uploads = new Map<string, Promise<{ mediaType: string; url: string }>>();
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: (
        await Promise.all(
          message.parts.map(async (part) => {
            if (
              part.type !== "file" ||
              !part.url.startsWith("data:")
            ) {
              return part;
            }
            let upload = uploads.get(part.url);
            if (!upload) {
              upload = uploadAIConversationImage(part.url, part.filename);
              uploads.set(part.url, upload);
            }
            try {
              const stored = await upload;
              return {
                ...part,
                mediaType: stored.mediaType,
                url: stored.url,
              };
            } catch (error) {
              console.warn(
                "[AI conversation] Skipping a legacy image that could not be uploaded",
                error
              );
              return null;
            }
          })
        )
      ).filter(
        (
          part
        ): part is AIChatMessage["parts"][number] => part !== null
      ),
    }))
  );
}

async function importLocalConversation(
  channel: AIConversationChannel,
  conversation: AIConversation,
  messages: readonly AIChatMessage[]
): Promise<void> {
  const externalized = await externalizeLocalConversationImages(messages);
  const projected = projectAIConversationMessages(externalized);
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
    if (loaded.owner !== owner) {
      throw new Error("Authenticated conversation owner changed");
    }
    if (
      input.importLocalIfEmpty !== false &&
      loaded.conversation.canImportLegacy &&
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
    if (loaded.owner !== owner) {
      throw new Error("Authenticated conversation owner changed");
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
    revision: session.conversation.revision,
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
  if (
    !isRecord(value) ||
    typeof value.owner !== "string" ||
    value.owner.toLowerCase() !== owner
  ) {
    throw new Error("Invalid conversation reset response");
  }
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

export function invalidateAIConversationSession(
  channel: AIConversationChannel,
  username?: string | null
): void {
  const session = sessions.get(channel);
  if (
    !session ||
    !username ||
    session.owner === username.toLowerCase()
  ) {
    sessions.delete(channel);
  }
}
