/**
 * Cloud Sync v2 — shared wire types.
 *
 * All synced state is a per-user map of `key → document`. Changes travel as
 * ops through a per-user journal identified by a monotonically increasing
 * sequence number (`seq`). Conflicts resolve per key via last-writer-wins on
 * a hybrid logical clock timestamp (`t`, see hlc.ts).
 */

export interface SyncOp {
  /** Namespaced key, e.g. "settings/theme", "files/item:/Documents/a.md". */
  k: string;
  /** Document value. Absent for deletes. */
  v?: unknown;
  /** Tombstone marker. */
  del?: boolean;
  /** HLC timestamp assigned by the writer. */
  t: string;
  /** Journal position; assigned by the server when accepted. */
  seq?: number;
  /** Origin client id (echo suppression). */
  c?: string;
}

/** Current value of one key in the server KV state. */
export interface SyncKvEntry {
  v?: unknown;
  del?: boolean;
  t: string;
  seq: number;
}

/**
 * Reference to an immutable blob in object storage. Documents in the blob
 * namespaces (images/trash/applets/wallpapers) carry the binary payload via
 * `blob` instead of inline data. The well-known field name lets the server
 * maintain its content-hash dedupe registry without knowing doc shapes.
 */
export interface SyncBlobRef {
  /** Storage URL (https public URL or s3:// location). */
  url: string;
  /** Compressed size in bytes. */
  size: number;
  /** SHA-256 of the serialized item JSON. */
  sha256?: string;
  /** Alternate content signature for older blob refs. */
  sig?: string;
}

export interface SyncOpResult {
  k: string;
  accepted: boolean;
  seq?: number;
  /** Present when rejected: the entry that won, so the client can converge. */
  winner?: SyncKvEntry;
}

export interface PostOpsResponse {
  ok: true;
  seq: number;
  results: SyncOpResult[];
}

export interface GetChangesResponse {
  ok: true;
  seq: number;
  ops?: SyncOp[];
  snapshotRequired?: boolean;
}

export interface GetSnapshotResponse {
  ok: true;
  seq: number;
  entries: Record<string, SyncKvEntry>;
}

export interface BlobUploadRequestItem {
  sha256: string;
  size: number;
}

export interface BlobUploadResultItem {
  sha256: string;
  exists: boolean;
  /** Known storage URL when the blob already exists. */
  url?: string;
  /** Upload descriptor when the blob must be uploaded. */
  upload?: unknown;
  /** Final storage URL for s3 uploads (known before upload). */
  storageUrl?: string;
}

export interface PostBlobsResponse {
  ok: true;
  uploads?: BlobUploadResultItem[];
  /** Signed download URLs aligned with the request's `download` array. */
  downloads?: (string | null)[];
}

export interface PostBlobUploadInstructionResponse {
  ok: true;
  /** Fresh authenticated API-proxy instruction for one sync blob. */
  upload: unknown;
}

/** Realtime event payload (Pusher event "sync-ops"). */
export interface SyncOpsRealtimeEvent {
  seq: number;
  /** Accepted ops, inlined when the payload is small enough. */
  ops?: SyncOp[];
  /** Origin client id. */
  c?: string;
}

export const SYNC_OPS_REALTIME_EVENT = "sync-ops";

export function isSyncKvEntry(value: unknown): value is SyncKvEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SyncKvEntry>;
  return (
    typeof candidate.t === "string" &&
    candidate.t.length > 0 &&
    typeof candidate.seq === "number" &&
    Number.isFinite(candidate.seq)
  );
}

export function getSyncBlobRef(doc: unknown): SyncBlobRef | null {
  if (!doc || typeof doc !== "object") return null;
  const blob = (doc as { blob?: unknown }).blob;
  if (!blob || typeof blob !== "object") return null;
  const candidate = blob as Partial<SyncBlobRef>;
  if (
    typeof candidate.url !== "string" ||
    candidate.url.length === 0 ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size)
  ) {
    return null;
  }
  return {
    url: candidate.url,
    size: candidate.size,
    ...(typeof candidate.sha256 === "string" && candidate.sha256.length > 0
      ? { sha256: candidate.sha256 }
      : {}),
    ...(typeof candidate.sig === "string" && candidate.sig.length > 0
      ? { sig: candidate.sig }
      : {}),
  };
}
