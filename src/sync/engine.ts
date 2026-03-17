import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  applyDownloadedCloudSyncDomainPayload,
  prepareCloudSyncDomainWrite,
} from "@/sync/domains";
import type {
  BlobIndividualDomainDownloadPayload,
  BlobMonolithicDomainDownloadPayload,
  PreparedCloudSyncDomainWrite,
  RedisStateDomainDownloadPayload,
} from "@/sync/types";
import { getSyncSessionId } from "@/utils/syncSession";
import {
  aggregateLogicalCloudSyncMetadata,
  getLogicalCloudSyncDomainPhysicalParts,
  type LogicalCloudSyncDomain,
  type LogicalCloudSyncDomainMetadata,
} from "@/utils/syncLogicalDomains";
import {
  createEmptyCloudSyncMetadataMap,
  isBlobSyncDomain,
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
} from "@/utils/cloudSyncShared";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";

type AuthContext = {
  username: string;
  isAuthenticated: boolean;
};

export interface LogicalCloudSyncTransferResult {
  metadata: LogicalCloudSyncDomainMetadata | null;
  partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>>;
  applied: boolean;
}

export interface LogicalCloudSyncDownloadOptions {
  shouldApplyPart?: (
    domain: CloudSyncDomain,
    metadata: CloudSyncDomainMetadata
  ) => boolean;
}

function aggregatePartMetadata(
  domain: LogicalCloudSyncDomain,
  partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>>
): LogicalCloudSyncDomainMetadata | null {
  const metadataMap = createEmptyCloudSyncMetadataMap();
  for (const [partDomain, metadata] of Object.entries(partMetadata) as Array<
    [CloudSyncDomain, CloudSyncDomainMetadata]
  >) {
    metadataMap[partDomain] = metadata;
  }

  return aggregateLogicalCloudSyncMetadata(metadataMap)[domain];
}

function logicalPartUsesIndexedDb(domain: CloudSyncDomain): boolean {
  return domain === "files-metadata" || isBlobSyncDomain(domain);
}

export async function uploadLogicalCloudSyncDomain(
  domain: LogicalCloudSyncDomain,
  auth: AuthContext,
  partDomains: CloudSyncDomain[] = getLogicalCloudSyncDomainPhysicalParts(domain)
): Promise<LogicalCloudSyncTransferResult> {
  const requestedPartDomains = new Set(partDomains);
  const preparedWrites: Partial<Record<CloudSyncDomain, PreparedCloudSyncDomainWrite>> = {};
  const writes: Partial<Record<CloudSyncDomain, Record<string, unknown>>> = {};
  const sharedDb = partDomains.some(logicalPartUsesIndexedDb)
    ? await ensureIndexedDBInitialized()
    : undefined;

  try {
    for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
      if (!requestedPartDomains.has(partDomain)) {
        continue;
      }
      const preparedWrite = await prepareCloudSyncDomainWrite(
        partDomain,
        auth,
        sharedDb
      );
      preparedWrites[partDomain] = preparedWrite;
      writes[partDomain] = preparedWrite.payload;
    }

    const response = await abortableFetch(
      getApiUrl(`/api/sync/domains/${encodeURIComponent(domain)}`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Session-Id": getSyncSessionId(),
        },
        body: JSON.stringify({ writes }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ||
          `Failed to upload logical sync domain ${domain}`
      );
    }

    const result = (await response.json()) as {
      metadata?: LogicalCloudSyncDomainMetadata | null;
      writes?: Partial<
        Record<
          CloudSyncDomain,
          { metadata?: CloudSyncDomainMetadata | null }
        >
      >;
    };

    const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};
    for (const partDomain of partDomains) {
      const metadata = result.writes?.[partDomain]?.metadata;
      if (!metadata) {
        continue;
      }
      partMetadata[partDomain] = metadata;
      await preparedWrites[partDomain]?.onCommitted?.(metadata);
    }

    return {
      metadata: result.metadata || aggregatePartMetadata(domain, partMetadata),
      partMetadata,
      applied: false,
    };
  } finally {
    sharedDb?.close();
  }
}

export async function downloadAndApplyLogicalCloudSyncDomain(
  domain: LogicalCloudSyncDomain,
  options?: LogicalCloudSyncDownloadOptions
): Promise<LogicalCloudSyncTransferResult> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/domains/${encodeURIComponent(domain)}`),
    {
      method: "GET",
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (response.status === 404) {
    throw new Error(`No ${domain} sync data found`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to download logical sync domain ${domain}`
    );
  }

  const payload = (await response.json()) as {
    parts?: Partial<
      Record<
        CloudSyncDomain,
        | RedisStateDomainDownloadPayload
        | BlobMonolithicDomainDownloadPayload
        | BlobIndividualDomainDownloadPayload
      >
    >;
  };

  if (!payload.parts) {
    throw new Error("Logical sync domain response was invalid.");
  }

  const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};
  let applied = false;
  const parts = Object.entries(payload.parts) as Array<
    [
      CloudSyncDomain,
      | RedisStateDomainDownloadPayload
      | BlobMonolithicDomainDownloadPayload
      | BlobIndividualDomainDownloadPayload
    ]
  >;
  const willApplyIndexedDbPart = parts.some(
    ([partDomain, partPayload]) =>
      logicalPartUsesIndexedDb(partDomain) &&
      (!options?.shouldApplyPart ||
        options.shouldApplyPart(partDomain, partPayload.metadata))
  );
  const sharedDb = willApplyIndexedDbPart
    ? await ensureIndexedDBInitialized()
    : undefined;

  try {
    for (const [partDomain, partPayload] of parts) {
      partMetadata[partDomain] = partPayload.metadata;
      if (
        options?.shouldApplyPart &&
        !options.shouldApplyPart(partDomain, partPayload.metadata)
      ) {
        continue;
      }

      const result = await applyDownloadedCloudSyncDomainPayload(
        partDomain,
        partPayload,
        {
          db: sharedDb,
        }
      );
      applied = applied || result.applied;
    }

    return {
      metadata: aggregatePartMetadata(domain, partMetadata),
      partMetadata,
      applied,
    };
  } finally {
    sharedDb?.close();
  }
}
