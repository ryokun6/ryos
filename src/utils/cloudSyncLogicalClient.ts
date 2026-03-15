import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  applyDownloadedCloudSyncDomainPayload,
  uploadCloudSyncDomain,
  type BlobIndividualDomainDownloadPayload,
  type BlobLegacyDomainDownloadPayload,
  type RedisStateDomainDownloadPayload,
} from "@/utils/cloudSync";
import {
  aggregateLogicalCloudSyncMetadata,
  getLogicalCloudSyncDomainPhysicalParts,
  type LogicalCloudSyncDomain,
  type LogicalCloudSyncDomainMetadata,
  type LogicalCloudSyncMetadataMap,
} from "@/utils/cloudSyncLogical";
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
  const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};
  const requestedPartDomains = new Set(partDomains);

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
    if (!requestedPartDomains.has(partDomain)) {
      continue;
    }
    const metadata = await uploadCloudSyncDomain(partDomain, auth);
    partMetadata[partDomain] = metadata;
  }

  return {
    metadata: aggregatePartMetadata(domain, partMetadata),
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

