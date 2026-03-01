import { describe, test, expect } from "bun:test";

/**
 * Regression tests for client-side song import batching.
 *
 * Ensures large imports are split into request payloads that avoid 413 errors
 * and that server-side 413 responses trigger automatic batch splitting.
 */

import { bulkImportSongMetadata } from "../src/utils/songMetadataCache";
import type { BulkImportProgress } from "../src/utils/songMetadataCache";
const CLIENT_BATCH_LIMIT_BYTES = 3_500_000;

type BulkImportRequest = {
  action: "import";
  songs: Array<{ id: string }>;
};

function makeSong(id: string, charCount: number) {
  return {
    id,
    title: `Song ${id}`,
    lyrics: {
      lrc: "x".repeat(charCount),
    },
  };
}

async function withMockedFetch(
  mockFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  callback: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testLargePayloadIsPreSplit(): Promise<void> {
  const requestSizes: number[] = [];

  await withMockedFetch(async (_input, init) => {
    const body = String(init?.body ?? "");
    const bytes = new TextEncoder().encode(body).length;
    requestSizes.push(bytes);

    expect(bytes <= CLIENT_BATCH_LIMIT_BYTES).toBeTruthy();

    const parsed = JSON.parse(body) as BulkImportRequest;
    return new Response(
      JSON.stringify({
        success: true,
        imported: parsed.songs.length,
        updated: 0,
        total: parsed.songs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }, async () => {
    const songs = [
      makeSong("s1", 1_250_000),
      makeSong("s2", 1_250_000),
      makeSong("s3", 1_250_000),
      makeSong("s4", 1_250_000),
    ];

    const result = await bulkImportSongMetadata(songs, {
      username: "ryo",
      authToken: "test-token",
    });

    expect(result.success).toBeTruthy();
    expect(result.total).toBe(songs.length);
    expect(requestSizes.length >= 2).toBeTruthy();
  });
}

async function testServer413TriggersSplitRetry(): Promise<void> {
  const serverLimitBytes = 900_000;
  let received413 = 0;
  const successfulBatches: number[] = [];

  await withMockedFetch(async (_input, init) => {
    const body = String(init?.body ?? "");
    const bytes = new TextEncoder().encode(body).length;
    const parsed = JSON.parse(body) as BulkImportRequest;

    if (bytes > serverLimitBytes) {
      received413 += 1;
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    successfulBatches.push(parsed.songs.length);
    return new Response(
      JSON.stringify({
        success: true,
        imported: parsed.songs.length,
        updated: 0,
        total: parsed.songs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }, async () => {
    const songs = [
      makeSong("t1", 450_000),
      makeSong("t2", 450_000),
      makeSong("t3", 450_000),
    ];

    const result = await bulkImportSongMetadata(songs, {
      username: "ryo",
      authToken: "test-token",
    });

    expect(result.success).toBeTruthy();
    expect(result.total).toBe(songs.length);
    expect(received413 > 0).toBeTruthy();
    expect(successfulBatches.length >= 2).toBeTruthy();
  });
}

async function testSingleOversizedSongFailsGracefully(): Promise<void> {
  const serverLimitBytes = 100_000;

  await withMockedFetch(async (_input, init) => {
    const body = String(init?.body ?? "");
    const bytes = new TextEncoder().encode(body).length;

    if (bytes > serverLimitBytes) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(body) as BulkImportRequest;
    return new Response(
      JSON.stringify({
        success: true,
        imported: parsed.songs.length,
        updated: 0,
        total: parsed.songs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }, async () => {
    const result = await bulkImportSongMetadata([makeSong("oversize", 250_000)], {
      username: "ryo",
      authToken: "test-token",
    });

    expect(!result.success).toBeTruthy();
    expect((result.error || "").toLowerCase()).toContain("payload too large");
  });
}

async function testProgressCallbacksReportPhases(): Promise<void> {
  const progressEvents: BulkImportProgress[] = [];

  await withMockedFetch(async (_input, init) => {
    const body = String(init?.body ?? "");
    const parsed = JSON.parse(body) as BulkImportRequest;
    return new Response(
      JSON.stringify({
        success: true,
        imported: parsed.songs.length,
        updated: 0,
        total: parsed.songs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }, async () => {
    const songs = [
      makeSong("p1", 900_000),
      makeSong("p2", 900_000),
      makeSong("p3", 900_000),
      makeSong("p4", 900_000),
    ];

    const result = await bulkImportSongMetadata(
      songs,
      {
        username: "ryo",
        authToken: "test-token",
      },
      {
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      }
    );

    expect(result.success).toBeTruthy();
    expect(progressEvents.length > 0).toBeTruthy();
    expect(progressEvents[0].stage).toBe("starting");
    expect(progressEvents[progressEvents.length - 1]?.stage).toBe("complete");
    expect(progressEvents.some((event) => event.stage === "batch-start")).toBeTruthy();
    expect(progressEvents.some((event) => event.stage === "batch-success")).toBeTruthy();
  });
}

async function testRateLimitedProgressEventIsReported(): Promise<void> {
  const progressEvents: BulkImportProgress[] = [];
  let callCount = 0;

  await withMockedFetch(async (_input, init) => {
    callCount += 1;
    const body = String(init?.body ?? "");
    const parsed = JSON.parse(body) as BulkImportRequest;

    if (callCount === 1) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "1",
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported: parsed.songs.length,
        updated: 0,
        total: parsed.songs.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }, async () => {
    const result = await bulkImportSongMetadata(
      [makeSong("rl1", 10_000)],
      {
        username: "ryo",
        authToken: "test-token",
      },
      {
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      }
    );

    expect(result.success).toBeTruthy();
    expect(progressEvents.some((event) => event.stage === "rate-limited")).toBeTruthy();

    const rateLimitedEvent = progressEvents.find(
      (event) => event.stage === "rate-limited"
    );
    expect(rateLimitedEvent?.statusCode).toBe(429);
    expect((rateLimitedEvent?.retryAfterMs || 0) >= 1000).toBeTruthy();
  });
}

describe("Song Import Batching", () => {
  describe("song import batching", () => {
    test("Pre-splits large payloads before sending", async () => {
      await testLargePayloadIsPreSplit();
    });
    test("Handles 413 by splitting and retrying", async () => {
      await testServer413TriggersSplitRetry();
    });
    test("Returns clear error for oversized single entry", async () => {
      await testSingleOversizedSongFailsGracefully();
    });
    test("Reports progress phases during import", async () => {
      await testProgressCallbacksReportPhases();
    });
    test("Reports rate-limited retry progress", async () => {
      await testRateLimitedProgressEventIsReported();
    });
  });
});
