/**
 * Cloud Sync v2 HTTP transport: thin wrappers over the three data
 * endpoints plus the batched blob prepare/sign endpoint.
 */

import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import type {
  BlobUploadRequestItem,
  GetChangesResponse,
  GetSnapshotResponse,
  PostBlobsResponse,
  PostOpsResponse,
  SyncOp,
} from "@/shared/sync2/types";

async function parseJsonOrThrow<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || `${context} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function postSyncOps(
  clientId: string,
  ops: SyncOp[]
): Promise<PostOpsResponse> {
  const response = await abortableFetch(getApiUrl("/api/sync/v2/ops"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, ops }),
    timeout: 20000,
    throwOnHttpError: false,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
  return parseJsonOrThrow<PostOpsResponse>(response, "Sync upload");
}

export async function getSyncChanges(since: number): Promise<GetChangesResponse> {
  const response = await abortableFetch(
    getApiUrl(`/api/sync/v2/changes?since=${encodeURIComponent(since)}`),
    {
      method: "GET",
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    }
  );
  return parseJsonOrThrow<GetChangesResponse>(response, "Sync changes");
}

export async function getSyncSnapshot(): Promise<GetSnapshotResponse> {
  const response = await abortableFetch(getApiUrl("/api/sync/v2/snapshot"), {
    method: "GET",
    timeout: 30000,
    throwOnHttpError: false,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
  return parseJsonOrThrow<GetSnapshotResponse>(response, "Sync snapshot");
}

export async function postSyncBlobs(body: {
  upload?: BlobUploadRequestItem[];
  download?: string[];
}): Promise<PostBlobsResponse> {
  const response = await abortableFetch(getApiUrl("/api/sync/v2/blobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 20000,
    throwOnHttpError: false,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
  return parseJsonOrThrow<PostBlobsResponse>(response, "Sync blobs");
}
