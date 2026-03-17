import { apiRequest } from "@/api/core";
import { getApiUrl } from "@/utils/platform";
import type {
  BlobSyncDomain,
} from "@/utils/cloudSyncShared";
import type { LogicalCloudSyncDomain } from "@/utils/syncLogicalDomains";
import type { CloudSyncMetadataMap } from "@/utils/cloudSyncShared";
import type { StorageUploadInstruction } from "@/utils/storageUpload";

export interface CloudBackupStatusResponse {
  hasBackup: boolean;
  metadata: {
    timestamp: string;
    version: number;
    totalSize: number;
    createdAt: string;
  } | null;
}

export interface CloudBackupDownloadResponse {
  ok?: boolean;
  data: string;
  metadata?: {
    timestamp: string;
    version: number;
    totalSize: number;
    createdAt: string;
  };
}

export async function getCloudBackupStatus(): Promise<CloudBackupStatusResponse> {
  return apiRequest<CloudBackupStatusResponse>({
    path: "/api/sync/status",
    method: "GET",
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function createCloudBackupUploadInstruction(): Promise<StorageUploadInstruction> {
  return apiRequest<StorageUploadInstruction>({
    path: "/api/sync/backup-token",
    method: "POST",
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function saveCloudBackupMetadata(payload: {
  storageUrl: string;
  timestamp: string;
  version: number;
  totalSize: number;
}): Promise<{
  ok: boolean;
  metadata?: {
    timestamp: string;
    version: number;
    totalSize: number;
    createdAt: string;
  };
}> {
  return apiRequest<{
    ok: boolean;
    metadata?: {
      timestamp: string;
      version: number;
      totalSize: number;
      createdAt: string;
    };
  }, typeof payload>({
    path: "/api/sync/backup",
    method: "POST",
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function downloadCloudBackupWithProgress(options: {
  onProgress?: (loaded: number, total: number) => void;
  timeout?: number;
} = {}): Promise<CloudBackupDownloadResponse> {
  const { onProgress, timeout = 120000 } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", getApiUrl("/api/sync/backup"), true);
    xhr.withCredentials = true;
    xhr.timeout = timeout;

    xhr.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as CloudBackupDownloadResponse;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }

        reject(
          new Error(
            (data as { error?: string }).error ||
              `Request failed with status ${xhr.status}`
          )
        );
      } catch (error) {
        reject(error);
      }
    };

    xhr.onerror = () => reject(new Error("Network error during download"));
    xhr.ontimeout = () => reject(new Error("Download timed out"));
    xhr.send();
  });
}

export async function fetchConsolidatedSyncMetadata(
  headers?: HeadersInit
): Promise<{
  physicalMetadata?: Partial<CloudSyncMetadataMap>;
}> {
  return apiRequest<{ physicalMetadata?: Partial<CloudSyncMetadataMap> }>({
    path: "/api/sync/domains",
    method: "GET",
    headers,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function uploadLogicalSyncDomainPayload<TResponse = unknown>(
  domain: LogicalCloudSyncDomain,
  writes: Record<string, unknown>,
  headers?: HeadersInit
): Promise<TResponse> {
  return apiRequest<TResponse, { writes: Record<string, unknown> }>({
    path: `/api/sync/domains/${encodeURIComponent(domain)}`,
    method: "PUT",
    headers,
    body: { writes },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function downloadLogicalSyncDomainPayload<TResponse = unknown>(
  domain: LogicalCloudSyncDomain,
  headers?: HeadersInit
): Promise<TResponse> {
  return apiRequest<TResponse>({
    path: `/api/sync/domains/${encodeURIComponent(domain)}`,
    method: "GET",
    headers,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function prepareLogicalSyncAttachmentUpload(
  logicalDomain: LogicalCloudSyncDomain,
  payload: {
    partDomain: BlobSyncDomain;
    itemKey?: string;
  },
  headers?: HeadersInit
): Promise<StorageUploadInstruction> {
  return apiRequest<StorageUploadInstruction, typeof payload>({
    path: `/api/sync/domains/${encodeURIComponent(logicalDomain)}/attachments/prepare`,
    method: "POST",
    headers,
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
