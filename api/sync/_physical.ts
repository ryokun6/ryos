import type { Redis } from "../_utils/redis.js";
import type {
  BlobSyncDomain,
  CloudSyncDomain,
  CloudSyncDomainMetadata,
  RedisSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import {
  getBlobDomainDownloadPayload,
  saveBlobDomainMetadata,
  type BlobDomainDownloadPayload,
  type SaveBlobSyncMetadataBody,
  type SaveBlobDomainResult,
} from "./_blob.js";
import {
  getRedisStateDomainPayload,
  putRedisStateDomain,
  type PutRedisStateDomainResult,
  type PutStateBody,
  type RedisStateDomainPayload,
} from "./_state.js";

export type PhysicalSyncDomainPayload =
  | RedisStateDomainPayload
  | BlobDomainDownloadPayload;

export type PutPhysicalSyncDomainResult =
  | PutRedisStateDomainResult
  | SaveBlobDomainResult;

export async function getPhysicalSyncDomainPayload(
  redis: Redis,
  username: string,
  domain: CloudSyncDomain
): Promise<PhysicalSyncDomainPayload | null> {
  if (domain === "settings" ||
      domain === "files-metadata" ||
      domain === "songs" ||
      domain === "videos" ||
      domain === "tv" ||
      domain === "stickies" ||
      domain === "calendar" ||
      domain === "contacts") {
    return getRedisStateDomainPayload(redis, username, domain as RedisSyncDomain);
  }

  return getBlobDomainDownloadPayload(redis, username, domain as BlobSyncDomain);
}

export async function putPhysicalSyncDomain(
  redis: Redis,
  username: string,
  domain: CloudSyncDomain,
  body: PutStateBody | SaveBlobSyncMetadataBody | null,
  sourceSessionId: string | undefined
): Promise<PutPhysicalSyncDomainResult> {
  if (domain === "settings" ||
      domain === "files-metadata" ||
      domain === "songs" ||
      domain === "videos" ||
      domain === "tv" ||
      domain === "stickies" ||
      domain === "calendar" ||
      domain === "contacts") {
    return putRedisStateDomain(
      redis,
      username,
      body as PutStateBody,
      sourceSessionId
    );
  }

  return saveBlobDomainMetadata(
    redis,
    username,
    body as SaveBlobSyncMetadataBody,
    sourceSessionId
  );
}

export function extractPhysicalSyncDomainMetadata(
  result: PutPhysicalSyncDomainResult
): CloudSyncDomainMetadata | null {
  return result.ok ? result.metadata || null : result.metadata || null;
}

