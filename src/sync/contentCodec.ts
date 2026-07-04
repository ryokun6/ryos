/**
 * Pure Cloud Sync v2 content transforms: JSON gzip envelopes, SHA-256
 * content digests, and the fast cyrb53 document hash used by the shadow map.
 *
 * Dependency-free so the cloud sync Web Worker can bundle these without
 * dragging in stores, transport, or IndexedDB code. Main-thread callers
 * import them via `@/sync/blobs` and `@/sync/state` re-exports.
 */

function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

export async function gzipJson(value: unknown): Promise<Uint8Array> {
  assertCompressionSupport();
  const inputData = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([inputData])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipJson<T>(data: ArrayBuffer | Uint8Array): Promise<T> {
  assertCompressionSupport();
  const buffer = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as T;
}

/** SHA-256 hex of the serialized item JSON. */
export async function sha256Json(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Fast 53-bit string hash (cyrb53) for shadow content hashes. */
export function hashDocJson(json: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < json.length; i += 1) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function hashDoc(doc: unknown): string {
  return hashDocJson(JSON.stringify(doc));
}
