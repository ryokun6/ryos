/**
 * Client facade for the cloud sync worker. Prefers running the CPU-heavy
 * sync transforms (serialize/hash/gzip/gunzip) in a dedicated Web Worker;
 * falls back to cooperative main-thread execution (with event-loop yields)
 * when workers are unavailable (tests, exotic embeds) or the worker fails.
 *
 * Both paths call the exact same task implementations in
 * `@/sync/workerTasks`, so shadow hashes and blob digests are identical
 * regardless of where they were computed.
 */

import { cloudSyncLog } from "@/sync/logging";
import {
  runDecodeBlobTask,
  runHashDocsTask,
  runPrepareBlobUpsertTask,
  type BlobUpsertCandidate,
  type BlobUpsertInput,
  type CloudSyncWorkerRequestBody,
  type CloudSyncWorkerResponse,
  type HashDocInput,
} from "@/sync/workerTasks";

const HASH_DOCS_YIELD_CHUNK = 25;
const BLOB_PREPARE_YIELD_INTERVAL = 4;

let worker: Worker | null = null;
let workerDisabled = false;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>();

function yieldToMainThread(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function isWorkerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof Worker === "function"
  );
}

function failWorker(error: Error): void {
  workerDisabled = true;
  try {
    worker?.terminate();
  } catch {
    // best-effort teardown
  }
  worker = null;
  for (const pending of pendingRequests.values()) {
    pending.reject(error);
  }
  pendingRequests.clear();
  cloudSyncLog.warn("Cloud sync worker disabled; using main-thread fallback", {
    error: error.message,
  });
}

function getWorker(): Worker | null {
  if (workerDisabled || !isWorkerSupported()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL("../workers/cloudSync.worker.ts", import.meta.url),
      { type: "module" }
    );
  } catch (error) {
    failWorker(
      error instanceof Error ? error : new Error("Worker construction failed")
    );
    return null;
  }
  worker.onmessage = (event: MessageEvent<CloudSyncWorkerResponse>) => {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error));
    }
  };
  worker.onerror = () => failWorker(new Error("Cloud sync worker crashed"));
  worker.onmessageerror = () =>
    failWorker(new Error("Cloud sync worker message deserialization failed"));
  return worker;
}

/**
 * Post one request to the worker. Returns null when no worker is available
 * or the request could not be sent (caller should run the fallback).
 * Worker-side task errors also resolve to null so the caller retries
 * locally — a task may fail in the worker for transport reasons (e.g.
 * structured clone limits) that don't apply on the main thread.
 */
async function dispatch(
  request: CloudSyncWorkerRequestBody
): Promise<unknown | null> {
  const target = getWorker();
  if (!target) return null;
  const id = nextRequestId;
  nextRequestId += 1;
  const result = new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
  });
  try {
    target.postMessage({ ...request, id });
  } catch (error) {
    pendingRequests.delete(id);
    cloudSyncLog.warn("Cloud sync worker request not cloneable; falling back", {
      type: request.type,
      error,
    });
    return null;
  }
  try {
    return await result;
  } catch (error) {
    cloudSyncLog.warn("Cloud sync worker task failed; falling back", {
      type: request.type,
      error,
    });
    return null;
  }
}

/** Compute shadow hashes for a batch of documents. */
export async function hashDocsOffThread(
  docs: readonly HashDocInput[]
): Promise<Map<string, string>> {
  if (docs.length === 0) return new Map();
  const result = (await dispatch({
    type: "hash-docs",
    docs: [...docs],
  })) as Array<[string, string]> | null;
  if (result) return new Map(result);

  const hashes = new Map<string, string>();
  for (let offset = 0; offset < docs.length; offset += HASH_DOCS_YIELD_CHUNK) {
    if (offset > 0) await yieldToMainThread();
    const chunk = docs.slice(offset, offset + HASH_DOCS_YIELD_CHUNK);
    for (const [key, hash] of runHashDocsTask(chunk)) {
      hashes.set(key, hash);
    }
  }
  return hashes;
}

/**
 * Serialize, digest, and (when changed or forced) gzip raw blob store items.
 * Blob-typed fields transfer to the worker by reference, so the expensive
 * base64 + stringify + digest + gzip pipeline runs entirely off-thread.
 */
export async function prepareBlobUpsertsOffThread(
  items: readonly BlobUpsertInput[],
  shadowHashes: Record<string, string>,
  force: boolean
): Promise<BlobUpsertCandidate[]> {
  if (items.length === 0) return [];
  const result = (await dispatch({
    type: "prepare-blob-upserts",
    items: [...items],
    shadowHashes,
    force,
  })) as BlobUpsertCandidate[] | null;
  if (result) return result;

  const candidates: BlobUpsertCandidate[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0 && index % BLOB_PREPARE_YIELD_INTERVAL === 0) {
      await yieldToMainThread();
    }
    const item = items[index];
    candidates.push(
      await runPrepareBlobUpsertTask(item, shadowHashes[item.key], force)
    );
  }
  return candidates;
}

/** Decompress and parse one downloaded blob payload. */
export async function decodeBlobItemOffThread(
  buffer: ArrayBuffer
): Promise<unknown> {
  // The buffer is cloned (not transferred) so the main-thread fallback can
  // still run if the worker rejects the request.
  const result = await dispatch({ type: "decode-blob", buffer });
  if (result !== null) return result;
  return runDecodeBlobTask(buffer);
}

/** Test seam: force the main-thread fallback path. */
export function disableCloudSyncWorkerForTests(): void {
  workerDisabled = true;
}
