#!/usr/bin/env bun
/**
 * Regression tests for client-side song import batching.
 *
 * Ensures large imports are split into request payloads that avoid 413 errors
 * and that server-side 413 responses trigger automatic batch splitting.
 */

import { bulkImportSongMetadata } from "../src/utils/songMetadataCache";
import type { BulkImportProgress } from "../src/utils/songMetadataCache";
import {
  assert,
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

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

    assert(
      bytes <= CLIENT_BATCH_LIMIT_BYTES,
      `Client sent oversize payload: ${bytes} bytes`
    );

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

    assert(result.success, `Expected import success, got: ${result.error}`);
    assertEq(result.total, songs.length, "Expected all songs to be imported");
    assert(
      requestSizes.length >= 2,
      `Expected multiple requests, got ${requestSizes.length}`
    );
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

    assert(result.success, `Expected import success, got: ${result.error}`);
    assertEq(result.total, songs.length, "Expected all songs to be imported");
    assert(received413 > 0, "Expected at least one 413 response");
    assert(
      successfulBatches.length >= 2,
      `Expected split retry to create multiple successful batches, got ${successfulBatches.length}`
    );
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

    assert(!result.success, "Expected oversized single-song import to fail");
    assert(
      (result.error || "").toLowerCase().includes("payload too large"),
      `Expected payload-too-large error message, got: ${result.error}`
    );
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

    assert(result.success, `Expected import success, got: ${result.error}`);
    assert(progressEvents.length > 0, "Expected progress callbacks to run");
    assertEq(progressEvents[0].stage, "starting", "Expected starting event first");
    assertEq(
      progressEvents[progressEvents.length - 1]?.stage,
      "complete",
      "Expected complete event last"
    );
    assert(
      progressEvents.some((event) => event.stage === "batch-start"),
      "Expected at least one batch-start event"
    );
    assert(
      progressEvents.some((event) => event.stage === "batch-success"),
      "Expected at least one batch-success event"
    );
  });
}

async function runImportBatchingTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("song import batching"));
  clearResults();

  await runTest("Pre-splits large payloads before sending", testLargePayloadIsPreSplit);
  await runTest("Handles 413 by splitting and retrying", testServer413TriggersSplitRetry);
  await runTest("Returns clear error for oversized single entry", testSingleOversizedSongFailsGracefully);
  await runTest("Reports progress phases during import", testProgressCallbacksReportPhases);

  return printSummary();
}

if (import.meta.main) {
  runImportBatchingTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
