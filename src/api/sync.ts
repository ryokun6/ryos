import { apiRequest, apiRequestRaw } from "@/api/core";
import { getSyncSessionId } from "@/utils/syncSession";
import type {
  CloudSyncDomain,
  CloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";
import type {
  LogicalCloudSyncDomain,
  LogicalCloudSyncDomainMetadata,
} from "@/utils/syncLogicalDomains";
import type { StorageUploadInstruction } from "@/utils/storageUpload";
import { getApiUrl } from "@/utils/platform";

const getSyncHeaders = (headers?: HeadersInit): Headers => {
  const merged = new Headers(headers);
  merged.set("X-Sync-Session-Id", getSyncSessionId());
  return merged;
};

export function getCloudBackupDownloadUrl(): string {
  return getApiUrl("/api/sync/backup");
}

export async function fetchCloudSyncStatus(): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>({
    path: "/api/sync/status",
    method: "GET",
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function requestCloudBackupUploadInstruction(): Promise<StorageUploadInstruction> {
  return apiRequest<StorageUploadInstruction>({
    path: "/api/sync/backup-token",
    method: "POST",
  });
}

export async function saveCloudBackupMetadata(payload: {
  storageUrl: string;
  timestamp: string;
  version: number;
  totalSize: number;
}): Promise<{ success?: boolean; error?: string }> {
  return apiRequest<{ success?: boolean; error?: string }, typeof payload>({
    path: "/api/sync/backup",
    method: "POST",
    body: payload,
  });
}

export async function fetchConsolidatedCloudSyncMetadata(): Promise<{
  physicalMetadata?: Partial<CloudSyncMetadataMap>;
}> {
  return apiRequest<{ physicalMetadata?: Partial<CloudSyncMetadataMap> }>({
    path: "/api/sync/domains",
    method: "GET",
    headers: getSyncHeaders(),
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function fetchLogicalCloudSyncDomainResponse(
  domain: LogicalCloudSyncDomain
): Promise<Response> {
  return apiRequestRaw({
    path: `/api/sync/domains/${encodeURIComponent(domain)}`,
    method: "GET",
    headers: getSyncHeaders(),
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function uploadLogicalCloudSyncDomainWrites(
  domain: LogicalCloudSyncDomain,
  writes: Partial<Record<CloudSyncDomain, Record<string, unknown>>>
): Promise<{
  metadata?: LogicalCloudSyncDomainMetadata | null;
  writes?: Partial<
    Record<CloudSyncDomain, { metadata?: Record<string, unknown> | null }>
  >;
}> {
  return apiRequest<
    {
      metadata?: LogicalCloudSyncDomainMetadata | null;
      writes?: Partial<
        Record<CloudSyncDomain, { metadata?: Record<string, unknown> | null }>
      >;
    },
    { writes: Partial<Record<CloudSyncDomain, Record<string, unknown>>> }
  >({
    path: `/api/sync/domains/${encodeURIComponent(domain)}`,
    method: "PUT",
    headers: getSyncHeaders(),
    body: { writes },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function prepareCloudSyncAttachmentUpload(
  domain: LogicalCloudSyncDomain,
  payload: { partDomain: CloudSyncDomain; itemKey?: string }
): Promise<StorageUploadInstruction> {
  return apiRequest<StorageUploadInstruction, typeof payload>({
    path: `/api/sync/domains/${encodeURIComponent(domain)}/attachments/prepare`,
    method: "POST",
    headers: getSyncHeaders(),
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
