import { Readable } from "node:stream";
import { createGunzip, createInflate } from "node:zlib";

/**
 * Bun's fetch() decodes `Content-Encoding: br` with google/brotli, including
 * when the request did not advertise `br`. That decoder is missing the
 * CVE-2026-111497 fix (google/brotli@0ed4268a). Node.js shipped it in
 * 22.23.4 / 24.22.1 / 26.12.1; no Bun release has it yet.
 *
 * The API process refuses brotli (and any other coding it cannot decode with
 * Node's zlib) and inflates gzip/deflate itself. `decompress: false` is a
 * Bun fetch extension; without it the vulnerable decoder runs inside fetch
 * before this wrapper can see the body.
 */

const SAFE_CODINGS = new Set(["gzip", "x-gzip", "deflate", "identity"]);

export class RejectedContentEncodingError extends Error {
  readonly code = "UNSUPPORTED_CONTENT_ENCODING";
  readonly codings: readonly string[];

  constructor(codings: readonly string[]) {
    super("Unsupported content encoding");
    this.name = "RejectedContentEncodingError";
    this.codings = codings;
  }
}

type GuardedFetch = typeof fetch & { readonly ryosBrotliGuard: true };

const isGuardedFetch = (value: typeof fetch): value is GuardedFetch =>
  (value as { ryosBrotliGuard?: boolean }).ryosBrotliGuard === true;

const contentCodings = (header: string | null): string[] => {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => part.trim().toLowerCase().split(";", 1)[0]?.trim() ?? "")
    .filter((coding) => coding.length > 0);
};

const buildGuardedHeaders = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Headers => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const requested = headers.get("accept-encoding");
  const kept =
    requested == null
      ? ["gzip", "deflate"]
      : contentCodings(requested).filter((coding) => SAFE_CODINGS.has(coding));
  headers.set("accept-encoding", kept.length > 0 ? kept.join(", ") : "identity");
  return headers;
};

const inflateStream = (
  body: ReadableStream<Uint8Array>,
  codings: readonly string[],
): ReadableStream<Uint8Array> => {
  let stream: Readable = Readable.fromWeb(body);
  for (const coding of [...codings].reverse()) {
    if (coding === "identity") continue;
    stream =
      coding === "deflate"
        ? stream.pipe(createInflate())
        : stream.pipe(createGunzip());
  }
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
};

const decodeResponse = async (response: Response): Promise<Response> => {
  const codings = contentCodings(response.headers.get("content-encoding"));
  if (codings.length === 0 || response.body == null) return response;

  if (codings.some((coding) => !SAFE_CODINGS.has(coding))) {
    try {
      await response.body.cancel();
    } catch {
      // The body may already be closed.
    }
    throw new RejectedContentEncodingError(codings);
  }

  if (codings.every((coding) => coding === "identity")) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(inflateStream(response.body, codings), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const installBunFetchBrotliGuard = (): (() => void) => {
  if (!globalThis.process?.versions?.bun) return () => {};

  const current = globalThis.fetch;
  if (isGuardedFetch(current)) return () => {};

  const guarded = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await current(input, {
      ...init,
      headers: buildGuardedHeaders(input, init),
      decompress: false,
    } as RequestInit);
    return decodeResponse(response);
  }) as GuardedFetch;
  Object.defineProperty(guarded, "ryosBrotliGuard", { value: true });

  globalThis.fetch = guarded;
  return () => {
    if (globalThis.fetch === guarded) {
      globalThis.fetch = current;
    }
  };
};
