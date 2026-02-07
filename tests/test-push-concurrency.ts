#!/usr/bin/env bun
/**
 * Tests for bounded concurrency helper used by push test endpoint.
 */

import {
  mapWithConcurrency,
  resolveBoundedConcurrency,
} from "../_api/push/_concurrency";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
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

export async function runPushConcurrencyTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-concurrency"));
  clearResults();

  await runTest("Concurrency helper preserves result order", testPreservesResultOrder);
  await runTest("Concurrency helper respects max workers", testRespectsMaxConcurrency);
  await runTest("Concurrency helper rejects invalid limits", testInvalidConcurrencyThrows);
  await runTest("Concurrency helper resolves bounded env values", testResolveBoundedConcurrency);

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
