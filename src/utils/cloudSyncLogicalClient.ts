import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  downloadAndApplyCloudSyncDomain,
  uploadCloudSyncDomain,
  type DownloadCloudSyncResult,
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
  auth: AuthContext
): Promise<LogicalCloudSyncTransferResult> {
  const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
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
  auth: AuthContext
): Promise<LogicalCloudSyncTransferResult> {
  const partMetadata: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>> = {};
  let applied = false;

  for (const partDomain of getLogicalCloudSyncDomainPhysicalParts(domain)) {
    const result: DownloadCloudSyncResult = await downloadAndApplyCloudSyncDomain(
      partDomain,
      auth
    );
    partMetadata[partDomain] = result.metadata;
    applied = applied || result.applied;
  }

  return {
    metadata: aggregatePartMetadata(domain, partMetadata),
    partMetadata,
    applied,
  };
}

