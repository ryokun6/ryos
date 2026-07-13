import type { Redis } from "../../_utils/redis.js";
import { USER_TTL_SECONDS } from "../../_utils/auth/index.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import type { KosyncProgressRecord } from "./_types.js";

function documentKey(username: string, documentId: string): string {
  return redisKeys.integration.kosyncDocument(
    username.toLowerCase(),
    documentId
  );
}

function docPathsKey(username: string): string {
  return redisKeys.integration.kosyncDocPaths(username.toLowerCase());
}

function parseProgress(raw: unknown): KosyncProgressRecord | null {
  if (!raw) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const percentage = Number(record.percentage);
  const progress = record.progress;
  const device = record.device;
  const deviceId = record.device_id;
  const timestamp = Number(record.timestamp);
  if (
    !Number.isFinite(percentage) ||
    typeof progress !== "string" ||
    typeof device !== "string" ||
    typeof deviceId !== "string" ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }
  return {
    percentage,
    progress,
    device,
    device_id: deviceId,
    timestamp,
  };
}

export async function getKosyncProgress(
  redis: Redis,
  username: string,
  documentId: string
): Promise<KosyncProgressRecord | null> {
  const raw = await redis.get(documentKey(username, documentId));
  return parseProgress(raw);
}

export async function setKosyncProgress(
  redis: Redis,
  username: string,
  documentId: string,
  record: KosyncProgressRecord
): Promise<void> {
  await redis.set(documentKey(username, documentId), JSON.stringify(record), {
    ex: USER_TTL_SECONDS,
  });
}

export async function getKosyncDocPath(
  redis: Redis,
  username: string,
  documentId: string
): Promise<string | null> {
  const raw = await redis.hget<string>(docPathsKey(username), documentId);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function setKosyncDocPath(
  redis: Redis,
  username: string,
  documentId: string,
  path: string
): Promise<void> {
  const key = docPathsKey(username);
  await redis.hset(key, { [documentId]: path });
  await redis.expire(key, USER_TTL_SECONDS);
}
