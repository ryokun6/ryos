/**
 * Cloud Sync v2 worker tasks: the CPU-heavy, pure data transforms shared by
 * the cloud sync Web Worker and the main-thread fallback in
 * `@/sync/workerClient`.
 *
 * Everything here is deterministic and dependency-free (no stores, no
 * IndexedDB, no transport) so the worker bundle stays small and results are
 * bit-identical regardless of which thread ran the task — shadow hashes and
 * server-side blob dedupe must not depend on where the work happened.
 */

import { gunzipJson, gzipJson, hashDocJson, sha256Json } from "@/sync/contentCodec";
import {
  serializeStoreItem,
  type IndexedDBStoreItemWithKey,
} from "@/utils/storeItemSerialization";

export interface HashDocInput {
  key: string;
  doc: unknown;
}

export interface BlobUpsertInput {
  key: string;
  /** Raw store item; Blob/ArrayBuffer fields are still binary. */
  item: IndexedDBStoreItemWithKey;
}

export interface BlobUpsertCandidate {
  key: string;
  /** SHA-256 of the serialized item JSON (shadow + server dedupe hash). */
  sha256: string;
  /** Gzip of the serialized item JSON; absent when the shadow hash matched. */
  compressed?: Uint8Array;
}

/** cyrb53 shadow hash per document (JSON.stringify + hash). */
export function runHashDocsTask(
  docs: readonly HashDocInput[]
): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const { key, doc } of docs) {
    hashes.set(key, hashDocJson(JSON.stringify(doc)));
  }
  return hashes;
}

/**
 * Serialize one raw store item (base64-encode binary fields), digest it, and
 * gzip it when its content differs from the shadow hash (or when forced).
 *
 * The digest is computed over the serialized `{ key, value }` JSON — the
 * same formula the engine previously used via `sha256Json`, so existing
 * shadow entries stay valid and nothing re-uploads after this change.
 */
export async function runPrepareBlobUpsertTask(
  input: BlobUpsertInput,
  shadowHash: string | undefined,
  force: boolean
): Promise<BlobUpsertCandidate> {
  const serialized = await serializeStoreItem(input.item);
  const sha256 = await sha256Json(serialized);
  if (!force && shadowHash === sha256) {
    return { key: input.key, sha256 };
  }
  return { key: input.key, sha256, compressed: await gzipJson(serialized) };
}

/** Decompress and parse one downloaded blob payload. */
export async function runDecodeBlobTask(
  data: ArrayBuffer | Uint8Array
): Promise<unknown> {
  return gunzipJson<unknown>(data);
}

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

export type CloudSyncWorkerRequest =
  | { id: number; type: "hash-docs"; docs: HashDocInput[] }
  | {
      id: number;
      type: "prepare-blob-upserts";
      items: BlobUpsertInput[];
      /** Existing shadow content hash per sync key. */
      shadowHashes: Record<string, string>;
      force: boolean;
    }
  | { id: number; type: "decode-blob"; buffer: ArrayBuffer };

/** Request without the client-assigned id (distributes over the union). */
export type CloudSyncWorkerRequestBody = CloudSyncWorkerRequest extends infer R
  ? R extends CloudSyncWorkerRequest
    ? Omit<R, "id">
    : never
  : never;

export type CloudSyncWorkerResponse =
  | {
      id: number;
      ok: true;
      result:
        | Array<[string, string]> // hash-docs (map entries)
        | BlobUpsertCandidate[] // prepare-blob-upserts
        | unknown; // decode-blob
    }
  | { id: number; ok: false; error: string };
