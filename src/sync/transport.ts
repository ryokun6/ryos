import { ApiRequestError } from "@/api/core";
import {
  downloadLogicalSyncDomainPayload,
  prepareLogicalSyncAttachmentUpload,
} from "@/api/sync";
import { getSyncSessionId } from "@/utils/syncSession";
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
  try {
    return await downloadLogicalSyncDomainPayload<LogicalDomainResponse>(domain, {
      "X-Sync-Session-Id": getSyncSessionId(),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
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
  return prepareLogicalSyncAttachmentUpload(
    logicalDomain,
    {
      partDomain: domain,
      ...(itemKey ? { itemKey } : {}),
    },
    {
      "X-Sync-Session-Id": getSyncSessionId(),
    }
  );
}
