#!/usr/bin/env bun
/**
 * Tests for bounded concurrency helper used by push test endpoint.
 */

import {
  mapWithConcurrency,
  resolveBoundedConcurrency,
} from "../_api/push/_concurrency";
import {
  getApnsSendConcurrency,
  getPushMetadataLookupConcurrency,
} from "../_api/push/_config";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

async function testPreservesResultOrder() {
  const input = [1, 2, 3, 4, 5];
  const output = await mapWithConcurrency(input, 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 6 - value));
    return value * 10;
  });

  assertEq(output.join(","), "10,20,30,40,50");
}

async function testRespectsMaxConcurrency() {
  const input = [1, 2, 3, 4, 5, 6, 7];
  let inFlight = 0;
  let maxInFlight = 0;

  await mapWithConcurrency(input, 3, async () => {
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight -= 1;
    return "ok";
  });

  assertEq(maxInFlight <= 3, true, `Expected max concurrency <= 3, got ${maxInFlight}`);
}

async function testInvalidConcurrencyThrows() {
  let errorMessage = "";
  try {
    await mapWithConcurrency([1], 0, async (value) => value);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEq(errorMessage, "Concurrency must be a positive integer");
}

async function testResolveBoundedConcurrency() {
  assertEq(resolveBoundedConcurrency(undefined, 4), 4);
  assertEq(resolveBoundedConcurrency("6", 4), 6);
  assertEq(resolveBoundedConcurrency("0", 4), 4);
  assertEq(resolveBoundedConcurrency("999", 4), 4);
  assertEq(resolveBoundedConcurrency("not-a-number", 4), 4);
}

async function testWorkerErrorPropagation() {
  let errorMessage = "";
  try {
    await mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) {
        throw new Error("boom");
      }
      return value;
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEq(errorMessage, "boom");
}

async function testStopsSchedulingAfterError() {
  const processed: number[] = [];
  try {
    await mapWithConcurrency([1, 2, 3, 4], 1, async (value) => {
      processed.push(value);
      if (value === 2) {
        throw new Error("stop");
      }
      return value;
    });
  } catch {
    // expected
  }

  assertEq(processed.join(","), "1,2");
}

async function testInvalidFallbackBoundsThrows() {
  let errorMessage = "";
  try {
    resolveBoundedConcurrency("2", 0);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEq(errorMessage, "Fallback concurrency must be within bounds");
}

async function testConcurrencyConfigAccessors() {
  withPatchedEnv(
    {
      APNS_SEND_CONCURRENCY: "7",
      PUSH_METADATA_LOOKUP_CONCURRENCY: "12",
    },
    () => {
      assertEq(getApnsSendConcurrency(), 7);
      assertEq(getPushMetadataLookupConcurrency(), 12);
    }
  );

  withPatchedEnv(
    {
      APNS_SEND_CONCURRENCY: "200",
      PUSH_METADATA_LOOKUP_CONCURRENCY: "0",
    },
    () => {
      assertEq(getApnsSendConcurrency(), 4);
      assertEq(getPushMetadataLookupConcurrency(), 8);
    }
  );
}

export async function runPushConcurrencyTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-concurrency"));
  clearResults();

  await runTest("Concurrency helper preserves result order", testPreservesResultOrder);
  await runTest("Concurrency helper respects max workers", testRespectsMaxConcurrency);
  await runTest("Concurrency helper rejects invalid limits", testInvalidConcurrencyThrows);
  await runTest("Concurrency helper resolves bounded env values", testResolveBoundedConcurrency);
  await runTest("Concurrency helper propagates worker errors", testWorkerErrorPropagation);
  await runTest("Concurrency helper stops scheduling after error", testStopsSchedulingAfterError);
  await runTest("Concurrency helper validates fallback bounds", testInvalidFallbackBoundsThrows);
  await runTest("Concurrency config accessors apply bounded env values", testConcurrencyConfigAccessors);

  return printSummary();
}

if (import.meta.main) {
  runPushConcurrencyTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
