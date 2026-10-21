import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import {
  getRequestBodyLimit,
  MAX_AI_CONVERSATION_REQUEST_BYTES,
  readRequestBytes,
  StandaloneRequestBodyTooLargeError,
} from "../../../scripts/api-standalone-server";
import {
  installBunFetchBrotliGuard,
  RejectedContentEncodingError,
} from "../../../api/_utils/_bun-fetch-brotli-guard";
import { AI_ATTACHMENT_MAX_BYTES } from "../../../src/shared/contracts/aiAttachment";

const MEBIBYTE = 1024 * 1024;
const GLOBAL_BODY_CHUNKS = 55;

describe("standalone API request body limits", () => {
  test("normalizes trailing slashes before selecting AI route limits", () => {
    expect(AI_ATTACHMENT_MAX_BYTES).toBe(4 * MEBIBYTE);
    expect(MAX_AI_CONVERSATION_REQUEST_BYTES).toBe(8 * MEBIBYTE);
    expect(getRequestBodyLimit("/api/ai/attachments/")).toBe(
      AI_ATTACHMENT_MAX_BYTES,
    );
    expect(getRequestBodyLimit("/api/chat/")).toBe(
      MAX_AI_CONVERSATION_REQUEST_BYTES,
    );
    expect(getRequestBodyLimit("/api/ai/extract-memories///")).toBe(
      MAX_AI_CONVERSATION_REQUEST_BYTES,
    );
    // The legacy import route is gone; conversation routes use the default
    // standalone body limit (55 MiB) rather than a dedicated AI limit.
    expect(getRequestBodyLimit("/api/ai/conversations/chat/import/")).toBe(
      55 * MEBIBYTE,
    );
    expect(getRequestBodyLimit("/api/ai/conversations/chat")).toBe(
      55 * MEBIBYTE,
    );
  });

  test("rejects an oversized declared Content-Length before reading", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_AI_CONVERSATION_REQUEST_BYTES + 1),
      },
      body: "{}",
    });

    await expect(
      readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).rejects.toBeInstanceOf(StandaloneRequestBodyTooLargeError);
    expect(request.bodyUsed).toBe(false);
  });

  test("cancels a chunked body as soon as it exceeds the route limit", async () => {
    let chunksReadFromSource = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksReadFromSource += 1;
        controller.enqueue(new Uint8Array(MEBIBYTE));
        if (chunksReadFromSource >= GLOBAL_BODY_CHUNKS) {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } satisfies RequestInit & { duplex: "half" });

    await expect(
      readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).rejects.toBeInstanceOf(StandaloneRequestBodyTooLargeError);

    expect(cancelled).toBe(true);
    expect(chunksReadFromSource).toBeLessThanOrEqual(10);
    expect(chunksReadFromSource).toBeLessThan(GLOBAL_BODY_CHUNKS);
  });

  test("returns an empty byte array when the request has no body", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
    });

    expect(
      await readRequestBytes(request, MAX_AI_CONVERSATION_REQUEST_BYTES),
    ).toHaveLength(0);
  });
});

describe("standalone response shim", () => {
  test("implements setHeaders for AI SDK 7 stream piping", async () => {
    const src = await Bun.file("scripts/api-standalone-server.ts").text();
    expect(src).toContain("setHeaders(");
    expect(src).toContain("headers instanceof Headers");
  });
});

describe("Bun fetch brotli guard", () => {
  let restoreGuard = () => {};
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const kind = new URL(request.url).pathname.slice(1);
        const echoed = {
          "x-ae": request.headers.get("accept-encoding") ?? "",
          "x-auth": request.headers.get("authorization") ?? "",
        };
        if (kind === "plain") {
          return new Response("plain-body", { headers: echoed });
        }

        const encoded =
          kind === "br"
            ? brotliCompressSync(Buffer.from("brotli-body"))
            : kind === "gz"
              ? gzipSync(Buffer.from("gzip-body"))
              : deflateSync(Buffer.from("deflate-body"));
        const encoding = kind === "br" ? "br" : kind === "gz" ? "gzip" : "deflate";
        return new Response(encoded, {
          headers: {
            ...echoed,
            "content-encoding": encoding,
            "content-type": "text/plain",
          },
        });
      },
    });
  });

  afterEach(() => {
    restoreGuard();
    restoreGuard = () => {};
  });

  afterAll(() => {
    server.stop(true);
  });

  test("leaves Bun's decoder in place until the guard is installed", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/br`);
    expect(await response.text()).toBe("brotli-body");
  });

  test("rejects brotli instead of decoding it", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const pending = fetch(`http://127.0.0.1:${server.port}/br`, {
      headers: { Authorization: "Bearer secret" },
    });

    await expect(pending).rejects.toBeInstanceOf(RejectedContentEncodingError);
    await expect(pending).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT_ENCODING",
      codings: ["br"],
    });
  });

  test("decodes gzip and deflate and does not advertise brotli", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const gzip = await fetch(`http://127.0.0.1:${server.port}/gz`);
    expect(await gzip.text()).toBe("gzip-body");
    expect(gzip.headers.get("content-encoding")).toBeNull();
    expect(gzip.headers.get("x-ae")).toBe("gzip, deflate");

    const deflate = await fetch(`http://127.0.0.1:${server.port}/deflate`);
    expect(await deflate.text()).toBe("deflate-body");
    expect(deflate.headers.get("content-encoding")).toBeNull();
  });

  test("strips brotli from Accept-Encoding and keeps other request headers", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const response = await fetch(`http://127.0.0.1:${server.port}/plain`, {
      headers: {
        Authorization: "Bearer secret",
        "Accept-Encoding": "br, gzip",
      },
    });

    expect(await response.text()).toBe("plain-body");
    expect(response.headers.get("x-auth")).toBe("Bearer secret");
    expect(response.headers.get("x-ae")).toBe("gzip");
  });

  test("asks for identity when the caller only accepts brotli", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const response = await fetch(`http://127.0.0.1:${server.port}/plain`, {
      headers: { "Accept-Encoding": "br" },
    });

    expect(response.headers.get("x-ae")).toBe("identity");
  });

  test("standalone server installs the guard before it serves", async () => {
    const source = await Bun.file("scripts/api-standalone-server.ts").text();
    const bootstrap = source.slice(source.indexOf("async function bootstrap"));
    expect(bootstrap.indexOf("installBunFetchBrotliGuard()")).toBeGreaterThan(-1);
    expect(bootstrap.indexOf("installBunFetchBrotliGuard()")).toBeLessThan(
      bootstrap.indexOf("warmDictionaryIndexes"),
    );
  });
});
