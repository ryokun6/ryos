import type { Redis } from "../_utils/redis.js";
import {
  aggregateLogicalCloudSyncMetadata,
  getLogicalCloudSyncDomainPhysicalParts,
  isLogicalCloudSyncDomain,
  type LogicalCloudSyncDomain,
  type LogicalCloudSyncMetadataMap,
} from "../../src/utils/cloudSyncLogical.js";
import {
  createEmptyCloudSyncMetadataMap,
  isBlobSyncDomain,
  isRedisSyncDomain,
  type BlobSyncDomain,
  type CloudSyncDomain,
  type CloudSyncMetadataMap,
  type RedisSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import {
  getBlobDomainDownloadPayload,
  readAutoSyncMetadata,
  saveBlobDomainMetadata,
  type BlobDomainDownloadPayload,
  type SaveAutoSyncMetadataBody,
  type SaveBlobDomainResult,
} from "./auto.js";
import {
  getRedisStateDomainPayload,
  putRedisStateDomain,
  readStateMetaMap,
  type PutRedisStateDomainResult,
  type PutStateBody,
  type RedisStateDomainPayload,
} from "./state.js";

export type LogicalSyncPartPayload =
  | RedisStateDomainPayload
  | BlobDomainDownloadPayload;

export interface LogicalDomainDownloadPayload {
  ok: true;
  domain: LogicalCloudSyncDomain;
  metadata: ReturnType<typeof aggregateLogicalCloudSyncMetadata>[LogicalCloudSyncDomain];
  parts: Partial<Record<CloudSyncDomain, LogicalSyncPartPayload>>;
}

export interface PutLogicalDomainBody {
  writes?: Partial<Record<CloudSyncDomain, PutStateBody | SaveAutoSyncMetadataBody>>;
}

export type PutLogicalDomainResult =
  | {
      ok: true;
      domain: LogicalCloudSyncDomain;
      metadata: ReturnType<typeof aggregateLogicalCloudSyncMetadata>[LogicalCloudSyncDomain];
      writes: Partial<
        Record<
          CloudSyncDomain,
          PutRedisStateDomainResult | SaveBlobDomainResult
        >
      >;
    }
  | {
      ok: false;
      status: 400 | 409 | 500;
      error: string;
      code?: string;
      metadata?: ReturnType<typeof aggregateLogicalCloudSyncMetadata>[LogicalCloudSyncDomain];
      partDomain?: CloudSyncDomain;
    };

export function parseLogicalDomainQuery(value: unknown): LogicalCloudSyncDomain | null {
  return isLogicalCloudSyncDomain(value) ? value : null;
}

export async function readLogicalCloudSyncMetadata(
  redis: Redis,
  username: string
): Promise<LogicalCloudSyncMetadataMap> {
  const [redisMeta, blobMeta] = await Promise.all([
    readStateMetaMap(redis, username),
    readAutoSyncMetadata(redis, username),
  ]);

  const physicalMetadata: CloudSyncMetadataMap = createEmptyCloudSyncMetadataMap();

  for (const [domain, entry] of Object.entries(redisMeta) as Array<
    [RedisSyncDomain, (typeof redisMeta)[RedisSyncDomain]]
  >) {
    physicalMetadata[domain] = entry
      ? {
          updatedAt: entry.updatedAt,
          version: entry.version,
          totalSize: 0,
          createdAt: entry.createdAt,
          syncVersion: entry.syncVersion,
        }
      : null;
  }

  for (const [domain, entry] of Object.entries(blobMeta) as Array<
    [BlobSyncDomain, (typeof blobMeta)[BlobSyncDomain]]
  >) {
    physicalMetadata[domain] = entry
      ? {
          updatedAt: entry.updatedAt,
          version: entry.version,
          totalSize: entry.totalSize,
          createdAt: entry.createdAt,
          syncVersion: entry.syncVersion,
        }
      : null;
  }

  return aggregateLogicalCloudSyncMetadata(physicalMetadata);
}

export async function getLogicalCloudSyncDomainPayload(
  redis: Redis,
  username: string,
  domain: LogicalCloudSyncDomain
): Promise<LogicalDomainDownloadPayload | null> {
  const parts: Partial<Record<CloudSyncDomain, LogicalSyncPartPayload>> = {};

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
    if (isRedisSyncDomain(partDomain)) {
      const payload = await getRedisStateDomainPayload(
        redis,
        username,
        partDomain
      );
      if (payload) {
        parts[partDomain] = payload;
      }
      continue;
    }

    if (isBlobSyncDomain(partDomain)) {
      const payload = await getBlobDomainDownloadPayload(
        redis,
        username,
        partDomain
      );
      if (payload) {
        parts[partDomain] = payload;
      }
    }
  }

  if (Object.keys(parts).length === 0) {
    return null;
  }

  const metadata = await readLogicalCloudSyncMetadata(redis, username);
  return {
    ok: true,
    domain,
    metadata: metadata[domain],
    parts,
  };
}

export async function putLogicalCloudSyncDomain(
  redis: Redis,
  username: string,
  logicalDomain: LogicalCloudSyncDomain,
  body: PutLogicalDomainBody | null,
  sourceSessionId: string | undefined
): Promise<PutLogicalDomainResult> {
  const writes = body?.writes;
  if (!writes || typeof writes !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Missing required field: writes",
    };
  }

  const allowedDomains = new Set(getLogicalCloudSyncDomainPhysicalParts(logicalDomain));
  const incomingDomains = Object.keys(writes) as CloudSyncDomain[];

  if (incomingDomains.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "At least one write is required",
    };
  }

  for (const domain of incomingDomains) {
    if (!allowedDomains.has(domain)) {
      return {
        ok: false,
        status: 400,
        error: `Physical domain ${domain} does not belong to logical domain ${logicalDomain}`,
        partDomain: domain,
      };
    }
  }

  const results: Partial<
    Record<CloudSyncDomain, PutRedisStateDomainResult | SaveBlobDomainResult>
  > = {};

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(logicalDomain)) {
    const write = writes[partDomain];
    if (!write) {
      continue;
    }

    const result = isRedisSyncDomain(partDomain)
      ? await putRedisStateDomain(
          redis,
          username,
          write as PutStateBody,
          sourceSessionId
        )
      : await saveBlobDomainMetadata(
          redis,
          username,
          write as SaveAutoSyncMetadataBody,
          sourceSessionId
        );

    results[partDomain] = result;

    if (!result.ok) {
      const metadata = await readLogicalCloudSyncMetadata(redis, username);
      return {
        ok: false,
        status: result.status,
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
        metadata: metadata[logicalDomain],
        partDomain,
      };
    }
  }

  const metadata = await readLogicalCloudSyncMetadata(redis, username);
  return {
    ok: true,
    domain: logicalDomain,
    metadata: metadata[logicalDomain],
    writes: results,
  };
}

