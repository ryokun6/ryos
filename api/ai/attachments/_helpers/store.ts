import { createHash } from "node:crypto";
import type { UIMessage } from "ai";
import sharp from "sharp";
import { z } from "zod";
import type { RedisLike } from "../../../_utils/redis.js";
import {
  assertStoredObjectPath,
  deleteStoredObject,
  deleteStoredObjectByPathname,
  downloadPrivateStoredObject,
  getStorageBackend,
  uploadPrivateStoredObject,
} from "../../../_utils/storage.js";
import {
  AI_ATTACHMENT_MAX_COUNT_PER_USER,
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_MAX_TOTAL_BYTES_PER_USER,
  AI_ATTACHMENT_UNATTACHED_GRACE_MS,
  getAIAttachmentIdFromUrl,
  getAIAttachmentUrl,
  type AIAttachmentMediaType,
  type AIAttachmentRecord,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";

const MAX_FILENAME_LENGTH = 160;
const MAX_MODEL_IMAGES = 4;
const MAX_MODEL_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_IMAGE_PIXELS = 25_000_000;

const attachmentRecordSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    storageUrl: z.string().min(1).max(2_048),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z.number().int().positive().max(AI_ATTACHMENT_MAX_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    filename: z.string().min(1).max(MAX_FILENAME_LENGTH).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

const pendingAttachmentSchema = z
  .object({
    version: z.literal(1),
    status: z.literal("pending"),
    id: z.string().uuid(),
    pathname: z.string().min(1).max(512),
    provider: z.enum(["vercel-blob", "s3"]),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z.number().int().positive().max(AI_ATTACHMENT_MAX_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    filename: z.string().min(1).max(MAX_FILENAME_LENGTH).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

const unattachedAttachmentSchema = attachmentRecordSchema
  .extend({
    status: z.literal("unattached"),
  })
  .strict();

const attachedAttachmentSchema = attachmentRecordSchema
  .extend({
    status: z.literal("attached"),
    attachedAt: z.string().datetime(),
  })
  .strict();

const deletingAttachmentSchema = attachmentRecordSchema
  .extend({
    status: z.literal("deleting"),
    deletionStartedAt: z.string().datetime(),
  })
  .strict();

const deletingPendingAttachmentSchema = pendingAttachmentSchema
  .omit({ status: true })
  .extend({
    status: z.literal("deleting-pending"),
    deletionStartedAt: z.string().datetime(),
  })
  .strict();

type PendingAIAttachment = z.infer<typeof pendingAttachmentSchema>;
type UnattachedAIAttachment = z.infer<typeof unattachedAttachmentSchema>;
type AttachedAIAttachment = z.infer<typeof attachedAttachmentSchema>;
export type DeletingAIAttachment = z.infer<
  typeof deletingAttachmentSchema
>;
type DeletingPendingAIAttachment = z.infer<
  typeof deletingPendingAttachmentSchema
>;

export interface AIAttachmentClaim {
  key: string;
  expectedValue: string;
  nextValue: string;
}

export interface AIAttachmentDeletionPlan {
  claims: AIAttachmentClaim[];
  attachments: DeletingAIAttachment[];
}

export type AIAttachmentRedis = Pick<
  RedisLike,
  | "get"
  | "set"
  | "del"
  | "exists"
  | "expire"
  | "persist"
  | "eval"
  | "sadd"
  | "srem"
  | "smembers"
>;

const CREATE_PENDING_ATTACHMENT_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return -2
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -1
end
local attachmentCount = redis.call("SCARD", KEYS[3])
local attachmentBytes = tonumber(redis.call("GET", KEYS[4]) or "0")
if attachmentCount >= tonumber(ARGV[4]) or
   attachmentBytes + tonumber(ARGV[3]) > tonumber(ARGV[5]) then
  return -3
end
redis.call("SET", KEYS[2], ARGV[1])
redis.call("SADD", KEYS[3], ARGV[2])
redis.call("INCRBY", KEYS[4], ARGV[3])
return 1
`;

const FINALIZE_ATTACHMENT_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return -2
end
if redis.call("GET", KEYS[2]) ~= ARGV[1] then
  return -1
end
redis.call("SET", KEYS[2], ARGV[2])
return 1
`;

const STAGE_STALE_ATTACHMENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2])
return 1
`;

const REMOVE_ATTACHMENT_METADATA_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
redis.call("SREM", KEYS[2], ARGV[2])
local currentBytes = tonumber(redis.call("GET", KEYS[3]) or "0")
local nextBytes = currentBytes - tonumber(ARGV[3])
if nextBytes > 0 then
  redis.call("SET", KEYS[3], nextBytes)
else
  redis.call("DEL", KEYS[3])
end
return 1
`;

export function getAIAttachmentPath(
  username: string,
  attachmentId: string
): string {
  return `ai/${username.toLowerCase()}/attachments/${attachmentId}`;
}

function assertAttachmentRecordLocation({
  username,
  attachmentId,
  record,
}: {
  username: string;
  attachmentId: string;
  record: AIAttachmentRecord;
}): void {
  if (record.id !== attachmentId) {
    throw new Error("attachment_storage_invalid");
  }
  assertStoredObjectPath(
    record.storageUrl,
    getAIAttachmentPath(username, attachmentId)
  );
}

function assertPendingAttachmentLocation({
  username,
  attachment,
}: {
  username: string;
  attachment: PendingAIAttachment | DeletingPendingAIAttachment;
}): void {
  if (
    attachment.pathname !== getAIAttachmentPath(username, attachment.id)
  ) {
    throw new Error("attachment_storage_invalid");
  }
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

function hasExpectedImageSignature(
  bytes: Uint8Array,
  mediaType: AIAttachmentMediaType
): boolean {
  if (mediaType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mediaType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
}

async function assertValidImage(
  bytes: Uint8Array,
  mediaType: AIAttachmentMediaType
): Promise<void> {
  if (
    bytes.byteLength <= 0 ||
    bytes.byteLength > AI_ATTACHMENT_MAX_BYTES ||
    !hasExpectedImageSignature(bytes, mediaType)
  ) {
    throw new Error("attachment_upload_invalid");
  }

  try {
    const metadata = await sharp(Buffer.from(bytes), {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: false,
    }).metadata();
    const expectedFormat =
      mediaType === "image/jpeg"
        ? "jpeg"
        : mediaType === "image/png"
          ? "png"
          : "webp";
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new Error("attachment_upload_invalid");
    }
  } catch {
    throw new Error("attachment_upload_invalid");
  }
}

function getDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function serializeStoredValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toAttachmentRecord(
  value:
    | z.infer<typeof attachmentRecordSchema>
    | UnattachedAIAttachment
    | AttachedAIAttachment
    | DeletingAIAttachment
): AIAttachmentRecord {
  return {
    version: value.version,
    id: value.id,
    storageUrl: value.storageUrl,
    mediaType: value.mediaType,
    size: value.size,
    sha256: value.sha256,
    ...(value.filename ? { filename: value.filename } : {}),
    createdAt: value.createdAt,
  };
}

function parseAvailableAttachment(value: unknown):
  | {
      kind: "legacy" | "unattached" | "attached";
      record: AIAttachmentRecord;
      attachedAt?: string;
    }
  | null {
  const parsed = parseStoredValue(value);
  const attached = attachedAttachmentSchema.safeParse(parsed);
  if (attached.success) {
    return {
      kind: "attached",
      record: toAttachmentRecord(attached.data),
      attachedAt: attached.data.attachedAt,
    };
  }
  const unattached = unattachedAttachmentSchema.safeParse(parsed);
  if (unattached.success) {
    return {
      kind: "unattached",
      record: toAttachmentRecord(unattached.data),
    };
  }
  const legacy = attachmentRecordSchema.safeParse(parsed);
  return legacy.success
    ? { kind: "legacy", record: toAttachmentRecord(legacy.data) }
    : null;
}

function isOlderThan(value: string, ageMs: number, now: number): boolean {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && now - timestamp >= ageMs;
}

async function removeAttachmentMetadata({
  redis,
  username,
  attachmentId,
  expectedValue,
  size,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentId: string;
  expectedValue: string;
  size: number;
}): Promise<number> {
  return redis.eval<number>(
    REMOVE_ATTACHMENT_METADATA_SCRIPT,
    [
      redisKeys.chat.aiAttachment(username, attachmentId),
      redisKeys.chat.aiAttachmentIds(username),
      redisKeys.chat.aiAttachmentBytes(username),
    ],
    [expectedValue, attachmentId, size]
  );
}

export async function createAIAttachment({
  redis,
  username,
  mediaType,
  bytes,
  filename,
}: {
  redis: AIAttachmentRedis;
  username: string;
  mediaType: AIAttachmentMediaType;
  bytes: Uint8Array;
  filename?: string;
}): Promise<AIAttachmentRecord> {
  await assertValidImage(bytes, mediaType);
  await cleanupStaleAIAttachments({ redis, username }).catch((error) => {
    console.error("[ai-attachment] Failed to run upload cleanup", error);
  });

  const attachmentId = crypto.randomUUID();
  const pathname = getAIAttachmentPath(username, attachmentId);
  const provider = getStorageBackend();
  const createdAt = new Date().toISOString();
  const normalizedFilename = normalizeFilename(filename);
  const pending: PendingAIAttachment = {
    version: 1,
    status: "pending",
    id: attachmentId,
    pathname,
    provider,
    mediaType,
    size: bytes.byteLength,
    sha256: getDigest(bytes),
    ...(normalizedFilename ? { filename: normalizedFilename } : {}),
    createdAt,
  };
  const pendingJson = JSON.stringify(pending);
  const key = redisKeys.chat.aiAttachment(username, attachmentId);
  const registryKey = redisKeys.chat.aiAttachmentIds(username);
  const bytesKey = redisKeys.chat.aiAttachmentBytes(username);
  const tombstoneKey = redisKeys.chat.aiConversationTombstone(username);
  const created = await redis.eval<number>(
    CREATE_PENDING_ATTACHMENT_SCRIPT,
    [tombstoneKey, key, registryKey, bytesKey],
    [
      pendingJson,
      attachmentId,
      bytes.byteLength,
      AI_ATTACHMENT_MAX_COUNT_PER_USER,
      AI_ATTACHMENT_MAX_TOTAL_BYTES_PER_USER,
    ]
  );
  if (created === -2) {
    throw new Error("account_deleted");
  }
  if (created !== 1) {
    if (created === -3) {
      throw new Error("attachment_quota_exceeded");
    }
    throw new Error("attachment_upload_conflict");
  }

  let storageUrl: string | null = null;
  try {
    storageUrl = await uploadPrivateStoredObject({
      pathname,
      contentType: mediaType,
      body: bytes,
      maximumSizeInBytes: AI_ATTACHMENT_MAX_BYTES,
    });
    const record: AIAttachmentRecord = {
      version: 1,
      id: attachmentId,
      storageUrl,
      mediaType,
      size: bytes.byteLength,
      sha256: pending.sha256,
      ...(normalizedFilename ? { filename: normalizedFilename } : {}),
      createdAt,
    };
    const unattached: UnattachedAIAttachment = {
      ...record,
      status: "unattached",
    };
    const finalized = await redis.eval<number>(
      FINALIZE_ATTACHMENT_SCRIPT,
      [tombstoneKey, key, registryKey],
      [
        pendingJson,
        JSON.stringify(unattached),
      ]
    );
    if (finalized === -2) {
      throw new Error("account_deleted");
    }
    if (finalized !== 1) {
      throw new Error("attachment_upload_not_pending");
    }
    return record;
  } catch (error) {
    let objectDeleted = false;
    try {
      if (storageUrl) {
        await deleteStoredObject(storageUrl);
      } else {
        await deleteStoredObjectByPathname(pathname, provider);
      }
      objectDeleted = true;
    } catch (cleanupError) {
      console.error(
        `[ai-attachment] Failed to roll back upload ${attachmentId}; metadata retained for retry`,
        cleanupError
      );
    }
    if (objectDeleted) {
      await removeAttachmentMetadata({
        redis,
        username,
        attachmentId,
        expectedValue:
          serializeStoredValue(await redis.get(key)) ?? pendingJson,
        size: bytes.byteLength,
      }).catch(() => 0);
    }
    throw error;
  }
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
  const parsed = parseAvailableAttachment(await redis.get(key));
  if (!parsed) return null;
  try {
    assertAttachmentRecordLocation({
      username,
      attachmentId,
      record: parsed.record,
    });
  } catch {
    return null;
  }
  await Promise.all([
    redis.persist(key).catch(() => 0),
    redis.persist(redisKeys.chat.aiAttachmentIds(username)).catch(() => 0),
    redis.persist(redisKeys.chat.aiAttachmentBytes(username)).catch(() => 0),
  ]);
  return parsed.record;
}

async function readAIAttachmentBytes(
  record: AIAttachmentRecord
): Promise<Uint8Array> {
  const bytes = await downloadPrivateStoredObject(
    record.storageUrl,
    AI_ATTACHMENT_MAX_BYTES
  );
  if (
    bytes.byteLength !== record.size ||
    getDigest(bytes) !== record.sha256 ||
    !hasExpectedImageSignature(bytes, record.mediaType)
  ) {
    throw new Error("attachment_storage_invalid");
  }
  return bytes;
}

export async function getAIAttachmentContent({
  redis,
  username,
  attachmentId,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentId: string;
}): Promise<
  { record: AIAttachmentRecord; bytes: Uint8Array } | null
> {
  const record = await getAIAttachmentRecord({
    redis,
    username,
    attachmentId,
  });
  if (!record) return null;
  return { record, bytes: await readAIAttachmentBytes(record) };
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

export async function prepareAIAttachmentClaims({
  redis,
  username,
  attachmentIds,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentIds: readonly string[];
}): Promise<AIAttachmentClaim[] | null> {
  const attachedAt = new Date().toISOString();
  const claims: AIAttachmentClaim[] = [];
  for (const attachmentId of new Set(attachmentIds)) {
    const key = redisKeys.chat.aiAttachment(username, attachmentId);
    const raw = await redis.get(key);
    const expectedValue = serializeStoredValue(raw);
    const available = parseAvailableAttachment(raw);
    if (!expectedValue || !available) return null;
    try {
      assertAttachmentRecordLocation({
        username,
        attachmentId,
        record: available.record,
      });
    } catch {
      return null;
    }
    const next: AttachedAIAttachment = {
      ...available.record,
      status: "attached",
      attachedAt: available.attachedAt ?? attachedAt,
    };
    claims.push({
      key,
      expectedValue,
      nextValue: JSON.stringify(next),
    });
  }
  return claims;
}

export async function validateAIAttachmentIds({
  redis,
  username,
  attachmentIds,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachmentIds: readonly string[];
}): Promise<boolean> {
  return (
    (await prepareAIAttachmentClaims({
      redis,
      username,
      attachmentIds,
    })) !== null
  );
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
  return validateAIAttachmentIds({
    redis,
    username,
    attachmentIds: collectAIAttachmentIds(messages),
  });
}

export async function prepareUnreferencedAIAttachmentDeletions({
  redis,
  username,
  candidateIds,
  referencedIds,
}: {
  redis: AIAttachmentRedis;
  username: string;
  candidateIds: readonly string[];
  referencedIds: ReadonlySet<string>;
}): Promise<AIAttachmentDeletionPlan> {
  const claims: AIAttachmentClaim[] = [];
  const attachments: DeletingAIAttachment[] = [];
  for (const attachmentId of new Set(candidateIds)) {
    if (referencedIds.has(attachmentId)) continue;
    const key = redisKeys.chat.aiAttachment(username, attachmentId);
    const raw = await redis.get(key);
    const rawJson = serializeStoredValue(raw);
    const available = parseAvailableAttachment(raw);
    if (
      !rawJson ||
      !available ||
      available.kind === "unattached"
    ) {
      continue;
    }
    const deleting: DeletingAIAttachment = {
      ...available.record,
      status: "deleting",
      deletionStartedAt: new Date().toISOString(),
    };
    claims.push({
      key,
      expectedValue: rawJson,
      nextValue: JSON.stringify(deleting),
    });
    attachments.push(deleting);
  }
  return { claims, attachments };
}

export async function finishStagedAIAttachmentDeletions({
  redis,
  username,
  attachments,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachments: readonly DeletingAIAttachment[];
}): Promise<number> {
  let deleted = 0;
  for (const attachment of attachments) {
    try {
      assertAttachmentRecordLocation({
        username,
        attachmentId: attachment.id,
        record: attachment,
      });
      await deleteStoredObject(attachment.storageUrl);
      deleted += await removeAttachmentMetadata({
        redis,
        username,
        attachmentId: attachment.id,
        expectedValue: JSON.stringify(attachment),
        size: attachment.size,
      });
    } catch (error) {
      console.error(
        `[ai-attachment] Failed to delete ${attachment.id}; it remains staged for retry`,
        error
      );
    }
  }
  return deleted;
}

async function finishPendingAttachmentDeletion({
  redis,
  username,
  attachment,
}: {
  redis: AIAttachmentRedis;
  username: string;
  attachment: DeletingPendingAIAttachment;
}): Promise<number> {
  try {
    assertPendingAttachmentLocation({ username, attachment });
    await deleteStoredObjectByPathname(
      attachment.pathname,
      attachment.provider
    );
    return await removeAttachmentMetadata({
      redis,
      username,
      attachmentId: attachment.id,
      expectedValue: JSON.stringify(attachment),
      size: attachment.size,
    });
  } catch (error) {
    console.error(
      `[ai-attachment] Failed to delete pending attachment ${attachment.id}; it remains staged for retry`,
      error
    );
    return 0;
  }
}

export async function cleanupStaleAIAttachments({
  redis,
  username,
  now = Date.now(),
}: {
  redis: AIAttachmentRedis;
  username: string;
  now?: number;
}): Promise<number> {
  const registryKey = redisKeys.chat.aiAttachmentIds(username);
  const attachmentIds = await redis.smembers<string[]>(registryKey);
  let deleted = 0;

  for (const attachmentId of new Set(attachmentIds)) {
    const key = redisKeys.chat.aiAttachment(username, attachmentId);
    const raw = await redis.get(key);
    const rawJson = serializeStoredValue(raw);
    if (!rawJson) continue;
    const parsed = parseStoredValue(raw);

    const deleting = deletingAttachmentSchema.safeParse(parsed);
    if (deleting.success) {
      deleted += await finishStagedAIAttachmentDeletions({
        redis,
        username,
        attachments: [deleting.data],
      });
      continue;
    }

    const deletingPending = deletingPendingAttachmentSchema.safeParse(parsed);
    if (deletingPending.success) {
      deleted += await finishPendingAttachmentDeletion({
        redis,
        username,
        attachment: deletingPending.data,
      });
      continue;
    }

    const pending = pendingAttachmentSchema.safeParse(parsed);
    if (
      pending.success &&
      isOlderThan(
        pending.data.createdAt,
        AI_ATTACHMENT_UNATTACHED_GRACE_MS,
        now
      )
    ) {
      const staged: DeletingPendingAIAttachment = {
        ...pending.data,
        status: "deleting-pending",
        deletionStartedAt: new Date(now).toISOString(),
      };
      const result = await redis.eval<number>(
        STAGE_STALE_ATTACHMENT_SCRIPT,
        [key],
        [rawJson, JSON.stringify(staged)]
      );
      if (result === 1) {
        deleted += await finishPendingAttachmentDeletion({
          redis,
          username,
          attachment: staged,
        });
      }
      continue;
    }

    const unattached = unattachedAttachmentSchema.safeParse(parsed);
    if (
      unattached.success &&
      isOlderThan(
        unattached.data.createdAt,
        AI_ATTACHMENT_UNATTACHED_GRACE_MS,
        now
      )
    ) {
      const staged: DeletingAIAttachment = {
        ...toAttachmentRecord(unattached.data),
        status: "deleting",
        deletionStartedAt: new Date(now).toISOString(),
      };
      const result = await redis.eval<number>(
        STAGE_STALE_ATTACHMENT_SCRIPT,
        [key],
        [rawJson, JSON.stringify(staged)]
      );
      if (result === 1) {
        deleted += await finishStagedAIAttachmentDeletions({
          redis,
          username,
          attachments: [staged],
        });
      }
    }
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
  const attachmentIds = await redis.smembers<string[]>(registryKey);
  let deleted = 0;
  for (const attachmentId of new Set(attachmentIds)) {
    const raw = await redis.get(
      redisKeys.chat.aiAttachment(username, attachmentId)
    );
    const rawJson = serializeStoredValue(raw);
    const parsed = parseStoredValue(raw);
    const available = parseAvailableAttachment(raw);
    const deleting = deletingAttachmentSchema.safeParse(parsed);
    const pending = pendingAttachmentSchema.safeParse(parsed);
    const deletingPending = deletingPendingAttachmentSchema.safeParse(parsed);
    if (available) {
      assertAttachmentRecordLocation({
        username,
        attachmentId,
        record: available.record,
      });
      await deleteStoredObject(available.record.storageUrl);
    } else if (deleting.success) {
      assertAttachmentRecordLocation({
        username,
        attachmentId,
        record: deleting.data,
      });
      await deleteStoredObject(deleting.data.storageUrl);
    } else if (pending.success || deletingPending.success) {
      const pendingRecord = pending.success
        ? pending.data
        : deletingPending.data;
      assertPendingAttachmentLocation({
        username,
        attachment: pendingRecord,
      });
      await deleteStoredObjectByPathname(
        pendingRecord.pathname,
        pendingRecord.provider
      );
    }
    if (rawJson) {
      const size =
        available?.record.size ??
        (deleting.success ? deleting.data.size : undefined) ??
        (pending.success ? pending.data.size : undefined) ??
        (deletingPending.success ? deletingPending.data.size : 0);
      deleted += await removeAttachmentMetadata({
        redis,
        username,
        attachmentId,
        expectedValue: rawJson,
        size,
      });
    }
  }
  return (
    deleted +
    (await redis.del(
      registryKey,
      redisKeys.chat.aiAttachmentBytes(username)
    ))
  );
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
  const selected = new Map<
    string,
    {
      record: AIAttachmentRecord;
      bytes: Uint8Array;
      messageIndex: number;
      partIndex: number;
    }
  >();
  let selectedBytes = 0;

  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (!message) continue;
    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      if (selected.size >= MAX_MODEL_IMAGES) break;
      const part = message.parts[partIndex];
      if (!part || part.type !== "file") continue;
      const attachmentId = getAIAttachmentIdFromUrl(part.url);
      if (!attachmentId || selected.has(attachmentId)) continue;
      const record = await getAIAttachmentRecord({
        redis,
        username,
        attachmentId,
      });
      if (
        !record ||
        selectedBytes + record.size > MAX_MODEL_IMAGE_BYTES
      ) {
        continue;
      }
      const bytes = await readAIAttachmentBytes(record);
      selected.set(attachmentId, {
        record,
        bytes,
        messageIndex,
        partIndex,
      });
      selectedBytes += record.size;
    }
    if (selected.size >= MAX_MODEL_IMAGES) break;
  }

  return messages.flatMap((message, messageIndex) => {
    const parts = message.parts.flatMap((part, partIndex) => {
      if (part.type !== "file") return [part];
      const attachmentId = getAIAttachmentIdFromUrl(part.url);
      if (!attachmentId) return [part];
      const attachment = selected.get(attachmentId);
      if (
        !attachment ||
        attachment.messageIndex !== messageIndex ||
        attachment.partIndex !== partIndex
      ) {
        return [];
      }
      return [
        {
          ...part,
          mediaType: attachment.record.mediaType,
          ...(attachment.record.filename
            ? { filename: attachment.record.filename }
            : {}),
          url: `data:${attachment.record.mediaType};base64,${Buffer.from(
            attachment.bytes
          ).toString("base64")}`,
        },
      ];
    });
    return parts.length > 0 ? [{ ...message, parts }] : [];
  });
}

export function canonicalizeAIAttachmentUrl(value: unknown): string | null {
  const attachmentId = getAIAttachmentIdFromUrl(value);
  return attachmentId ? getAIAttachmentUrl(attachmentId) : null;
}
