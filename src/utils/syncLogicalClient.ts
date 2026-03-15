import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  applyDownloadedCloudSyncDomainPayload,
  prepareCloudSyncDomainWrite,
  type BlobIndividualDomainDownloadPayload,
  type BlobLegacyDomainDownloadPayload,
  type PreparedCloudSyncDomainWrite,
  type RedisStateDomainDownloadPayload,
} from "@/utils/cloudSync";
import { getSyncSessionId } from "@/utils/syncSession";
import {
  aggregateLogicalCloudSyncMetadata,
  getLogicalCloudSyncDomainPhysicalParts,
  type LogicalCloudSyncDomain,
  type LogicalCloudSyncDomainMetadata,
  type LogicalCloudSyncMetadataMap,
} from "@/utils/syncLogicalDomains";
import {
  createEmptyCloudSyncMetadataMap,
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
} from "@/utils/cloudSyncShared";

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

export async function fetchLogicalCloudSyncMetadata(
  _auth: AuthContext
): Promise<LogicalCloudSyncMetadataMap> {
  const response = await abortableFetch(getApiUrl("/api/sync/domains"), {
    method: "GET",
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        "Failed to fetch logical cloud sync metadata"
    );
  }

  const result = (await response.json()) as {
    metadata?: LogicalCloudSyncMetadataMap;
  };

  if (!result.metadata) {
    throw new Error("Logical sync metadata response was invalid.");
  }

  return result.metadata;
}

export async function uploadLogicalCloudSyncDomain(
  domain: LogicalCloudSyncDomain,
  auth: AuthContext,
  partDomains: CloudSyncDomain[] = getLogicalCloudSyncDomainPhysicalParts(domain)
): Promise<LogicalCloudSyncTransferResult> {
  const requestedPartDomains = new Set(partDomains);
  const preparedWrites: Partial<Record<CloudSyncDomain, PreparedCloudSyncDomainWrite>> = {};
  const writes: Partial<Record<CloudSyncDomain, Record<string, unknown>>> = {};

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
    if (!requestedPartDomains.has(partDomain)) {
      continue;
    }
    const preparedWrite = await prepareCloudSyncDomainWrite(partDomain, auth);
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
    metadata?: LogicalCloudSyncMetadataMap[LogicalCloudSyncDomain];
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
}

export async function downloadAndApplyLogicalCloudSyncDomain(
  domain: LogicalCloudSyncDomain,
  _auth: AuthContext,
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
        | BlobLegacyDomainDownloadPayload
        | BlobIndividualDomainDownloadPayload
      >
    >;
  };

  if (!payload.parts) {
    throw new Error("Logical sync domain response was invalid.");
  }

  const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};
  let applied = false;

  for (const [partDomain, partPayload] of Object.entries(payload.parts) as Array<
    [
      CloudSyncDomain,
      | RedisStateDomainDownloadPayload
      | BlobLegacyDomainDownloadPayload
      | BlobIndividualDomainDownloadPayload
    ]
  >) {
    partMetadata[partDomain] = partPayload.metadata;
    if (options?.shouldApplyPart && !options.shouldApplyPart(partDomain, partPayload.metadata)) {
      continue;
    }

    const result = await applyDownloadedCloudSyncDomainPayload(
      partDomain,
      partPayload
    );
    applied = applied || result.applied;
  }

  return {
    metadata: aggregatePartMetadata(domain, partMetadata),
    partMetadata,
    applied,
  };
}

