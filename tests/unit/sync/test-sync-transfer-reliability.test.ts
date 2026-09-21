import "../../helpers/local-storage-stub";
import { afterEach, describe, expect, test } from "bun:test";
import { downloadBlobItem, gzipJson, resolveBlobDownloadUrls, uploadBlobItems } from "../../../src/sync/blobs";
import { forEachTransfer } from "../../../src/sync/transferQueue";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("sync transfer reliability", () => {
  test("limits active transfers and waits for successful writes after a failure", async () => {
    let active = 0;
    let maximum = 0;
    const completed: number[] = [];
    await expect(forEachTransfer([0, 1, 2, 3, 4, 5], async (item) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      if (item === 1) throw new Error("failed transfer");
      completed.push(item);
    })).rejects.toThrow("failed transfer");
    expect(maximum).toBe(3);
    expect(active).toBe(0);
    expect(completed.sort()).toEqual([0, 2, 3, 4, 5]);
  });

  test("splits large upload preparation requests at the API limit", async () => {
    const sizes: number[] = [];
    globalThis.fetch = (async (_input, init) => {
      const { upload } = JSON.parse(String(init?.body));
      sizes.push(upload.length);
      return Response.json({ uploads: upload.map((item: { sha256: string }) => ({
        sha256: item.sha256, exists: true, url: `s3://bucket/${item.sha256}`,
      })) });
    }) as typeof fetch;
    const items = Array.from({ length: 201 }, (_, i) => ({
      key: `books/item:${i}`, sha256: i.toString(16).padStart(64, "0"), item: { key: String(i), value: {} },
    }));
    expect((await uploadBlobItems(items)).size).toBe(201);
    expect(sizes).toEqual([200, 1]);
  });

  test("missing upload instructions fail instead of silently dropping files", async () => {
    globalThis.fetch = (async () => Response.json({ uploads: [] })) as typeof fetch;
    await expect(uploadBlobItems([{ key: "book", sha256: "a".repeat(64), item: {} }])).rejects.toThrow("Incomplete");
  });

  test("splits download signing requests while preserving mixed URL order", async () => {
    const sizes: number[] = [];
    globalThis.fetch = (async (_input, init) => {
      const { download } = JSON.parse(String(init?.body));
      sizes.push(download.length);
      return Response.json({ downloads: download.map((url: string) => url.replace("s3://", "https://")) });
    }) as typeof fetch;
    const refs = [{ url: "https://public/book", size: 1 }, ...Array.from({ length: 501 }, (_, i) => ({ url: `s3://bucket/${i}`, size: 1 }))];
    const urls = await resolveBlobDownloadUrls(refs);
    expect(sizes).toEqual([500, 1]);
    expect(urls[0]).toBe("https://public/book");
    expect(urls[501]).toBe("https://bucket/500");
  });

  test("retries a failed blob response and never fetches after cancellation", async () => {
    const compressed = await gzipJson({ key: "book", value: {} });
    let requests = 0;
    globalThis.fetch = (async () => ++requests === 1 ? new Response(null, { status: 503 }) : new Response(compressed)) as typeof fetch;
    expect(await downloadBlobItem("https://example.test/book")).toEqual({ key: "book", value: {} });
    expect(requests).toBe(2);
    const controller = new AbortController();
    controller.abort();
    await expect(downloadBlobItem("https://example.test/book", { signal: controller.signal })).rejects.toThrow();
    expect(requests).toBe(2);
  });
});
