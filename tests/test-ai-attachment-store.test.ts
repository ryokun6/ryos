import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UIMessage } from "ai";
import {
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
  parseAIAttachmentName,
  parseAIAttachmentUrl,
} from "../src/shared/contracts/aiAttachment";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

const actualStorage = { ...(await import("../api/_utils/storage")) };
const storedObjects = new Map<string, Uint8Array>();
const downloadedPathnames: string[] = [];
const deletedStorageUrls: string[] = [];
const deletedPathnames: string[] = [];
let deleteStorageError: Error | null = null;
let beforeUpload:
  | ((
      options: Parameters<typeof actualStorage.uploadPrivateStoredObject>[0],
    ) => Promise<void>)
  | null = null;
let beforeDownload:
  | ((pathname: string) => Promise<void>)
  | null = null;

function pathnameFromStorageUrl(storageUrl: string): string {
  return new URL(storageUrl).pathname.replace(/^\/+/, "");
}

function storageUrlForPath(pathname: string): string {
  return `s3://attachments-test/${pathname}`;
}

const uploadPrivateStoredObject = mock(
  async (
    options: Parameters<typeof actualStorage.uploadPrivateStoredObject>[0],
  ): Promise<string> => {
    await beforeUpload?.(options);
    storedObjects.set(options.pathname, new Uint8Array(options.body));
    return storageUrlForPath(options.pathname);
  },
);

const downloadPrivateStoredObjectByPathname = mock(
  async (pathname: string): Promise<Uint8Array> => {
    downloadedPathnames.push(pathname);
    await beforeDownload?.(pathname);
    const bytes = storedObjects.get(pathname);
    if (!bytes) throw new Error("missing test object");
    return new Uint8Array(bytes);
  },
);

const deleteStoredObject = mock(async (storageUrl: string): Promise<void> => {
  if (deleteStorageError) throw deleteStorageError;
  deletedStorageUrls.push(storageUrl);
  storedObjects.delete(pathnameFromStorageUrl(storageUrl));
});

const deletePrivateStoredObjectByPathname = mock(
  async (pathname: string): Promise<void> => {
    deletedPathnames.push(pathname);
    storedObjects.delete(pathname);
  },
);

mock.module("../api/_utils/storage.js", () => ({
  ...actualStorage,
  uploadPrivateStoredObject,
  downloadPrivateStoredObjectByPathname,
  deleteStoredObject,
  deletePrivateStoredObjectByPathname,
}));

afterAll(() => {
  mock.module("../api/_utils/storage.js", () => actualStorage);
});

const {
  AI_ATTACHMENT_ORPHAN_GRACE_MS,
  cleanupStaleAIAttachments,
  createAIAttachment,
  deleteAllAIAttachments,
  deleteUnreferencedAIAttachmentsForNames,
  getAIAttachmentPath,
  readAIAttachment,
  resolveAIAttachmentsForModel,
} = await import("../api/ai/attachments/_helpers/store");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const USERNAME = "alice";
const ACCOUNT_CREATED_AT = 1_720_000_000_000;
const LEGACY_NAME = "11111111-1111-4111-8111-111111111111";
const CURRENT_NAME = "22222222-2222-4222-8222-222222222222.png";

class AttachmentRedis extends FakeRedis {
  async eval<T = unknown>(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<T> {
    let result = 0;
    const lockKey = keys[0] ?? "";
    const lockToken = String(args[0] ?? "");
    if (script.includes("SCARD")) {
      if (this.kv.get(lockKey) !== lockToken) {
        result = -1;
      } else if (this.kv.has(keys[1] ?? "")) {
        result = -2;
      } else if ((this.sets.get(keys[2] ?? "")?.size ?? 0) >= Number(args[2])) {
        result = -3;
      } else {
        result = this.saddSync(keys[2] ?? "", String(args[1]));
      }
    } else if (script.includes("added + redis.call")) {
      if (this.kv.get(lockKey) !== lockToken) {
        result = -1;
      } else {
        for (let index = 1; index < args.length; index += 1) {
          result += this.saddSync(keys[1] ?? "", String(args[index]));
        }
      }
    } else if (script.includes("SISMEMBER")) {
      if (this.kv.get(lockKey) !== lockToken) {
        result = -1;
      } else if (script.includes("EXISTS") && this.kv.has(keys[1] ?? "")) {
        result = -2;
      } else {
        const indexKey = keys.at(-1) ?? "";
        if (script.includes("#ARGV")) {
          for (let index = 1; index < args.length; index += 2) {
            const member = String(args[index] ?? "");
            if (!this.sets.get(indexKey)?.has(member)) continue;
            this.sremSync(indexKey, member);
            this.saddSync(indexKey, String(args[index + 1] ?? ""));
            result += 1;
          }
        } else {
          const member = String(args[1] ?? "");
          if (!this.sets.get(indexKey)?.has(member)) {
            result = 0;
          } else {
            this.sremSync(indexKey, member);
            this.saddSync(indexKey, String(args[2] ?? ""));
            result = 1;
          }
        }
      }
    } else if (script.includes('return redis.call("SADD", KEYS[3], ARGV[2])')) {
      if (this.kv.get(lockKey) !== lockToken) {
        result = -1;
      } else if (this.kv.has(keys[1] ?? "")) {
        result = -2;
      } else {
        result = this.saddSync(keys[2] ?? "", String(args[1]));
      }
    } else if (script.includes('redis.call("SET", KEYS[3]')) {
      if (this.kv.get(lockKey) !== lockToken) {
        result = -1;
      } else if (this.kv.has(keys[1] ?? "")) {
        result = -2;
      } else {
        if (script.includes("KEYS[4]") && args[3] !== "") {
          this.setSync(keys[3] ?? "", String(args[3]));
        }
        this.setSync(keys[2] ?? "", String(args[1]));
        result = 1;
      }
    } else if (this.kv.get(lockKey) === lockToken) {
      result = this.delSync(lockKey);
    }
    return result as T;
  }
}

class UpstashShapedAttachmentRedis extends AttachmentRedis {
  async smembers<T = string[]>(key: string): Promise<T> {
    const members = await super.smembers<string[]>(key);
    return members.map((member) => {
      if (!member.startsWith("{")) return member;
      try {
        return JSON.parse(member) as unknown;
      } catch {
        return member;
      }
    }) as T;
  }
}

class LockOrderAttachmentRedis extends AttachmentRedis {
  observeConversationLocks = false;
  readonly attachmentHeldAtConversationLock: boolean[] = [];

  override async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown> {
    const isConversationLock =
      key === redisKeys.chat.aiConversationLock(USERNAME, "chat") ||
      key === redisKeys.chat.aiConversationLock(USERNAME, "assistant");
    if (this.observeConversationLocks && isConversationLock) {
      this.attachmentHeldAtConversationLock.push(
        this.kv.has(redisKeys.chat.aiAttachmentsLock(USERNAME)),
      );
    }
    return super.set(key, value, options);
  }
}

class FinalizationGateAttachmentRedis extends AttachmentRedis {
  private attachmentLockClaims = 0;
  private markFinalizationBlocked: () => void = () => {};
  private releaseFinalization: () => void = () => {};
  readonly finalizationBlocked = new Promise<void>((resolve) => {
    this.markFinalizationBlocked = resolve;
  });
  private readonly finalizationReleased = new Promise<void>((resolve) => {
    this.releaseFinalization = resolve;
  });

  allowFinalization(): void {
    this.releaseFinalization();
  }

  override async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown> {
    if (key === redisKeys.chat.aiAttachmentsLock(USERNAME)) {
      this.attachmentLockClaims += 1;
      if (this.attachmentLockClaims === 2) {
        this.markFinalizationBlocked();
        await this.finalizationReleased;
      }
    }
    return super.set(key, value, options);
  }
}

function indexEntry({
  name,
  storageUrl,
  createdAt,
}: {
  name: string;
  storageUrl: string;
  createdAt: number;
}): string {
  return JSON.stringify({ version: 1, storageUrl, name, createdAt });
}

function attachmentName(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}.png`;
}

function legacyAttachmentId(index: number): string {
  return attachmentName(index).slice(0, -4);
}

async function seedLegacyAttachment(
  redis: AttachmentRedis,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    redis.sadd(redisKeys.chat.legacyAIAttachmentIds(USERNAME), id),
    redis.set(
      redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, id),
      JSON.stringify(metadata),
    ),
  ]);
}

function fileMessage(id: string, names: string[]): unknown {
  return {
    id,
    role: "user",
    parts: names.map((name) => ({
      type: "file",
      mediaType: name.endsWith(".png") ? "image/png" : "image/jpeg",
      url: getAIAttachmentUrl(name),
    })),
  };
}

async function seedAccount(
  redis: AttachmentRedis,
  createdAt = ACCOUNT_CREATED_AT,
): Promise<void> {
  await redis.set(
    redisKeys.auth.userProfile(USERNAME),
    JSON.stringify({ username: USERNAME, createdAt }),
  );
}

function seedStoredObject(storageUrl: string, bytes = PNG_1X1): void {
  storedObjects.set(pathnameFromStorageUrl(storageUrl), new Uint8Array(bytes));
}

function createPng(
  redis: AttachmentRedis,
  accountCreatedAt = ACCOUNT_CREATED_AT,
) {
  return createAIAttachment({
    redis,
    username: USERNAME,
    accountCreatedAt,
    mediaType: "image/png",
    bytes: PNG_1X1,
  });
}

beforeEach(() => {
  storedObjects.clear();
  downloadedPathnames.length = 0;
  deletedStorageUrls.length = 0;
  deletedPathnames.length = 0;
  deleteStorageError = null;
  beforeUpload = null;
  beforeDownload = null;
  uploadPrivateStoredObject.mockClear();
  downloadPrivateStoredObjectByPathname.mockClear();
  deleteStoredObject.mockClear();
  deletePrivateStoredObjectByPathname.mockClear();
});

describe("AI attachment compatibility", () => {
  test("accepts legacy names and rejects inherited MIME property names", () => {
    expect(parseAIAttachmentName(LEGACY_NAME)).toEqual({
      name: LEGACY_NAME,
      mediaType: null,
    });
    expect(
      parseAIAttachmentUrl(
        `https://example.test/api/ai/attachments/${LEGACY_NAME}`,
      ),
    ).toEqual({ name: LEGACY_NAME, mediaType: null });
    expect(parseAIAttachmentName(CURRENT_NAME)).toEqual({
      name: CURRENT_NAME,
      mediaType: "image/png",
    });
    expect(isAIAttachmentMediaType("image/png")).toBe(true);
    expect(isAIAttachmentMediaType("toString")).toBe(false);
    expect(isAIAttachmentMediaType("constructor")).toBe(false);
  });

  test("reads a legacy object at its original path and resolves its signature for the model", async () => {
    const pathname = getAIAttachmentPath(USERNAME, LEGACY_NAME);
    storedObjects.set(pathname, PNG_1X1);
    const url = getAIAttachmentUrl(LEGACY_NAME);

    const attachment = await readAIAttachment({ username: USERNAME, url });
    expect(attachment.mediaType).toBe("image/png");
    expect(attachment.bytes).toEqual(PNG_1X1);

    const messages: UIMessage[] = [
      {
        id: "legacy-image",
        role: "user",
        parts: [{ type: "file", mediaType: "image/jpeg", url }],
      },
    ];
    const [resolved] = await resolveAIAttachmentsForModel({
      username: USERNAME,
      messages,
    });
    expect(resolved?.parts[0]).toMatchObject({
      type: "file",
      mediaType: "image/png",
    });
    expect(
      resolved?.parts[0]?.type === "file" ? resolved.parts[0].url : "",
    ).toStartWith("data:image/png;base64,");
    expect(downloadedPathnames).toEqual([pathname, pathname]);
  });
});

describe("historical attachment registry compatibility", () => {
  test("uses the exact legacy Redis key names", () => {
    expect(redisKeys.chat.legacyAIAttachmentIds("Alice")).toBe(
      "chat:ai:user:alice:attachment-ids",
    );
    expect(
      redisKeys.chat.legacyAIAttachmentMetadata(
        "Alice",
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      ),
    ).toBe(
      "chat:ai:user:alice:attachment:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(redisKeys.chat.legacyAIAttachmentBytes("Alice")).toBe(
      "chat:ai:user:alice:attachment-bytes",
    );
  });

  test("migrates exact legacy record shapes into quota and keeps UUID reads usable", async () => {
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const createdAt = new Date().toISOString();
    const ids = Array.from({ length: 512 }, (_, index) =>
      legacyAttachmentId(index + 10_000),
    );
    const readableId = ids[0];
    const missingMetadataId = ids.at(-1);
    if (!readableId || !missingMetadataId) {
      throw new Error("legacy attachment fixture is incomplete");
    }
    const readablePath = getAIAttachmentPath(USERNAME, readableId);
    const readableUrl = storageUrlForPath(readablePath);
    storedObjects.set(readablePath, PNG_1X1);
    await redis.sadd(redisKeys.chat.legacyAIAttachmentIds(USERNAME), ...ids);
    await redis.set(
      redisKeys.chat.legacyAIAttachmentBytes(USERNAME),
      String(512 * PNG_1X1.byteLength),
    );
    await Promise.all(
      ids.map((id, index) => {
        if (id === missingMetadataId) return Promise.resolve(null);
        const common = {
          version: 1,
          id,
          mediaType: "image/png",
          size: PNG_1X1.byteLength,
          sha256: "0".repeat(64),
          createdAt,
        };
        const metadata =
          index === 0
            ? { ...common, storageUrl: readableUrl }
            : index === 1
              ? {
                  ...common,
                  status: "pending",
                  pathname: getAIAttachmentPath(USERNAME, id),
                  provider: "s3",
                }
              : index === 2
                ? {
                    ...common,
                    status: "deleting",
                    storageUrl: storageUrlForPath(
                      getAIAttachmentPath(USERNAME, id),
                    ),
                    deletionStartedAt: createdAt,
                  }
                : {
                    ...common,
                    status: "pending",
                    pathname: getAIAttachmentPath(USERNAME, id),
                    provider: "s3",
                  };
        return redis.set(
          redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, id),
          JSON.stringify(metadata),
        );
      }),
    );

    await expect(createPng(redis)).rejects.toThrow("attachment_quota_exceeded");
    const migrated = await redis.smembers<string[]>(
      redisKeys.chat.aiAttachments(USERNAME),
    );
    expect(migrated).toHaveLength(512);
    expect(
      migrated.every(
        (member) =>
          member.startsWith("v1:") &&
          member.includes('"l":1') &&
          member.includes('"s":"r"'),
      ),
    ).toBe(true);
    expect(
      await redis.smembers(redisKeys.chat.legacyAIAttachmentIds(USERNAME)),
    ).toHaveLength(512);
    expect(
      await redis.get(
        redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, readableId),
      ),
    ).not.toBeNull();

    await expect(
      readAIAttachment({
        username: USERNAME,
        url: getAIAttachmentUrl(readableId),
      }),
    ).resolves.toMatchObject({ mediaType: "image/png" });

    expect(
      await cleanupStaleAIAttachments({
        redis,
        username: USERNAME,
        now: Date.now() + AI_ATTACHMENT_ORPHAN_GRACE_MS + 1,
      }),
    ).toBe(512);
    expect(
      await redis.smembers(redisKeys.chat.aiAttachments(USERNAME)),
    ).toEqual([]);
    expect(
      await redis.smembers(redisKeys.chat.legacyAIAttachmentIds(USERNAME)),
    ).toHaveLength(512);
    expect(
      await redis.get(redisKeys.chat.legacyAIAttachmentBytes(USERNAME)),
    ).not.toBeNull();
    expect(
      await redis.get(
        redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, readableId),
      ),
    ).toBe("v1:reclaimed");
    expect(
      await redis.get(
        redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, missingMetadataId),
      ),
    ).toBe("v1:reclaimed");
    await expect(createPng(redis)).resolves.toMatchObject({
      mediaType: "image/png",
    });
  });

  test("purges every legacy shape and retains keys when object deletion fails", async () => {
    const redis = new AttachmentRedis();
    const createdAt = "2025-01-02T03:04:05.000Z";
    const availableId = legacyAttachmentId(20_001);
    const pendingId = legacyAttachmentId(20_002);
    const deletingId = legacyAttachmentId(20_003);
    const availableUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, availableId),
    );
    const pendingPath = getAIAttachmentPath(USERNAME, pendingId);
    const deletingUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, deletingId),
    );
    await Promise.all([
      seedLegacyAttachment(redis, availableId, {
        version: 1,
        id: availableId,
        storageUrl: availableUrl,
        mediaType: "image/png",
        size: PNG_1X1.byteLength,
        sha256: "1".repeat(64),
        createdAt,
      }),
      seedLegacyAttachment(redis, pendingId, {
        version: 1,
        status: "pending",
        id: pendingId,
        pathname: pendingPath,
        provider: "s3",
        mediaType: "image/png",
        size: PNG_1X1.byteLength,
        sha256: "2".repeat(64),
        createdAt,
      }),
      seedLegacyAttachment(redis, deletingId, {
        version: 1,
        status: "deleting",
        id: deletingId,
        storageUrl: deletingUrl,
        mediaType: "image/png",
        size: PNG_1X1.byteLength,
        sha256: "3".repeat(64),
        createdAt,
        deletionStartedAt: createdAt,
      }),
      redis.set(redisKeys.chat.legacyAIAttachmentBytes(USERNAME), "2048"),
    ]);
    seedStoredObject(availableUrl);
    storedObjects.set(pendingPath, PNG_1X1);
    seedStoredObject(deletingUrl);

    await deleteAllAIAttachments(redis, USERNAME);

    expect(deletedStorageUrls).toEqual(
      expect.arrayContaining([availableUrl, deletingUrl]),
    );
    expect(deletedPathnames).toContain(pendingPath);
    expect(storedObjects.size).toBe(0);
    expect(
      await redis.smembers(redisKeys.chat.legacyAIAttachmentIds(USERNAME)),
    ).toEqual([]);
    expect(
      await redis.get(redisKeys.chat.legacyAIAttachmentBytes(USERNAME)),
    ).toBeNull();
    for (const id of [availableId, pendingId, deletingId]) {
      expect(
        await redis.get(
          redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, id),
        ),
      ).toBeNull();
    }

    const failedId = legacyAttachmentId(20_004);
    const failedUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, failedId),
    );
    await Promise.all([
      seedLegacyAttachment(redis, failedId, {
        version: 1,
        id: failedId,
        storageUrl: failedUrl,
        mediaType: "image/png",
        size: PNG_1X1.byteLength,
        sha256: "4".repeat(64),
        createdAt,
      }),
      redis.set(redisKeys.chat.legacyAIAttachmentBytes(USERNAME), "128"),
    ]);
    seedStoredObject(failedUrl);
    deleteStorageError = new Error("storage unavailable");

    await expect(deleteAllAIAttachments(redis, USERNAME)).rejects.toThrow(
      "storage unavailable",
    );
    expect(
      await redis.smembers(redisKeys.chat.legacyAIAttachmentIds(USERNAME)),
    ).toEqual([failedId]);
    expect(
      await redis.get(
        redisKeys.chat.legacyAIAttachmentMetadata(USERNAME, failedId),
      ),
    ).not.toBeNull();
    expect(
      await redis.get(redisKeys.chat.legacyAIAttachmentBytes(USERNAME)),
    ).toBe("128");
  });
});

describe("AI attachment locking and quota", () => {
  test("migrates Upstash-deserialized members to prefixed string records", async () => {
    const redis = new UpstashShapedAttachmentRedis();
    await seedAccount(redis);
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const name = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
    const storageUrl = storageUrlForPath(getAIAttachmentPath(USERNAME, name));
    const legacyMember = indexEntry({
      name,
      storageUrl,
      createdAt: Date.now(),
    });
    await redis.sadd(indexKey, legacyMember);

    expect(await redis.smembers(indexKey)).toEqual([JSON.parse(legacyMember)]);
    await createPng(redis);

    const storedMembers = [...(redis.sets.get(indexKey) ?? [])];
    expect(storedMembers).toHaveLength(2);
    expect(storedMembers.every((member) => member.startsWith("v1:"))).toBe(
      true,
    );
    expect(storedMembers.some((member) => member.includes('"s":"p"'))).toBe(
      false,
    );
    expect(storedMembers).not.toContain(legacyMember);
    expect(await redis.smembers(indexKey)).toEqual(storedMembers);
  });

  test("lets purge pass the reservation lease and rejects the in-flight upload", async () => {
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    let uploadPathname = "";
    let markUploadStarted: () => void = () => {};
    const uploadStarted = new Promise<void>((resolve) => {
      markUploadStarted = resolve;
    });
    let releaseUpload: () => void = () => {};
    const uploadReleased = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    beforeUpload = async (options) => {
      uploadPathname = options.pathname;
      markUploadStarted();
      await uploadReleased;
    };

    const creation = createPng(redis);
    await uploadStarted;
    expect(
      await redis.get(redisKeys.chat.aiAttachmentsLock(USERNAME)),
    ).toBeNull();
    await redis.set(redisKeys.chat.aiConversationTombstone(USERNAME), "1");
    let purgeFinished = false;
    const purge = deleteAllAIAttachments(redis, USERNAME).then((result) => {
      purgeFinished = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(purgeFinished).toBe(true);
    await purge;
    expect(
      await redis.smembers(redisKeys.chat.aiAttachments(USERNAME)),
    ).toEqual([]);

    releaseUpload();
    await expect(creation).rejects.toThrow("account_changed");
    expect(deletedPathnames).toContain(uploadPathname);
    expect(
      await redis.smembers(redisKeys.chat.aiAttachments(USERNAME)),
    ).toEqual([]);

    beforeUpload = null;
    await expect(createPng(redis)).rejects.toThrow("account_changed");
    await redis.del(redisKeys.chat.aiConversationTombstone(USERNAME));
    await seedAccount(redis, ACCOUNT_CREATED_AT + 1);
    await expect(createPng(redis, ACCOUNT_CREATED_AT)).rejects.toThrow(
      "account_changed",
    );
    expect(uploadPrivateStoredObject).toHaveBeenCalledTimes(1);
  });

  test("cannot resurrect an object when purge wins after upload", async () => {
    const redis = new FinalizationGateAttachmentRedis();
    await seedAccount(redis);

    const creation = createPng(redis);
    await redis.finalizationBlocked;
    expect(storedObjects.size).toBe(1);
    expect(
      (
        await redis.smembers<string[]>(redisKeys.chat.aiAttachments(USERNAME))
      ).some((member) => member.includes('"s":"p"')),
    ).toBe(true);

    await redis.set(redisKeys.chat.aiConversationTombstone(USERNAME), "1");
    await deleteAllAIAttachments(redis, USERNAME);
    redis.allowFinalization();

    await expect(creation).rejects.toThrow("account_changed");
    expect(storedObjects.size).toBe(0);
    expect(
      await redis.smembers(redisKeys.chat.aiAttachments(USERNAME)),
    ).toEqual([]);
  });

  test("enforces the 512-item boundary atomically across concurrent uploads", async () => {
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const existing = Array.from({ length: 511 }, (_, index) =>
      storageUrlForPath(getAIAttachmentPath(USERNAME, attachmentName(index))),
    );
    await redis.sadd(indexKey, ...existing);

    const results = await Promise.allSettled([
      createPng(redis),
      createPng(redis),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason?.message : null,
    ).toBe("attachment_quota_exceeded");
    expect(await redis.smembers(indexKey)).toHaveLength(512);
    expect(uploadPrivateStoredObject).toHaveBeenCalledTimes(1);
  });

  test("reclaims only stale unreferenced indexed uploads before rejecting quota", async () => {
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const now = Date.now();
    const staleOrphanName = "33333333-3333-4333-8333-333333333333.png";
    const staleReferencedName = "44444444-4444-4444-8444-444444444444.png";
    const freshOrphanName = "55555555-5555-4555-8555-555555555555.png";
    const staleOrphanUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, staleOrphanName),
    );
    const staleReferencedUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, staleReferencedName),
    );
    const freshOrphanUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, freshOrphanName),
    );
    const plain = Array.from({ length: 509 }, (_, index) =>
      storageUrlForPath(
        getAIAttachmentPath(USERNAME, attachmentName(index + 1_000)),
      ),
    );
    const staleOrphanMember = indexEntry({
      name: staleOrphanName,
      storageUrl: staleOrphanUrl,
      createdAt: now - AI_ATTACHMENT_ORPHAN_GRACE_MS - 1,
    });
    const staleReferencedMember = indexEntry({
      name: staleReferencedName,
      storageUrl: staleReferencedUrl,
      createdAt: now - AI_ATTACHMENT_ORPHAN_GRACE_MS - 1,
    });
    const freshOrphanMember = indexEntry({
      name: freshOrphanName,
      storageUrl: freshOrphanUrl,
      createdAt: now,
    });
    await redis.sadd(
      indexKey,
      ...plain,
      staleOrphanMember,
      staleReferencedMember,
      freshOrphanMember,
    );
    seedStoredObject(staleOrphanUrl);
    await redis.set(
      redisKeys.chat.aiConversation(USERNAME, "chat"),
      JSON.stringify({
        messages: [fileMessage("referenced", [staleReferencedName])],
      }),
    );

    const created = await createPng(redis);

    const members = await redis.smembers<string[]>(indexKey);
    expect(created.url).toMatch(/^\/api\/ai\/attachments\/[0-9a-f-]+\.png$/);
    expect(members).toHaveLength(512);
    expect(members).not.toContain(staleOrphanMember);
    expect(members).not.toContain(staleReferencedMember);
    expect(members).not.toContain(freshOrphanMember);
    expect(
      members.some(
        (member) =>
          member.startsWith("v1:") && member.includes(staleReferencedName),
      ),
    ).toBe(true);
    expect(
      members.some(
        (member) =>
          member.startsWith("v1:") && member.includes(freshOrphanName),
      ),
    ).toBe(true);
    expect(deletedStorageUrls).toEqual([staleOrphanUrl]);
  });

  test("makes a full legacy URL index reclaimable after first-seen migration", async () => {
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const legacyUrls = Array.from({ length: 512 }, (_, index) =>
      storageUrlForPath(
        getAIAttachmentPath(USERNAME, attachmentName(index + 2_000)),
      ),
    );
    await redis.sadd(indexKey, ...legacyUrls);

    await expect(createPng(redis)).rejects.toThrow("attachment_quota_exceeded");
    const migrated = await redis.smembers<string[]>(indexKey);
    expect(migrated).toHaveLength(512);
    expect(migrated.every((member) => member.startsWith("v1:"))).toBe(true);

    const removed = await cleanupStaleAIAttachments({
      redis,
      username: USERNAME,
      now: Date.now() + AI_ATTACHMENT_ORPHAN_GRACE_MS + 1,
    });
    expect(removed).toBe(512);
    expect(await redis.smembers(indexKey)).toEqual([]);
    await expect(createPng(redis)).resolves.toMatchObject({
      mediaType: "image/png",
    });
  });

  test("purges an uploaded object left behind by a pending reservation", async () => {
    const redis = new AttachmentRedis();
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const name = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";
    const pathname = getAIAttachmentPath(USERNAME, name);
    const pending = `v1:${JSON.stringify({
      s: "p",
      n: name,
      t: "crashed-upload",
      c: Date.now(),
    })}`;
    await redis.sadd(indexKey, pending);
    storedObjects.set(pathname, PNG_1X1);

    await deleteAllAIAttachments(redis, USERNAME);

    expect(deletedPathnames).toContain(pathname);
    expect(storedObjects.has(pathname)).toBe(false);
    expect(await redis.smembers(indexKey)).toEqual([]);
  });
});

describe("AI attachment cleanup", () => {
  test("uses ready owner-indexed metadata without reading object storage", async () => {
    const { getAIConversationPage, importAIConversationMessages } =
      await import("../api/ai/conversations/_helpers/store");
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const initial = await getAIConversationPage({
      redis,
      username: USERNAME,
      channel: "chat",
      limit: 10,
    });
    const created = await createPng(redis);
    const name = created.url.split("/").at(-1)!;

    await importAIConversationMessages({
      redis,
      username: USERNAME,
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "ready-index-only",
      messages: [fileMessage("ready-index-only", [name])],
    });

    expect(downloadPrivateStoredObjectByPathname).not.toHaveBeenCalled();
    expect(downloadedPathnames).toEqual([]);
  });

  test("finishes legacy object verification before claiming the conversation lock", async () => {
    const { getAIConversationPage, importAIConversationMessages } =
      await import("../api/ai/conversations/_helpers/store");
    const redis = new LockOrderAttachmentRedis();
    const initial = await getAIConversationPage({
      redis,
      username: USERNAME,
      channel: "assistant",
      limit: 10,
    });
    redis.observeConversationLocks = true;
    const pathname = getAIAttachmentPath(USERNAME, LEGACY_NAME);
    storedObjects.set(pathname, PNG_1X1);
    let markVerificationStarted: () => void = () => {};
    const verificationStarted = new Promise<void>((resolve) => {
      markVerificationStarted = resolve;
    });
    let releaseVerification: () => void = () => {};
    const verificationReleased = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    beforeDownload = async () => {
      markVerificationStarted();
      await verificationReleased;
    };

    const importing = importAIConversationMessages({
      redis,
      username: USERNAME,
      channel: "assistant",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "verify-before-conversation-lock",
      messages: [
        {
          id: "legacy-file",
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "image/png",
              url: getAIAttachmentUrl(LEGACY_NAME),
            },
          ],
        },
      ],
    });
    await verificationStarted;
    try {
      expect(
        await redis.get(redisKeys.chat.aiAttachmentsLock(USERNAME)),
      ).not.toBeNull();
      expect(
        await redis.get(
          redisKeys.chat.aiConversationLock(USERNAME, "assistant"),
        ),
      ).toBeNull();
      expect(redis.attachmentHeldAtConversationLock).toEqual([]);
    } finally {
      releaseVerification();
    }

    await expect(importing).resolves.toMatchObject({ revision: 1 });
    expect(redis.attachmentHeldAtConversationLock).toEqual([true]);
    expect(downloadedPathnames).toEqual([pathname]);
  });

  test("reset cleanup removes cleared-only names while preserving cross-channel and unrelated uploads", async () => {
    const redis = new AttachmentRedis();
    const indexKey = redisKeys.chat.aiAttachments(USERNAME);
    const clearedOnlyName = "66666666-6666-4666-8666-666666666666.png";
    const sharedName = "77777777-7777-4777-8777-777777777777.png";
    const unrelatedName = "88888888-8888-4888-8888-888888888888.png";
    const clearedOnlyUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, clearedOnlyName),
    );
    const sharedUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, sharedName),
    );
    const unrelatedUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, unrelatedName),
    );
    const sharedMember = indexEntry({
      name: sharedName,
      storageUrl: sharedUrl,
      createdAt: Date.now() - AI_ATTACHMENT_ORPHAN_GRACE_MS - 1,
    });
    const unrelatedMember = indexEntry({
      name: unrelatedName,
      storageUrl: unrelatedUrl,
      createdAt: Date.now(),
    });
    await redis.sadd(indexKey, clearedOnlyUrl, sharedMember, unrelatedMember);
    seedStoredObject(clearedOnlyUrl);
    seedStoredObject(sharedUrl);
    seedStoredObject(unrelatedUrl);
    await redis.set(
      redisKeys.chat.aiConversation(USERNAME, "chat"),
      JSON.stringify({ messages: [] }),
    );
    await redis.set(
      redisKeys.chat.aiConversation(USERNAME, "assistant"),
      JSON.stringify({ messages: [fileMessage("shared", [sharedName])] }),
    );

    const removed = await deleteUnreferencedAIAttachmentsForNames({
      redis,
      username: USERNAME,
      names: [clearedOnlyName, sharedName],
    });

    expect(removed).toBe(1);
    expect(deletedStorageUrls).toEqual([clearedOnlyUrl]);
    const retained = await redis.smembers<string[]>(indexKey);
    expect(retained).toHaveLength(2);
    expect(retained.every((member) => member.startsWith("v1:"))).toBe(true);
    expect(retained.some((member) => member.includes(sharedName))).toBe(true);
    expect(retained.some((member) => member.includes(unrelatedName))).toBe(
      true,
    );

    const purgeOnlyName = "99999999-9999-4999-8999-999999999999";
    const purgeOnlyUrl = storageUrlForPath(
      getAIAttachmentPath(USERNAME, purgeOnlyName),
    );
    await redis.sadd(indexKey, purgeOnlyUrl);
    seedStoredObject(purgeOnlyUrl);
    await deleteAllAIAttachments(redis, USERNAME);
    expect(deletedStorageUrls).toEqual([
      clearedOnlyUrl,
      sharedUrl,
      unrelatedUrl,
      purgeOnlyUrl,
    ]);
    expect(await redis.smembers(indexKey)).toEqual([]);
  });

  test("orders cleanup and attachment-bearing writes without dangling references", async () => {
    const { getAIConversationPage, importAIConversationMessages } =
      await import("../api/ai/conversations/_helpers/store");
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const initial = await getAIConversationPage({
      redis,
      username: USERNAME,
      channel: "chat",
      limit: 10,
    });
    const cleanedFirst = await createPng(redis);
    const cleanedFirstName = cleanedFirst.url.split("/").at(-1)!;

    expect(
      await deleteUnreferencedAIAttachmentsForNames({
        redis,
        username: USERNAME,
        names: [cleanedFirstName],
      }),
    ).toBe(1);
    await expect(
      importAIConversationMessages({
        redis,
        username: USERNAME,
        channel: "chat",
        expectedConversationId: initial.conversation.id,
        expectedRevision: 0,
        operationId: "cleanup-first",
        messages: [fileMessage("cleanup-first", [cleanedFirstName])],
      }),
    ).rejects.toMatchObject({ code: "attachment_not_found" });

    const writtenFirst = await createPng(redis);
    const writtenFirstName = writtenFirst.url.split("/").at(-1)!;
    await importAIConversationMessages({
      redis,
      username: USERNAME,
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "write-first",
      messages: [fileMessage("write-first", [writtenFirstName])],
    });
    expect(
      await deleteUnreferencedAIAttachmentsForNames({
        redis,
        username: USERNAME,
        names: [writtenFirstName],
      }),
    ).toBe(0);
    expect(
      storedObjects.has(getAIAttachmentPath(USERNAME, writtenFirstName)),
    ).toBe(true);
  });

  test("verifies and backfills an unindexed legacy reference before import", async () => {
    const { getAIConversationPage, importAIConversationMessages } =
      await import("../api/ai/conversations/_helpers/store");
    const redis = new AttachmentRedis();
    const initial = await getAIConversationPage({
      redis,
      username: USERNAME,
      channel: "assistant",
      limit: 10,
    });
    const pathname = getAIAttachmentPath(USERNAME, LEGACY_NAME);
    storedObjects.set(pathname, PNG_1X1);

    await importAIConversationMessages({
      redis,
      username: USERNAME,
      channel: "assistant",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "legacy-backfill",
      messages: [
        {
          id: "legacy-file",
          role: "user",
          parts: [
            {
              type: "file",
              mediaType: "image/png",
              url: getAIAttachmentUrl(LEGACY_NAME),
            },
          ],
        },
      ],
    });

    const members = await redis.smembers<string[]>(
      redisKeys.chat.aiAttachments(USERNAME),
    );
    expect(members).toHaveLength(1);
    expect(members[0]).toStartWith("v1:");
    expect(members[0]).toContain(LEGACY_NAME);
  });

  test("retains reset attachment cleanup after failure and retries it", async () => {
    const {
      getAIConversationPage,
      getPendingAIConversationResetMemory,
      importAIConversationMessages,
      resetAIConversation,
    } = await import("../api/ai/conversations/_helpers/store");
    const { extractPendingAIConversationResetMemory } =
      await import("../api/ai/conversations/_helpers/reset-memory");
    const redis = new AttachmentRedis();
    await seedAccount(redis);
    const initial = await getAIConversationPage({
      redis,
      username: USERNAME,
      channel: "assistant",
      limit: 10,
    });
    const created = await createPng(redis);
    const name = created.url.split("/").at(-1)!;
    await importAIConversationMessages({
      redis,
      username: USERNAME,
      channel: "assistant",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "seed-reset-attachment",
      messages: [
        {
          id: "assistant-file",
          role: "assistant",
          parts: [
            {
              type: "file",
              mediaType: "image/png",
              url: created.url,
            },
          ],
        },
      ],
    });
    await resetAIConversation({
      redis,
      username: USERNAME,
      channel: "assistant",
      conversationId: initial.conversation.id,
      operationId: "reset-with-attachment",
      accountCreatedAt: ACCOUNT_CREATED_AT,
    });
    expect(
      (
        await getPendingAIConversationResetMemory({
          redis,
          username: USERNAME,
          channel: "assistant",
        })
      )?.attachmentNames,
    ).toEqual([name]);

    deleteStorageError = new Error("transient storage failure");
    await expect(
      extractPendingAIConversationResetMemory({
        redis,
        username: USERNAME,
        channel: "assistant",
      }),
    ).rejects.toThrow("transient storage failure");
    expect(
      await getPendingAIConversationResetMemory({
        redis,
        username: USERNAME,
        channel: "assistant",
      }),
    ).not.toBeNull();

    deleteStorageError = null;
    await expect(
      extractPendingAIConversationResetMemory({
        redis,
        username: USERNAME,
        channel: "assistant",
      }),
    ).resolves.toMatchObject({ status: "processed" });
    expect(
      await getPendingAIConversationResetMemory({
        redis,
        username: USERNAME,
        channel: "assistant",
      }),
    ).toBeNull();
    expect(storedObjects.has(getAIAttachmentPath(USERNAME, name))).toBe(false);
  });

  test("wires account generation into upload and durable reset cleanup", () => {
    const uploadRoute = readFileSync(
      join(import.meta.dir, "../api/ai/attachments/index.ts"),
      "utf8",
    );
    const resetRoute = readFileSync(
      join(import.meta.dir, "../api/ai/conversations/[channel]/reset.ts"),
      "utf8",
    );
    const resetMemoryHelper = readFileSync(
      join(import.meta.dir, "../api/ai/conversations/_helpers/reset-memory.ts"),
      "utf8",
    );
    const attachmentStore = readFileSync(
      join(import.meta.dir, "../api/ai/attachments/_helpers/store.ts"),
      "utf8",
    );
    expect(uploadRoute).toContain("accountCreatedAt: account.createdAt");
    expect(attachmentStore).toContain("ATTACHMENT_LOCK_TTL_SECONDS = 120");
    expect(resetRoute).not.toContain(
      "deleteUnreferencedAIAttachmentsForMessages",
    );
    expect(resetMemoryHelper).toContain(
      "deleteUnreferencedAIAttachmentsForNames",
    );
    expect(
      resetMemoryHelper.indexOf("deleteUnreferencedAIAttachmentsForNames"),
    ).toBeLessThan(
      resetMemoryHelper.indexOf("extractMemoriesFromConversation({"),
    );
  });
});
