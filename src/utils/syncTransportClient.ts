import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
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

function getLogicalSyncDomainUrl(domain: LogicalCloudSyncDomain): string {
  return getApiUrl(`/api/sync/domains/${encodeURIComponent(domain)}`);
}

async function fetchLogicalDomainPayload(
  domain: LogicalCloudSyncDomain
): Promise<LogicalDomainResponse | null> {
  const response = await abortableFetch(getLogicalSyncDomainUrl(domain), {
    method: "GET",
    headers: {
      "X-Sync-Session-Id": getSyncSessionId(),
    },
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

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

export async function fetchLegacyRedisDomainSnapshot(
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

export async function putLegacyRedisDomainSnapshot(
  domain: RedisSyncDomain,
  payload: Record<string, unknown>
): Promise<CloudSyncDomainMetadata> {
  const response = await abortableFetch(getApiUrl("/api/sync/state"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Session-Id": getSyncSessionId(),
    },
    body: JSON.stringify(payload),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || `Failed to sync ${domain} state`
    );
  }

  const result = (await response.json()) as { metadata?: CloudSyncDomainMetadata };
  if (!result.metadata) {
    throw new Error("State sync response was invalid.");
  }

  return result.metadata;
}

export async function fetchLegacyBlobDomainPayload(
  domain: BlobSyncDomain
): Promise<DomainPayload | null> {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
  return extractPhysicalPartPayload(
    await fetchLogicalDomainPayload(logicalDomain),
    domain
  );
}

export async function requestLegacyBlobUploadInstruction(
  domain: BlobSyncDomain,
  itemKey?: string
): Promise<StorageUploadInstruction> {
  const logicalDomain = getLogicalCloudSyncDomainForPhysical(domain);
  const response = await abortableFetch(
    getApiUrl(
      `/api/sync/domains/${encodeURIComponent(logicalDomain)}/attachments/prepare`
    ),
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Session-Id": getSyncSessionId(),
    },
    body: JSON.stringify({
        partDomain: domain,
        ...(itemKey ? { itemKey } : {}),
      }),
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to get sync upload token"
    );
  }

  return (await response.json()) as StorageUploadInstruction;
}

export async function saveLegacyBlobDomainMetadata(
  payload: Record<string, unknown>
): Promise<CloudSyncDomainMetadata> {
  const response = await abortableFetch(getApiUrl("/api/sync/auto"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Session-Id": getSyncSessionId(),
    },
    body: JSON.stringify(payload),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to save sync metadata"
    );
  }

  const result = (await response.json()) as { metadata?: CloudSyncDomainMetadata };
  if (!result.metadata) {
    throw new Error("Sync metadata save response was invalid.");
  }

  return result.metadata;
}

export function isLegacyBlobIndividualPayload(
  payload: DomainPayload | null
): payload is DomainPayload & { mode: "individual"; items?: Record<string, unknown> } {
  return Boolean(payload && payload.mode === "individual");
}

export type LegacyBlobDomainPayload = DomainPayload;
export type LegacySyncDomainPayload = DomainPayload;
export type LegacyPhysicalDomain = CloudSyncDomain;

