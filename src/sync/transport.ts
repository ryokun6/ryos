import {
  fetchLogicalCloudSyncDomainResponse,
  prepareCloudSyncAttachmentUpload,
} from "@/api/sync";
import {
  getLogicalCloudSyncDomainForPhysical,
  type LogicalCloudSyncDomain,
} from "@/utils/syncLogicalDomains";
import type {
  BlobSyncDomain,
  CloudSyncDomain,
  CloudSyncDomainMetadata,
  RedisSyncDomain,
} from "@/utils/cloudSyncShared";
import type { StorageUploadInstruction } from "@/utils/storageUpload";

type DomainPayload = {
  metadata: CloudSyncDomainMetadata;
  data?: unknown;
  mode?: "individual";
  items?: Record<string, unknown>;
  deletedItems?: Record<string, string>;
  downloadUrl?: string;
  blobUrl?: string;
};

interface LogicalDomainResponse {
  parts?: Partial<Record<CloudSyncDomain, DomainPayload>>;
}

async function fetchLogicalDomainPayload(
  domain: LogicalCloudSyncDomain
): Promise<LogicalDomainResponse | null> {
  const response = await fetchLogicalCloudSyncDomainResponse(domain);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to download logical sync domain ${domain}`
    );
  }

  return (await response.json()) as LogicalDomainResponse;
}

function extractPhysicalPartPayload(
  logicalPayload: LogicalDomainResponse | null,
  domain: CloudSyncDomain
): DomainPayload | null {
  return logicalPayload?.parts?.[domain] || null;
}

export async function fetchRedisDomainSnapshot(
  domain: RedisSyncDomain
): Promise<{ data: unknown; metadata: CloudSyncDomainMetadata } | null> {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
  const payload = extractPhysicalPartPayload(
    await fetchLogicalDomainPayload(logicalDomain),
    domain
  );
  if (!payload) {
    return null;
  }
  if (payload.data === undefined || !payload.metadata) {
    throw new Error("State download response was invalid.");
  }

  return {
    data: payload.data,
    metadata: payload.metadata,
  };
}

export async function fetchBlobDomainPayload(
  domain: BlobSyncDomain
): Promise<DomainPayload | null> {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
  return extractPhysicalPartPayload(
    await fetchLogicalDomainPayload(logicalDomain),
    domain
  );
}

export async function requestBlobUploadInstruction(
  domain: BlobSyncDomain,
  itemKey?: string
): Promise<StorageUploadInstruction> {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
  return prepareCloudSyncAttachmentUpload(logicalDomain, {
    partDomain: domain,
    ...(itemKey ? { itemKey } : {}),
  });
}
