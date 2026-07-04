/**
 * Cloud Sync v2 worker: runs the CPU-heavy sync transforms (JSON
 * serialization, base64 encoding of binary store fields, SHA-256 / cyrb53
 * hashing, gzip compress/decompress) off the main thread so large libraries
 * (images, EPUBs, wallpapers, applets) don't jank the UI during flush,
 * bootstrap, or blob download.
 *
 * The task implementations live in `../sync/workerTasks` and are shared with
 * the main-thread fallback, guaranteeing identical hashes on either thread.
 */

import {
  runDecodeBlobTask,
  runHashDocsTask,
  runPrepareBlobUpsertTask,
  type BlobUpsertCandidate,
  type CloudSyncWorkerRequest,
  type CloudSyncWorkerResponse,
} from "../sync/workerTasks";

async function handleRequest(
  request: CloudSyncWorkerRequest
): Promise<{ response: CloudSyncWorkerResponse; transfer: Transferable[] }> {
  switch (request.type) {
    case "hash-docs": {
      const hashes = runHashDocsTask(request.docs);
      return {
        response: { id: request.id, ok: true, result: [...hashes.entries()] },
        transfer: [],
      };
    }
    case "prepare-blob-upserts": {
      const candidates: BlobUpsertCandidate[] = [];
      for (const item of request.items) {
        candidates.push(
          await runPrepareBlobUpsertTask(
            item,
            request.shadowHashes[item.key],
            request.force
          )
        );
      }
      const transfer = candidates
        .map((candidate) => candidate.compressed?.buffer)
        .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
      return {
        response: { id: request.id, ok: true, result: candidates },
        transfer,
      };
    }
    case "decode-blob": {
      const item = await runDecodeBlobTask(request.buffer);
      return {
        response: { id: request.id, ok: true, result: item },
        transfer: [],
      };
    }
  }
}

self.onmessage = async (event: MessageEvent<CloudSyncWorkerRequest>) => {
  const request = event.data;
  try {
    const { response, transfer } = await handleRequest(request);
    self.postMessage(response, { transfer });
  } catch (error) {
    const response: CloudSyncWorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
