#!/usr/bin/env bun

import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "../src/types/chat";
import {
  classifyChatError,
  collectCompletedLineSegments,
  mergeMessagesWithTimestamps,
  tryParseJsonFromErrorMessage,
} from "../src/apps/chats/utils/chatRuntime";
import {
  assert,
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const asUiMessage = (value: unknown): UIMessage => value as UIMessage;
const asAiMessage = (value: unknown): AIChatMessage => value as AIChatMessage;

export async function runChatRuntimeUtilsTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Runtime Utils Tests"));

  console.log(section("Error message parsing"));
  await runTest("extracts nested JSON object from mixed error text", async () => {
    const parsed = tryParseJsonFromErrorMessage(
      'Request failed: {"error":"rate_limit_exceeded","meta":{"limit":10,"nested":{"ok":true}}}',
    );
    assert(parsed !== null, "Expected parsed JSON payload");
    assertEq(parsed?.error, "rate_limit_exceeded");
    assertEq((parsed?.meta as { limit: number }).limit, 10);
  });

  await runTest("ignores malformed snippets and returns null", async () => {
    const parsed = tryParseJsonFromErrorMessage(
      'bad {"error":"rate_limit_exceeded" then more text',
    );
    assertEq(parsed, null);
  });

  console.log(section("Error classification"));
  await runTest("classifies SDK type validation errors as ignorable", async () => {
    const classification = classifyChatError(
      "AI_TypeValidationError: Type validation failed",
    );
    assertEq(classification.kind, "ignore_type_validation");
  });

  await runTest("classifies structured rate-limit payloads as parsed", async () => {
    const classification = classifyChatError(
      '{"error":"rate_limit_exceeded","isAuthenticated":true,"count":3,"limit":5,"message":"slow down"}',
    );
    assertEq(classification.kind, "rate_limit");
    if (classification.kind !== "rate_limit") {
      throw new Error("Expected rate-limit classification");
    }
    assertEq(classification.parsed, true);
    assertEq(classification.payload.isAuthenticated, true);
    assertEq(classification.payload.limit, 5);
  });

  await runTest("classifies 429-only errors as fallback rate-limit", async () => {
    const classification = classifyChatError("HTTP 429 from upstream");
    assertEq(classification.kind, "rate_limit");
    if (classification.kind !== "rate_limit") {
      throw new Error("Expected rate-limit classification");
    }
    assertEq(classification.parsed, false);
    assertEq(classification.payload.isAuthenticated, false);
  });

  await runTest("classifies auth code payload with session-expired message", async () => {
    const classification = classifyChatError(
      '{"error":"unauthorized","reason":"token invalid"}',
    );
    assertEq(classification.kind, "auth");
    if (classification.kind !== "auth") {
      throw new Error("Expected auth classification");
    }
    assertEq(
      classification.message,
      "Your session has expired. Please login again.",
    );
  });

  console.log(section("Timestamp merge"));
  await runTest("prefers message metadata createdAt when valid", async () => {
    const metadataDate = new Date("2026-01-02T03:04:05.000Z");
    const merged = mergeMessagesWithTimestamps(
      [
        asUiMessage({
          id: "m-1",
          role: "assistant",
          parts: [],
          metadata: { createdAt: metadataDate },
        }),
      ],
      [],
    );
    assertEq(merged[0]?.metadata?.createdAt?.toISOString(), metadataDate.toISOString());
  });

  await runTest("falls back to UI message createdAt when metadata is absent", async () => {
    const uiCreatedAt = "2026-02-03T01:02:03.000Z";
    const merged = mergeMessagesWithTimestamps(
      [
        asUiMessage({
          id: "m-2",
          role: "assistant",
          parts: [],
          createdAt: uiCreatedAt,
        }),
      ],
      [],
    );
    assertEq(merged[0]?.metadata?.createdAt?.toISOString(), uiCreatedAt);
  });

  await runTest("falls back to stored message timestamp by id", async () => {
    const storedCreatedAt = new Date("2024-05-06T07:08:09.000Z");
    const merged = mergeMessagesWithTimestamps(
      [
        asUiMessage({
          id: "m-3",
          role: "assistant",
          parts: [],
        }),
      ],
      [
        asAiMessage({
          id: "m-3",
          role: "assistant",
          parts: [],
          metadata: { createdAt: storedCreatedAt },
        }),
      ],
    );
    assertEq(
      merged[0]?.metadata?.createdAt?.toISOString(),
      storedCreatedAt.toISOString(),
    );
  });

  await runTest("uses current date when all timestamps are invalid", async () => {
    const before = Date.now();
    const merged = mergeMessagesWithTimestamps(
      [
        asUiMessage({
          id: "m-4",
          role: "assistant",
          parts: [],
          createdAt: "not-a-date",
          metadata: { createdAt: "also-bad" },
        }),
      ],
      [],
    );
    const createdAtMs = merged[0]?.metadata?.createdAt?.getTime();
    assert(typeof createdAtMs === "number", "Expected fallback createdAt time");
    assert(
      (createdAtMs as number) >= before && (createdAtMs as number) <= Date.now() + 1000,
      "Expected fallback date to be generated from current time window",
    );
  });

  console.log(section("Streaming segment scan"));
  await runTest("returns newline-delimited segments with CRLF-safe end bounds", async () => {
    const segments = collectCompletedLineSegments("line1\r\nline2\npartial", 0);
    assertEq(segments.length, 2);
    assertEq(segments[0]?.start, 0);
    assertEq(segments[0]?.end, 5);
    assertEq(segments[0]?.nextStart, 7);
    assertEq(segments[1]?.start, 7);
    assertEq(segments[1]?.end, 12);
    assertEq(segments[1]?.nextStart, 13);
  });

  await runTest("respects start offsets for incremental scans", async () => {
    const segments = collectCompletedLineSegments("a\nb\nc", 2);
    assertEq(segments.length, 1);
    assertEq(segments[0]?.start, 2);
    assertEq(segments[0]?.end, 3);
    assertEq(segments[0]?.nextStart, 4);
  });

  return printSummary();
}

if (import.meta.main) {
  runChatRuntimeUtilsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
