import type { UIMessage } from "ai";
import type { RedisLike } from "../../../_utils/redis.js";
import { parseStoredUser } from "../../../_utils/auth/_user-record.js";
import {
  deletePrivateStoredObjectByPathname,
  deleteStoredObject,
  downloadPrivateStoredObjectByPathname,
  uploadPrivateStoredObject,
} from "../../../_utils/storage.js";
import {
  AI_ATTACHMENT_MAX_BYTES,
  createAIAttachmentName,
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
  parseAIAttachmentName,
  parseAIAttachmentUrl,
  type AIAttachmentMediaType,
} from "../../../../src/shared/contracts/aiAttachment.js";
import { redisKeys } from "../../../../src/shared/redisKeys.js";

const MAX_STORED_ATTACHMENTS = 512;
const MAX_MODEL_IMAGES = 4;
const MAX_MODEL_IMAGE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_LOCK_TTL_SECONDS = 120;
const ATTACHMENT_LOCK_ATTEMPTS = 600;
const ATTACHMENT_LOCK_RETRY_MS = 25;
const ATTACHMENT_INDEX_PREFIX = "v1:";
// Keep the legacy ID registry for purge while preventing reclaimed IDs from reappearing.
const LEGACY_ATTACHMENT_RECLAIMED_VALUE = "v1:reclaimed";
export const AI_ATTACHMENT_ORPHAN_GRACE_MS = 5 * 60 * 1000;

export type AIAttachmentRedis = Pick<
  RedisLike,
  "get" | "set" | "del" | "smembers" | "sadd" | "srem" | "eval"
>;

interface IndexedAIAttachmentBase {
  member: string;
  name: string;
  createdAt: number;
  needsMigration: boolean;
}

interface PendingIndexedAIAttachment extends IndexedAIAttachmentBase {
  state: "pending";
  token: string;
}

interface ReadyIndexedAIAttachment extends IndexedAIAttachmentBase {
  state: "ready";
  storageUrl: string | null;
  legacyMetadata: boolean;
}

interface InvalidIndexedAIAttachment {
  state: "invalid";
  member: string;
  storageUrl: string | null;
}

type IndexedAIAttachment =
  | PendingIndexedAIAttachment
  | ReadyIndexedAIAttachment
  | InvalidIndexedAIAttachment;

interface AIAttachmentReference {
  name: string;
  mediaType: AIAttachmentMediaType;
  legacyName: boolean;
}

export function getAIAttachmentPath(username: string, name: string): string {
  return `ai/${username.toLowerCase()}/attachments/${name}`;
}

function getImageSignatureMediaType(
  bytes: Uint8Array,
): AIAttachmentMediaType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

const RELEASE_ATTACHMENT_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const REPLACE_ATTACHMENT_INDEX_MEMBER_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
local replaced = 0
for index = 2, #ARGV, 2 do
  if redis.call("SISMEMBER", KEYS[2], ARGV[index]) == 1 then
    redis.call("SREM", KEYS[2], ARGV[index])
    redis.call("SADD", KEYS[2], ARGV[index + 1])
    replaced = replaced + 1
  end
end
return replaced
`;

const ADD_MIGRATED_ATTACHMENT_INDEX_MEMBERS_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
local added = 0
for index = 2, #ARGV do
  added = added + redis.call("SADD", KEYS[2], ARGV[index])
end
return added
`;

const RESERVE_ATTACHMENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -2
end
if redis.call("SCARD", KEYS[3]) >= tonumber(ARGV[3]) then
  return -3
end
return redis.call("SADD", KEYS[3], ARGV[2])
`;

const FINALIZE_ATTACHMENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -2
end
if redis.call("SISMEMBER", KEYS[3], ARGV[2]) == 0 then
  return 0
end
redis.call("SREM", KEYS[3], ARGV[2])
redis.call("SADD", KEYS[3], ARGV[3])
return 1
`;

const ADD_ATTACHMENT_INDEX_MEMBER_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return -1
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -2
end
return redis.call("SADD", KEYS[3], ARGV[2])
`;

export async function withAIAttachmentLock<T>({
  redis,
  username,
  task,
  attempts = ATTACHMENT_LOCK_ATTEMPTS,
}: {
  redis: AIAttachmentRedis;
  username: string;
  task: (lockToken: string) => Promise<T>;
  attempts?: number;
}): Promise<T> {
  const key = redisKeys.chat.aiAttachmentsLock(username);
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const claimed = await redis.set(key, token, {
      nx: true,
      ex: ATTACHMENT_LOCK_TTL_SECONDS,
    });
    if (claimed !== null && claimed !== undefined) {
      try {
        return await task(token);
      } finally {
        await redis
          .eval<number>(RELEASE_ATTACHMENT_LOCK_SCRIPT, [key], [token])
          .catch(() => 0);
      }
    }
    if (attempt + 1 < attempts) await sleep(ATTACHMENT_LOCK_RETRY_MS);
  }

  throw new Error("attachment_busy");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAttachmentNameFromStorageUrl(storageUrl: string): string | null {
  try {
    const pathname = new URL(storageUrl).pathname;
    const encodedName = pathname.split("/").filter(Boolean).at(-1);
    if (!encodedName) return null;
    const parsed = parseAIAttachmentName(decodeURIComponent(encodedName));
    return parsed?.name ?? null;
  } catch {
    return null;
  }
}

function getLegacyStorageUrl(raw: unknown): string | null {
  if (isRecord(raw) && typeof raw.storageUrl === "string") {
    return raw.storageUrl;
  }
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:", "s3:"].includes(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

function getExactAttachmentIndexMember(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  try {
    const serialized = JSON.stringify(raw);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function parseCreatedAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
  }
  return null;
}

interface LegacyAIAttachment {
  name: string;
  metadataKey: string;
  storageUrl: string | null;
  createdAt: number;
  reclaimed: boolean;
}

function parseLegacyAIAttachmentMetadata(raw: unknown): {
  storageUrl: string | null;
  createdAt: number | null;
} {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  if (!isRecord(value)) return { storageUrl: null, createdAt: null };
  return {
    storageUrl:
      typeof value.storageUrl === "string" && value.storageUrl.length > 0
        ? value.storageUrl
        : null,
    createdAt: parseCreatedAt(value.createdAt),
  };
}

async function loadLegacyAIAttachments({
  redis,
  username,
  now,
}: {
  redis: AIAttachmentRedis;
  username: string;
  now: number;
}): Promise<LegacyAIAttachment[]> {
  const rawIds = await redis.smembers<unknown[]>(
    redisKeys.chat.legacyAIAttachmentIds(username),
  );
  const names = [
    ...new Set(
      rawIds.flatMap((rawId) => {
        const attachment = parseAIAttachmentName(rawId);
        return attachment?.mediaType === null ? [attachment.name] : [];
      }),
    ),
  ];
  return Promise.all(
    names.map(async (name) => {
      const metadataKey = redisKeys.chat.legacyAIAttachmentMetadata(
        username,
        name,
      );
      const raw = await redis.get(metadataKey);
      const metadata = parseLegacyAIAttachmentMetadata(raw);
      return {
        name,
        metadataKey,
        storageUrl: metadata.storageUrl,
        createdAt: metadata.createdAt ?? now,
        reclaimed: raw === LEGACY_ATTACHMENT_RECLAIMED_VALUE,
      };
    }),
  );
}

function serializePendingAIAttachment({
  name,
  token,
  createdAt,
}: {
  name: string;
  token: string;
  createdAt: number;
}): string {
  return `${ATTACHMENT_INDEX_PREFIX}${JSON.stringify({
    s: "p",
    n: name,
    t: token,
    c: createdAt,
  })}`;
}

function serializeReadyAIAttachment({
  name,
  storageUrl,
  createdAt,
  legacyMetadata = false,
}: {
  name: string;
  storageUrl: string | null;
  createdAt: number;
  legacyMetadata?: boolean;
}): string {
  return `${ATTACHMENT_INDEX_PREFIX}${JSON.stringify({
    s: "r",
    n: name,
    ...(storageUrl ? { u: storageUrl } : {}),
    ...(legacyMetadata ? { l: 1 } : {}),
    c: createdAt,
  })}`;
}

function parsePrefixedAIAttachment(
  member: string,
): PendingIndexedAIAttachment | ReadyIndexedAIAttachment | null {
  if (!member.startsWith(ATTACHMENT_INDEX_PREFIX)) return null;
  let value: unknown;
  try {
    value = JSON.parse(member.slice(ATTACHMENT_INDEX_PREFIX.length));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.n !== "string") return null;
  const attachment = parseAIAttachmentName(value.n);
  const createdAt = parseCreatedAt(value.c);
  if (!attachment || createdAt === null) return null;
  if (value.s === "p" && typeof value.t === "string" && value.t.length > 0) {
    return {
      state: "pending",
      member,
      name: attachment.name,
      token: value.t,
      createdAt,
      needsMigration: false,
    };
  }
  if (
    value.s === "r" &&
    (value.u === undefined || typeof value.u === "string")
  ) {
    return {
      state: "ready",
      member,
      name: attachment.name,
      storageUrl: typeof value.u === "string" ? value.u : null,
      createdAt,
      needsMigration: false,
      legacyMetadata: value.l === 1,
    };
  }
  return null;
}

function parseIndexedAIAttachment(raw: unknown): IndexedAIAttachment | null {
  const member = getExactAttachmentIndexMember(raw);
  if (!member) return null;
  const prefixed = parsePrefixedAIAttachment(member);
  if (prefixed) return prefixed;

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  if (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.storageUrl === "string" &&
    value.storageUrl.length > 0 &&
    typeof value.name === "string"
  ) {
    const attachment = parseAIAttachmentName(value.name);
    const createdAt = parseCreatedAt(value.createdAt);
    if (attachment && createdAt !== null) {
      return {
        state: "ready",
        member,
        storageUrl: value.storageUrl,
        name: attachment.name,
        createdAt,
        needsMigration: true,
        legacyMetadata: false,
      };
    }
  }

  if (typeof raw === "string") {
    const legacyName = getAttachmentNameFromStorageUrl(raw);
    if (legacyName) {
      return {
        state: "ready",
        member,
        storageUrl: raw,
        name: legacyName,
        createdAt: 0,
        needsMigration: true,
        legacyMetadata: false,
      };
    }
  }
  return {
    state: "invalid",
    member,
    storageUrl: getLegacyStorageUrl(value) ?? getLegacyStorageUrl(raw),
  };
}

async function loadAndMigrateAIAttachmentIndex({
  redis,
  username,
  lockToken,
  now,
}: {
  redis: AIAttachmentRedis;
  username: string;
  lockToken: string;
  now: number;
}): Promise<{ entries: IndexedAIAttachment[]; memberCount: number }> {
  const indexKey = redisKeys.chat.aiAttachments(username);
  let rawMembers = await redis.smembers<unknown[]>(indexKey);
  let entries = rawMembers
    .map(parseIndexedAIAttachment)
    .filter((entry): entry is IndexedAIAttachment => entry !== null);
  const currentMigrations = entries.flatMap((entry) => {
    if (entry.state !== "ready" || !entry.needsMigration) return [];
    return [
      entry.member,
      serializeReadyAIAttachment({
        name: entry.name,
        storageUrl: entry.storageUrl,
        createdAt: entry.createdAt > 0 ? entry.createdAt : now,
      }),
    ];
  });
  if (currentMigrations.length > 0) {
    const replaced = await redis.eval<number>(
      REPLACE_ATTACHMENT_INDEX_MEMBER_SCRIPT,
      [redisKeys.chat.aiAttachmentsLock(username), indexKey],
      [lockToken, ...currentMigrations],
    );
    if (replaced === -1) throw new Error("attachment_busy");
    rawMembers = await redis.smembers<unknown[]>(indexKey);
    entries = rawMembers
      .map(parseIndexedAIAttachment)
      .filter((entry): entry is IndexedAIAttachment => entry !== null);
  }

  const legacyAttachments = (
    await loadLegacyAIAttachments({ redis, username, now })
  ).filter((attachment) => !attachment.reclaimed);
  const legacyReplacements: string[] = [];
  const legacyAdditions: string[] = [];
  for (const legacy of legacyAttachments) {
    const matching = entries.filter(
      (entry): entry is PendingIndexedAIAttachment | ReadyIndexedAIAttachment =>
        entry.state !== "invalid" && entry.name === legacy.name,
    );
    if (matching.length === 0) {
      legacyAdditions.push(
        serializeReadyAIAttachment({
          name: legacy.name,
          storageUrl: legacy.storageUrl,
          createdAt: legacy.createdAt,
          legacyMetadata: true,
        }),
      );
      continue;
    }
    for (const ready of matching.filter(
      (entry): entry is ReadyIndexedAIAttachment => entry.state === "ready",
    )) {
      if (ready.legacyMetadata) continue;
      legacyReplacements.push(
        ready.member,
        serializeReadyAIAttachment({
          name: ready.name,
          storageUrl: ready.storageUrl ?? legacy.storageUrl,
          createdAt: Math.min(ready.createdAt, legacy.createdAt),
          legacyMetadata: true,
        }),
      );
    }
  }
  if (legacyReplacements.length > 0) {
    const replaced = await redis.eval<number>(
      REPLACE_ATTACHMENT_INDEX_MEMBER_SCRIPT,
      [redisKeys.chat.aiAttachmentsLock(username), indexKey],
      [lockToken, ...legacyReplacements],
    );
    if (replaced === -1) throw new Error("attachment_busy");
  }
  if (legacyAdditions.length > 0) {
    const added = await redis.eval<number>(
      ADD_MIGRATED_ATTACHMENT_INDEX_MEMBERS_SCRIPT,
      [redisKeys.chat.aiAttachmentsLock(username), indexKey],
      [lockToken, ...legacyAdditions],
    );
    if (added === -1) throw new Error("attachment_busy");
  }
  if (legacyReplacements.length === 0 && legacyAdditions.length === 0) {
    return { entries, memberCount: rawMembers.length };
  }

  const migratedMembers = await redis.smembers<unknown[]>(indexKey);
  return {
    entries: migratedMembers
      .map(parseIndexedAIAttachment)
      .filter((entry): entry is IndexedAIAttachment => entry !== null),
    memberCount: migratedMembers.length,
  };
}

function parseStoredConversationValue(
  raw: unknown,
): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "string") return isRecord(raw) ? raw : null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectAIAttachmentReferences(
  messages: readonly unknown[],
  strict: boolean,
): Map<string, AIAttachmentReference> | null {
  const references = new Map<string, AIAttachmentReference>();
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) {
      if (strict) return null;
      continue;
    }
    for (const part of message.parts) {
      if (!isRecord(part) || typeof part.type !== "string") {
        if (strict) return null;
        continue;
      }
      if (part.type !== "file") continue;
      const attachment = parseAIAttachmentUrl(part.url);
      const mediaType = part.mediaType;
      if (
        !attachment ||
        !isAIAttachmentMediaType(mediaType) ||
        (attachment.mediaType !== null && attachment.mediaType !== mediaType)
      ) {
        if (strict) return null;
        continue;
      }
      references.set(`${attachment.name}\0${mediaType}`, {
        name: attachment.name,
        mediaType,
        legacyName: attachment.mediaType === null,
      });
    }
  }
  return references;
}

function collectAttachmentNamesFromMessages(
  messages: readonly unknown[],
): Set<string> | null {
  const references = collectAIAttachmentReferences(messages, true);
  return references
    ? new Set([...references.values()].map((reference) => reference.name))
    : null;
}

export function collectAIAttachmentNamesFromMessages(
  messages: readonly unknown[],
): string[] {
  const references = collectAIAttachmentReferences(messages, false);
  return references
    ? [...new Set([...references.values()].map((reference) => reference.name))]
    : [];
}

async function getReferencedAIAttachmentNames(
  redis: AIAttachmentRedis,
  username: string,
): Promise<Set<string> | null> {
  const [chatRaw, assistantRaw] = await Promise.all([
    redis.get(redisKeys.chat.aiConversation(username, "chat")),
    redis.get(redisKeys.chat.aiConversation(username, "assistant")),
  ]);
  const referenced = new Set<string>();
  for (const raw of [chatRaw, assistantRaw]) {
    const conversation = parseStoredConversationValue(raw);
    if (!conversation) return null;
    if (!Object.hasOwn(conversation, "messages")) continue;
    if (!Array.isArray(conversation.messages)) return null;
    const names = collectAttachmentNamesFromMessages(conversation.messages);
    if (!names) return null;
    for (const name of names) referenced.add(name);
  }
  return referenced;
}

async function deleteAIAttachmentObject({
  username,
  name,
  storageUrl,
}: {
  username: string;
  name: string | null;
  storageUrl: string | null;
}): Promise<void> {
  if (storageUrl) {
    await deleteStoredObject(storageUrl);
  } else if (name) {
    await deletePrivateStoredObjectByPathname(
      getAIAttachmentPath(username, name),
    );
  }
}

async function deleteIndexedAIAttachments(
  redis: AIAttachmentRedis,
  username: string,
  indexKey: string,
  entries: readonly IndexedAIAttachment[],
  strict = false,
): Promise<number> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      if (entry.state === "invalid" && !entry.storageUrl) return 0;
      try {
        await deleteAIAttachmentObject({
          username,
          name: entry.state === "invalid" ? null : entry.name,
          storageUrl: entry.state === "pending" ? null : entry.storageUrl,
        });
        const removed = await redis.srem(indexKey, entry.member);
        if (removed > 0 && entry.state === "ready" && entry.legacyMetadata) {
          await redis.set(
            redisKeys.chat.legacyAIAttachmentMetadata(username, entry.name),
            LEGACY_ATTACHMENT_RECLAIMED_VALUE,
          );
        }
        return removed;
      } catch (error) {
        if (strict) throw error;
        return 0;
      }
    }),
  );
  return results.reduce((total, result) => total + result, 0);
}

async function reclaimStaleUnreferencedAIAttachments({
  redis,
  username,
  entries,
  now,
}: {
  redis: AIAttachmentRedis;
  username: string;
  entries: readonly IndexedAIAttachment[];
  now: number;
}): Promise<number> {
  const referenced = await getReferencedAIAttachmentNames(redis, username);
  if (!referenced) return 0;
  const staleBefore = now - AI_ATTACHMENT_ORPHAN_GRACE_MS;
  const stale = entries.filter(
    (entry): entry is PendingIndexedAIAttachment | ReadyIndexedAIAttachment =>
      entry.state !== "invalid" &&
      entry.createdAt <= staleBefore &&
      !referenced.has(entry.name),
  );
  return deleteIndexedAIAttachments(
    redis,
    username,
    redisKeys.chat.aiAttachments(username),
    stale,
  );
}

async function assertCurrentAccountGeneration({
  redis,
  username,
  accountCreatedAt,
}: {
  redis: AIAttachmentRedis;
  username: string;
  accountCreatedAt: number;
}): Promise<void> {
  const [tombstone, rawAccount] = await Promise.all([
    redis.get(redisKeys.chat.aiConversationTombstone(username)),
    redis.get(redisKeys.auth.userProfile(username)),
  ]);
  const account = parseStoredUser(rawAccount);
  if (
    tombstone !== null ||
    typeof account?.createdAt !== "number" ||
    account.createdAt !== accountCreatedAt
  ) {
    throw new Error("account_changed");
  }
}

async function removePendingAIAttachmentReservation({
  redis,
  username,
  name,
  token,
}: {
  redis: AIAttachmentRedis;
  username: string;
  name: string;
  token: string;
}): Promise<void> {
  await withAIAttachmentLock({
    redis,
    username,
    attempts: 1,
    task: async () => {
      const indexKey = redisKeys.chat.aiAttachments(username);
      const rawMembers = await redis.smembers<unknown[]>(indexKey);
      const pending = rawMembers
        .map(parseIndexedAIAttachment)
        .find(
          (entry): entry is PendingIndexedAIAttachment =>
            entry?.state === "pending" &&
            entry.name === name &&
            entry.token === token,
        );
      if (pending) await redis.srem(indexKey, pending.member);
    },
  });
}

export async function createAIAttachment({
  redis,
  username,
  accountCreatedAt,
  mediaType,
  bytes,
}: {
  redis: AIAttachmentRedis;
  username: string;
  accountCreatedAt: number;
  mediaType: unknown;
  bytes: Uint8Array;
}): Promise<{ mediaType: AIAttachmentMediaType; url: string }> {
  if (
    !isAIAttachmentMediaType(mediaType) ||
    bytes.byteLength <= 0 ||
    bytes.byteLength > AI_ATTACHMENT_MAX_BYTES ||
    getImageSignatureMediaType(bytes) !== mediaType
  ) {
    throw new Error("invalid_image");
  }

  const reservation = await withAIAttachmentLock({
    redis,
    username,
    task: async (lockToken) => {
      await assertCurrentAccountGeneration({
        redis,
        username,
        accountCreatedAt,
      });

      const now = Date.now();
      const indexKey = redisKeys.chat.aiAttachments(username);
      let index = await loadAndMigrateAIAttachmentIndex({
        redis,
        username,
        lockToken,
        now,
      });
      if (index.memberCount >= MAX_STORED_ATTACHMENTS) {
        await reclaimStaleUnreferencedAIAttachments({
          redis,
          username,
          entries: index.entries,
          now,
        });
        index = await loadAndMigrateAIAttachmentIndex({
          redis,
          username,
          lockToken,
          now,
        });
      }
      if (index.memberCount >= MAX_STORED_ATTACHMENTS) {
        throw new Error("attachment_quota_exceeded");
      }

      const name = createAIAttachmentName(crypto.randomUUID(), mediaType);
      const token = crypto.randomUUID();
      const pendingMember = serializePendingAIAttachment({
        name,
        token,
        createdAt: now,
      });
      const reserved = await redis.eval<number>(
        RESERVE_ATTACHMENT_SCRIPT,
        [
          redisKeys.chat.aiAttachmentsLock(username),
          redisKeys.chat.aiConversationTombstone(username),
          indexKey,
        ],
        [lockToken, pendingMember, MAX_STORED_ATTACHMENTS],
      );
      if (reserved === -1) throw new Error("attachment_busy");
      if (reserved === -2) throw new Error("account_changed");
      if (reserved !== 1) {
        throw new Error("attachment_quota_exceeded");
      }
      return { name, token, pendingMember, createdAt: now };
    },
  });

  const pathname = getAIAttachmentPath(username, reservation.name);
  let storageUrl: string;
  try {
    storageUrl = await uploadPrivateStoredObject({
      pathname,
      contentType: mediaType,
      body: bytes,
      maximumSizeInBytes: AI_ATTACHMENT_MAX_BYTES,
    });
  } catch (error) {
    const deleted = await deletePrivateStoredObjectByPathname(pathname)
      .then(() => true)
      .catch(() => false);
    if (deleted) {
      await removePendingAIAttachmentReservation({
        redis,
        username,
        name: reservation.name,
        token: reservation.token,
      }).catch(() => {});
    }
    throw error;
  }

  try {
    await withAIAttachmentLock({
      redis,
      username,
      task: async (lockToken) => {
        await assertCurrentAccountGeneration({
          redis,
          username,
          accountCreatedAt,
        });
        const readyMember = serializeReadyAIAttachment({
          name: reservation.name,
          storageUrl,
          createdAt: reservation.createdAt,
        });
        const finalized = await redis.eval<number>(
          FINALIZE_ATTACHMENT_SCRIPT,
          [
            redisKeys.chat.aiAttachmentsLock(username),
            redisKeys.chat.aiConversationTombstone(username),
            redisKeys.chat.aiAttachments(username),
          ],
          [lockToken, reservation.pendingMember, readyMember],
        );
        if (finalized === -1) throw new Error("attachment_busy");
        if (finalized !== 1) throw new Error("account_changed");
      },
    });
  } catch (error) {
    const deleted = await deletePrivateStoredObjectByPathname(pathname)
      .then(() => true)
      .catch(() => false);
    if (deleted) {
      await removePendingAIAttachmentReservation({
        redis,
        username,
        name: reservation.name,
        token: reservation.token,
      }).catch(() => {});
    }
    throw error;
  }

  return { mediaType, url: getAIAttachmentUrl(reservation.name) };
}

export async function readAIAttachment({
  username,
  url,
}: {
  username: string;
  url: string;
}): Promise<{ bytes: Uint8Array; mediaType: AIAttachmentMediaType }> {
  const attachment = parseAIAttachmentUrl(url);
  if (!attachment) throw new Error("attachment_not_found");
  const bytes = await downloadPrivateStoredObjectByPathname(
    getAIAttachmentPath(username, attachment.name),
    AI_ATTACHMENT_MAX_BYTES,
  );
  const mediaType = getImageSignatureMediaType(bytes);
  if (
    !mediaType ||
    (attachment.mediaType !== null && attachment.mediaType !== mediaType)
  ) {
    throw new Error("attachment_not_found");
  }
  return { bytes, mediaType };
}

export class AIAttachmentReferenceError extends Error {
  constructor() {
    super("attachment_not_found");
    this.name = "AIAttachmentReferenceError";
  }
}

export async function withAIAttachmentReferenceLock<T>({
  redis,
  username,
  messages,
  task,
}: {
  redis: AIAttachmentRedis;
  username: string;
  messages: readonly unknown[];
  task: () => Promise<T>;
}): Promise<T> {
  const references = collectAIAttachmentReferences(messages, false);
  if (!references || references.size === 0) {
    return task();
  }

  return withAIAttachmentLock({
    redis,
    username,
    task: async (lockToken) => {
      const tombstone = await redis.get(
        redisKeys.chat.aiConversationTombstone(username),
      );
      if (tombstone !== null) throw new AIAttachmentReferenceError();

      const index = await loadAndMigrateAIAttachmentIndex({
        redis,
        username,
        lockToken,
        now: Date.now(),
      });
      for (const reference of references.values()) {
        const ready = index.entries.find(
          (entry): entry is ReadyIndexedAIAttachment =>
            entry.state === "ready" && entry.name === reference.name,
        );
        if (ready && !reference.legacyName) continue;
        if (!reference.legacyName) {
          throw new AIAttachmentReferenceError();
        }

        let bytes: Uint8Array;
        try {
          bytes = await downloadPrivateStoredObjectByPathname(
            getAIAttachmentPath(username, reference.name),
            AI_ATTACHMENT_MAX_BYTES,
          );
        } catch {
          throw new AIAttachmentReferenceError();
        }
        if (getImageSignatureMediaType(bytes) !== reference.mediaType) {
          throw new AIAttachmentReferenceError();
        }
        if (ready) continue;

        const createdAt = Date.now();
        const member = serializeReadyAIAttachment({
          name: reference.name,
          storageUrl: null,
          createdAt,
        });
        const added = await redis.eval<number>(
          ADD_ATTACHMENT_INDEX_MEMBER_SCRIPT,
          [
            redisKeys.chat.aiAttachmentsLock(username),
            redisKeys.chat.aiConversationTombstone(username),
            redisKeys.chat.aiAttachments(username),
          ],
          [lockToken, member],
        );
        if (added === -1) throw new Error("attachment_busy");
        if (added === -2) throw new AIAttachmentReferenceError();
        index.entries.push({
          state: "ready",
          member,
          name: reference.name,
          storageUrl: null,
          createdAt,
          needsMigration: false,
          legacyMetadata: false,
        });
      }
      return task();
    },
  });
}

export async function resolveAIAttachmentsForModel({
  username,
  messages,
}: {
  username: string;
  messages: UIMessage[];
}): Promise<UIMessage[]> {
  let remainingImages = MAX_MODEL_IMAGES;
  let remainingBytes = MAX_MODEL_IMAGE_BYTES;
  const resolved = [...messages];

  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    const message = resolved[index];
    if (!message) continue;
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file" || !parseAIAttachmentUrl(part.url)) {
        parts.push(part);
        continue;
      }
      if (remainingImages <= 0) continue;
      try {
        const attachment = await readAIAttachment({
          username,
          url: part.url,
        });
        if (attachment.bytes.byteLength > remainingBytes) continue;
        remainingImages -= 1;
        remainingBytes -= attachment.bytes.byteLength;
        parts.push({
          ...part,
          mediaType: attachment.mediaType,
          url: `data:${attachment.mediaType};base64,${Buffer.from(
            attachment.bytes,
          ).toString("base64")}`,
        });
      } catch {
        // A missing image should not make the rest of the conversation unusable.
      }
    }
    resolved[index] = { ...message, parts };
  }

  return resolved;
}

export async function deleteAllAIAttachments(
  redis: AIAttachmentRedis,
  username: string,
): Promise<number> {
  return withAIAttachmentLock({
    redis,
    username,
    task: async () => {
      const indexKey = redisKeys.chat.aiAttachments(username);
      const [rawMembers, legacyAttachments] = await Promise.all([
        redis.smembers<unknown[]>(indexKey),
        loadLegacyAIAttachments({ redis, username, now: Date.now() }),
      ]);
      const entries = rawMembers
        .map(parseIndexedAIAttachment)
        .filter((entry): entry is IndexedAIAttachment => entry !== null);
      const deletionTargets = new Map<
        string,
        { name: string | null; storageUrl: string | null }
      >();
      for (const entry of entries) {
        const storageUrl = entry.state === "pending" ? null : entry.storageUrl;
        const name = entry.state === "invalid" ? null : entry.name;
        if (!storageUrl && !name) continue;
        deletionTargets.set(name ? `name:${name}` : `url:${storageUrl}`, {
          name,
          storageUrl,
        });
      }
      for (const legacy of legacyAttachments) {
        deletionTargets.set(`name:${legacy.name}`, {
          name: legacy.name,
          storageUrl: legacy.storageUrl,
        });
      }
      await Promise.all(
        [...deletionTargets.values()].map((target) =>
          deleteAIAttachmentObject({ username, ...target }),
        ),
      );
      return redis.del(
        indexKey,
        ...legacyAttachments.map((attachment) => attachment.metadataKey),
        redisKeys.chat.legacyAIAttachmentIds(username),
        redisKeys.chat.legacyAIAttachmentBytes(username),
      );
    },
  });
}

export async function deleteUnreferencedAIAttachmentsForNames({
  redis,
  username,
  names,
}: {
  redis: AIAttachmentRedis;
  username: string;
  names: readonly string[];
}): Promise<number> {
  const candidates = new Set(
    names.flatMap((name) => {
      const attachment = parseAIAttachmentName(name);
      return attachment ? [attachment.name] : [];
    }),
  );
  if (candidates.size === 0) return 0;

  return withAIAttachmentLock({
    redis,
    username,
    task: async (lockToken) => {
      const referenced = await getReferencedAIAttachmentNames(redis, username);
      if (!referenced) {
        throw new Error("attachment_reference_check_failed");
      }
      const indexKey = redisKeys.chat.aiAttachments(username);
      const index = await loadAndMigrateAIAttachmentIndex({
        redis,
        username,
        lockToken,
        now: Date.now(),
      });
      let removed = 0;
      for (const name of candidates) {
        if (referenced.has(name)) continue;
        const entries = index.entries.filter(
          (
            entry,
          ): entry is PendingIndexedAIAttachment | ReadyIndexedAIAttachment =>
            entry.state !== "invalid" && entry.name === name,
        );
        if (entries.length === 0) {
          await deletePrivateStoredObjectByPathname(
            getAIAttachmentPath(username, name),
          );
          continue;
        }
        removed += await deleteIndexedAIAttachments(
          redis,
          username,
          indexKey,
          entries,
          true,
        );
      }
      return removed;
    },
  });
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
  return withAIAttachmentLock({
    redis,
    username,
    task: async (lockToken) => {
      const index = await loadAndMigrateAIAttachmentIndex({
        redis,
        username,
        lockToken,
        now,
      });
      return reclaimStaleUnreferencedAIAttachments({
        redis,
        username,
        entries: index.entries,
        now,
      });
    },
  });
}
