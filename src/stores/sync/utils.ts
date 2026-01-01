import type { StoreSnapshot, HashAlgorithm } from "./types";

const DEFAULT_HASH_ALGO: HashAlgorithm = "SHA-256";

const encoder = new TextEncoder();

// Stable stringify to ensure deterministic hashes across environments
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const byteHex = bytes[i].toString(16).padStart(2, "0");
    hex.push(byteHex);
  }
  return hex.join("");
}

async function hashWithSubtle(data: string, algo: HashAlgorithm): Promise<string> {
  const digest = await crypto.subtle.digest(algo, encoder.encode(data));
  return bufferToHex(digest);
}

async function hashWithNode(data: string, algo: HashAlgorithm): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash(algo.toLowerCase()).update(data).digest("hex");
}

export async function hashPayload(
  payload: unknown,
  algo: HashAlgorithm = DEFAULT_HASH_ALGO
): Promise<string> {
  const data = stableStringify(payload ?? null);
  if (typeof crypto !== "undefined" && "subtle" in crypto && crypto.subtle) {
    return hashWithSubtle(data, algo);
  }
  return hashWithNode(data, algo);
}

export async function buildSnapshot<Payload>(
  storeKey: string,
  version: number,
  updatedAt: number,
  payload: Payload
): Promise<StoreSnapshot<Payload>> {
  return {
    storeKey,
    version,
    updatedAt,
    hash: await hashPayload(payload),
    payload,
  };
}

export function snapshotArrayToMap(
  snapshots: StoreSnapshot[]
): Record<string, StoreSnapshot> {
  const map: Record<string, StoreSnapshot> = {};
  for (const snap of snapshots) {
    const existing = map[snap.storeKey];
    if (!existing || snap.updatedAt > existing.updatedAt) {
      map[snap.storeKey] = snap;
    }
  }
  return map;
}

export function mergeSnapshots(
  local: StoreSnapshot[],
  remote: StoreSnapshot[]
): StoreSnapshot[] {
  const merged = snapshotArrayToMap(local);
  for (const snap of remote) {
    const existing = merged[snap.storeKey];
    if (!existing || snap.updatedAt > existing.updatedAt) {
      merged[snap.storeKey] = snap;
    }
  }
  return Object.values(merged);
}
