import { z } from "zod";
import type { UIMessage } from "ai";
import type { RedisLike } from "../../../_utils/redis.js";
import {
  createStorageUploadDescriptor,
  deleteStoredObject,
  downloadStoredObject,
  headStoredObject,
  type StorageUploadDescriptor,
} from "../../../_utils/storage.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_TTL_SECONDS,
  getAIAttachmentIdFromUrl,
  getAIAttachmentUrl,
  type AIAttachmentMediaType,
  type AIAttachmentRecord,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";

const PENDING_ATTACHMENT_TTL_SECONDS = 10 * 60;
const MAX_FILENAME_LENGTH = 160;

const attachmentRecordSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  storageUrl: z.string().min(1).max(2_048),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(AI_ATTACHMENT_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH).optional(),
  createdAt: z.string().datetime(),
});

const pendingAttachmentSchema = z.object({
  version: z.literal(1),
  status: z.literal("pending"),
  id: z.string().uuid(),
  pathname: z.string().min(1).max(512),
  expectedStorageUrl: z.string().min(1).max(2_048).optional(),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(AI_ATTACHMENT_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH).optional(),
  createdAt: z.string().datetime(),
});

type PendingAIAttachment = z.infer<typeof pendingAttachmentSchema>;

export type AIAttachmentRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "expire" | "sadd" | "srem" | "smembers"
>;

function attachmentPath(username: string, attachmentId: string): string {
  return `ai/${username.toLowerCase()}/attachments/${attachmentId}`;
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeFilename(filename: string | undefined): string | undefined {
  const normalized = filename?.replaceAll("\0", "").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_FILENAME_LENGTH);
}

function isExpectedVercelBlobUrl(
  storageUrl: string,
  pathname: string
): boolean {
  try {
    const parsed = new URL(storageUrl);
    return (
      parsed.protocol === "https:" &&
      parsed.pathname.endsWith(`/${pathname}`)
    );
  } catch {
    return false;
  }
}

export async function prepareAIAttachmentUpload({
  redis,
  username,
  mediaType,
  size,
  sha256,
  filename,
}: {
  redis: AIAttachmentRedis;
  username: string;
  mediaType: AIAttachmentMediaType;
  size: number;
  sha256: string;
  filename?: string;
}): Promise<{
  attachmentId: string;
  upload: StorageUploadDescriptor;
}> {
  const attachmentId = crypto.randomUUID();
  const pathname = attachmentPath(username, attachmentId);
  const upload = await createStorageUploadDescriptor({
    pathname,
    contentType: mediaType,
    allowedContentTypes: [mediaType],
    maximumSizeInBytes: AI_ATTACHMENT_MAX_BYTES,
    allowOverwrite: false,
  });
  const pending: PendingAIAttachment = {
    version: 1,
    status: "pending",
    id: attachmentId,
    pathname,
    ...("storageUrl" in upload
      ? { expectedStorageUrl: upload.storageUrl }
      : {}),
    mediaType,
    size,
    sha256,
    ...(normalizeFilename(filename)
      ? { filename: normalizeFilename(filename) }
      : {}),
    createdAt: new Date().toISOString(),
  };
  await redis.set(
    redisKeys.chat.aiAttachment(username, attachmentId),
    pending,
    { ex: PENDING_ATTACHMENT_TTL_SECONDS }
  );
  return { attachmentId, upload };
}

export async function completeAIAttachmentUpload({
  redis,
  username,
  attachmentId,
  storageUrl,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentId: string;
  storageUrl: string;
}): Promise<AIAttachmentRecord> {
  const key = redisKeys.chat.aiAttachment(username, attachmentId);
  const pending = pendingAttachmentSchema.safeParse(
    parseStoredValue(await redis.get(key))
  );
  if (!pending.success || pending.data.id !== attachmentId) {
    throw new Error("attachment_upload_not_pending");
  }

  const expectedUrl = pending.data.expectedStorageUrl;
  if (
    (expectedUrl && storageUrl !== expectedUrl) ||
    (!expectedUrl &&
      !isExpectedVercelBlobUrl(storageUrl, pending.data.pathname))
  ) {
    throw new Error("attachment_storage_url_mismatch");
  }

  const metadata = await headStoredObject(storageUrl);
  if (
    !metadata ||
    metadata.size !== pending.data.size ||
    metadata.size > AI_ATTACHMENT_MAX_BYTES ||
    metadata.contentType?.split(";")[0]?.trim().toLowerCase() !==
      pending.data.mediaType
  ) {
    throw new Error("attachment_upload_invalid");
  }

  const record: AIAttachmentRecord = {
    version: 1,
    id: attachmentId,
    storageUrl,
    mediaType: pending.data.mediaType,
    size: metadata.size,
    sha256: pending.data.sha256,
    ...(pending.data.filename ? { filename: pending.data.filename } : {}),
    createdAt: pending.data.createdAt,
  };
  await redis.set(key, record, { ex: AI_ATTACHMENT_TTL_SECONDS });
  const registryKey = redisKeys.chat.aiAttachmentIds(username);
  await redis.sadd(registryKey, attachmentId);
  await redis.expire(registryKey, AI_ATTACHMENT_TTL_SECONDS);
  return record;
}

export async function getAIAttachmentRecord({
  redis,
  username,
  attachmentId,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentId: string;
}): Promise<AIAttachmentRecord | null> {
  const key = redisKeys.chat.aiAttachment(username, attachmentId);
  const parsed = attachmentRecordSchema.safeParse(
    parseStoredValue(await redis.get(key))
  );
  if (!parsed.success) return null;
  void redis.expire(key, AI_ATTACHMENT_TTL_SECONDS).catch(() => 0);
  void redis
    .expire(
      redisKeys.chat.aiAttachmentIds(username),
      AI_ATTACHMENT_TTL_SECONDS
    )
    .catch(() => 0);
  return parsed.data;
}

export function collectAIAttachmentIds(
  messages: readonly { parts?: readonly { type?: unknown; url?: unknown }[] }[]
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== "file") continue;
      const attachmentId = getAIAttachmentIdFromUrl(part.url);
      if (attachmentId) ids.add(attachmentId);
    }
  }
  return [...ids];
}

export async function validateAIAttachmentReferences({
  redis,
  username,
  messages,
}: {
  redis: AIAttachmentRedis;
  username: string;
  messages: readonly { parts?: readonly { type?: unknown; url?: unknown }[] }[];
}): Promise<boolean> {
  const attachmentIds = collectAIAttachmentIds(messages);
  const records = await Promise.all(
    attachmentIds.map((attachmentId) =>
      getAIAttachmentRecord({ redis, username, attachmentId })
    )
  );
  return records.every((record) => record !== null);
}

export async function deleteAIAttachments({
  redis,
  username,
  attachmentIds,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentIds: readonly string[];
}): Promise<number> {
  const uniqueIds = [...new Set(attachmentIds)];
  let deleted = 0;
  for (const attachmentId of uniqueIds) {
    const record = await getAIAttachmentRecord({
      redis,
      username,
      attachmentId,
    }).catch(() => null);
    if (record) {
      await deleteStoredObject(record.storageUrl).catch(() => {});
    }
    deleted += await redis
      .del(redisKeys.chat.aiAttachment(username, attachmentId))
      .catch(() => 0);
    await redis
      .srem(redisKeys.chat.aiAttachmentIds(username), attachmentId)
      .catch(() => 0);
  }
  return deleted;
}

export async function deleteAllAIAttachments({
  redis,
  username,
}: {
  redis: AIAttachmentRedis;
  username: string;
}): Promise<number> {
  const registryKey = redisKeys.chat.aiAttachmentIds(username);
  const attachmentIds = await redis
    .smembers<string[]>(registryKey)
    .catch(() => []);
  const deleted = await deleteAIAttachments({
    redis,
    username,
    attachmentIds,
  });
  return deleted + (await redis.del(registryKey).catch(() => 0));
}

export async function resolveAIAttachmentsForModel({
  redis,
  username,
  messages,
}: {
  redis: AIAttachmentRedis;
  username: string;
  messages: UIMessage[];
}): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file") return part;
          const attachmentId = getAIAttachmentIdFromUrl(part.url);
          if (!attachmentId) return part;
          const record = await getAIAttachmentRecord({
            redis,
            username,
            attachmentId,
          });
          if (!record) {
            throw new Error("attachment_not_found");
          }
          const bytes = await downloadStoredObject(record.storageUrl);
          if (bytes.byteLength !== record.size) {
            throw new Error("attachment_size_changed");
          }
          return {
            ...part,
            mediaType: record.mediaType,
            ...(record.filename ? { filename: record.filename } : {}),
            url: `data:${record.mediaType};base64,${Buffer.from(bytes).toString(
              "base64"
            )}`,
          };
        })
      ),
    }))
  );
}

export function canonicalizeAIAttachmentUrl(value: unknown): string | null {
  const attachmentId = getAIAttachmentIdFromUrl(value);
  return attachmentId ? getAIAttachmentUrl(attachmentId) : null;
}
