import type { StoreSnapshot, HashAlgorithm } from "./types";

const DEFAULT_HASH_ALGO: HashAlgorithm = "SHA-256";

const encoder = new TextEncoder();

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
  const data = JSON.stringify(payload ?? null);
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
