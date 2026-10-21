import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

import {
  installBunFetchBrotliGuard,
  RejectedContentEncodingError,
} from "../../../api/_utils/_bun-fetch-brotli-guard";

let restoreGuard = () => {};

const server = Bun.serve({
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
      headers: { ...echoed, "content-encoding": encoding, "content-type": "text/plain" },
    });
  },
});

const base = `http://127.0.0.1:${server.port}`;

afterEach(() => {
  restoreGuard();
  restoreGuard = () => {};
});

afterAll(() => {
  server.stop(true);
});

describe("Bun fetch brotli guard", () => {
  test("leaves Bun's decoder in place until the guard is installed", async () => {
    const response = await fetch(`${base}/br`);
    expect(await response.text()).toBe("brotli-body");
  });

  test("rejects brotli instead of decoding it", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const pending = fetch(`${base}/br`, {
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

    const gzip = await fetch(`${base}/gz`);
    expect(await gzip.text()).toBe("gzip-body");
    expect(gzip.headers.get("content-encoding")).toBeNull();
    expect(gzip.headers.get("x-ae")).toBe("gzip, deflate");

    const deflate = await fetch(`${base}/deflate`);
    expect(await deflate.text()).toBe("deflate-body");
    expect(deflate.headers.get("content-encoding")).toBeNull();
  });

  test("strips brotli from Accept-Encoding and keeps other request headers", async () => {
    restoreGuard = installBunFetchBrotliGuard();

    const response = await fetch(`${base}/plain`, {
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

    const response = await fetch(`${base}/plain`, {
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
