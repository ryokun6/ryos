#!/usr/bin/env bun
/**
 * Tests for push send result summarization helpers.
 */

import type { ApnsSendResult } from "../_api/_utils/_push-apns";
import {
  getFailureReason,
  summarizePushSendResults,
} from "../_api/push/_results";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

async function testFailureReasonSelection() {
  const withReason: ApnsSendResult = {
    ok: false,
    status: 400,
    token: "token-1",
    reason: "BadDeviceToken",
  };
  assertEq(getFailureReason(withReason), "BadDeviceToken");

  const withoutReason: ApnsSendResult = {
    ok: false,
    status: 503,
    token: "token-2",
  };
  assertEq(getFailureReason(withoutReason), "HTTP_503");

  const success: ApnsSendResult = {
    ok: true,
    status: 200,
    token: "token-3",
  };
  assertEq(getFailureReason(success), null);
}

async function testSummaryAggregation() {
  const results: ApnsSendResult[] = [
    { ok: true, status: 200, token: "a" },
    { ok: true, status: 200, token: "b" },
    { ok: false, status: 410, token: "c", reason: "BadDeviceToken" },
    { ok: false, status: 503, token: "d" },
    { ok: false, status: 410, token: "e", reason: "BadDeviceToken" },
  ];

  const summary = summarizePushSendResults(results);
  assertEq(summary.successCount, 2);
  assertEq(summary.failureCount, 3);
  assertEq(summary.failureReasons.BadDeviceToken, 2);
  assertEq(summary.failureReasons.HTTP_503, 1);
}

export async function runPushResultsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-results"));
  clearResults();

  await runTest("Push result failure reason selection", testFailureReasonSelection);
  await runTest("Push result summary aggregation", testSummaryAggregation);

  return printSummary();
}

if (import.meta.main) {
  runPushResultsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
