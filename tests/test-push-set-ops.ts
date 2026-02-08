#!/usr/bin/env bun
/**
 * Tests for push token set cleanup helpers.
 */

import {
  getDistinctNonEmptyTokens,
  removeTokensAndMetadata,
  removeTokenMetadataKeys,
  removeTokensFromUserSet,
} from "../_api/push/_set-ops";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

function createFakeRedis(execResultsQueue: unknown[] = []) {
  const sremCalls: Array<{ key: string; member: string }> = [];
  const delCalls: Array<{ key: string }> = [];
  let execCount = 0;

  const redis = {
    pipeline() {
      return {
        srem(key: string, member: string) {
          sremCalls.push({ key, member });
        },
        del(key: string) {
          delCalls.push({ key });
        },
        async exec() {
          execCount += 1;
          return execResultsQueue[execCount - 1] ?? [];
        },
      };
    },
  };

  return {
    redis,
    sremCalls,
    delCalls,
    getExecCount: () => execCount,
  };
}

async function testDistinctTokenNormalization() {
  const distinct = getDistinctNonEmptyTokens([
    "a",
    "a",
    "",
    "b",
    "b",
    "c",
  ]);
  assertEq(distinct.join(","), "a,b,c");
}

async function testRemoveTokensFromUserSet() {
  const { redis, sremCalls, delCalls, getExecCount } = createFakeRedis();
  const removedCount = await removeTokensFromUserSet(
    redis,
    "push:user:alice:tokens",
    ["tok1", "tok1", "tok2", ""]
  );

  assertEq(removedCount, 2);
  assertEq(sremCalls.length, 2);
  assertEq(sremCalls[0].member, "tok1");
  assertEq(sremCalls[1].member, "tok2");
  assertEq(delCalls.length, 0);
  assertEq(getExecCount(), 1);
}

async function testRemoveTokensAndMetadata() {
  const { redis, sremCalls, delCalls, getExecCount } = createFakeRedis();
  const removedCount = await removeTokensAndMetadata(
    redis,
    "push:user:alice:tokens",
    ["tok1", "tok2", "tok2"],
    (token) => `push:token:${token}`
  );

  assertEq(removedCount, 2);
  assertEq(sremCalls.length, 2);
  assertEq(delCalls.length, 2);
  assertEq(delCalls[0].key, "push:token:tok1");
  assertEq(delCalls[1].key, "push:token:tok2");
  assertEq(getExecCount(), 1);
}

async function testRemoveTokensFromUserSetUsesParsedExecCounts() {
  const { redis } = createFakeRedis([[1n, false, true]]);
  const removedCount = await removeTokensFromUserSet(
    redis,
    "push:user:alice:tokens",
    ["tok1", "tok2", "tok3"]
  );
  assertEq(removedCount, 2);
}

async function testRemoveTokensFromUserSetParsesObjectAndStringCounts() {
  const { redis } = createFakeRedis([[{ result: "1" }, "0"]]);
  const removedCount = await removeTokensFromUserSet(
    redis,
    "push:user:alice:tokens",
    ["tok1", "tok2"]
  );
  assertEq(removedCount, 1);
}

async function testRemoveTokensAndMetadataUsesParsedExecCounts() {
  const { redis } = createFakeRedis([[[null, 1], [null, 0], [null, 1], [null, 1]]]);
  const removedCount = await removeTokensAndMetadata(
    redis,
    "push:user:alice:tokens",
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(removedCount, 2);
}

async function testRemoveTokenMetadataKeysUsesParsedExecCounts() {
  const { redis } = createFakeRedis([
    [{ result: 1 }, { result: 0 }, [null, 1]],
  ]);
  const metadataRemoved = await removeTokenMetadataKeys(
    redis,
    ["tok1", "tok2", "tok3"],
    (token) => `push:token:${token}`
  );
  assertEq(metadataRemoved, 2);
}

async function testRemovalFallbackWhenExecResultUnparseable() {
  const { redis: redisWithText } = createFakeRedis([["not-a-count"]]);
  const removedCountFromText = await removeTokensFromUserSet(
    redisWithText,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromText, 1);

  const { redis: redisWithFloat } = createFakeRedis([["1.5"]]);
  const removedCountFromFloat = await removeTokensFromUserSet(
    redisWithFloat,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromFloat, 1);

  const { redis: redisWithShortResult } = createFakeRedis([[1]]);
  const removedCountFromShortResult = await removeTokensFromUserSet(
    redisWithShortResult,
    "push:user:alice:tokens",
    ["tok1", "tok2"]
  );
  assertEq(removedCountFromShortResult, 2);

  const { redis: redisWithOverlargeCount } = createFakeRedis([[2]]);
  const removedCountFromOverlarge = await removeTokensFromUserSet(
    redisWithOverlargeCount,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromOverlarge, 1);

  const { redis: redisWithNegativeCount } = createFakeRedis([[-1]]);
  const removedCountFromNegative = await removeTokensFromUserSet(
    redisWithNegativeCount,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromNegative, 1);

  const { redis: redisWithHugeBigint } = createFakeRedis([
    [BigInt(Number.MAX_SAFE_INTEGER) + 1n],
  ]);
  const removedCountFromHugeBigint = await removeTokensFromUserSet(
    redisWithHugeBigint,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromHugeBigint, 1);

  const { redis: redisWithErroredTuple } = createFakeRedis([
    [[{ message: "ERR" }, 1]],
  ]);
  const removedCountFromErroredTuple = await removeTokensFromUserSet(
    redisWithErroredTuple,
    "push:user:alice:tokens",
    ["tok1"]
  );
  assertEq(removedCountFromErroredTuple, 1);
}

async function testMetadataRemovalFallbackWhenExecResultUnparseable() {
  const { redis } = createFakeRedis([[{ result: 1 }]]);
  const metadataRemoved = await removeTokenMetadataKeys(
    redis,
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(metadataRemoved, 2);

  const { redis: redisWithOverlargeCount } = createFakeRedis([[2, 0]]);
  const metadataRemovedFromOverlarge = await removeTokenMetadataKeys(
    redisWithOverlargeCount,
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(metadataRemovedFromOverlarge, 2);

  const { redis: redisWithErroredTuple } = createFakeRedis([
    [[{ message: "ERR" }, 1], [null, 0]],
  ]);
  const metadataRemovedFromErroredTuple = await removeTokenMetadataKeys(
    redisWithErroredTuple,
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(metadataRemovedFromErroredTuple, 2);

  const circular: { result?: unknown } = {};
  circular.result = circular;
  const { redis: redisWithCircularResult } = createFakeRedis([[circular, { result: 1 }]]);
  const metadataRemovedFromCircular = await removeTokenMetadataKeys(
    redisWithCircularResult,
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(metadataRemovedFromCircular, 2);
}

async function testRemoveTokensAndMetadataFallbackWhenExecResultUnparseable() {
  const { redis: redisWithShortResult } = createFakeRedis([[1]]);
  const removedFromShortResult = await removeTokensAndMetadata(
    redisWithShortResult,
    "push:user:alice:tokens",
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(removedFromShortResult, 2);

  const { redis: redisWithOverlargeSrem } = createFakeRedis([[2, 0, 0, 0]]);
  const removedFromOverlarge = await removeTokensAndMetadata(
    redisWithOverlargeSrem,
    "push:user:alice:tokens",
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(removedFromOverlarge, 2);

  const { redis: redisWithErroredTuple } = createFakeRedis([
    [[{ message: "ERR" }, 1], [null, 1], [null, 1], [null, 1]],
  ]);
  const removedFromErroredTuple = await removeTokensAndMetadata(
    redisWithErroredTuple,
    "push:user:alice:tokens",
    ["tok1", "tok2"],
    (token) => `push:token:${token}`
  );
  assertEq(removedFromErroredTuple, 2);
}

async function testNoOpsSkipPipeline() {
  const { redis, getExecCount } = createFakeRedis();
  const removedFromSet = await removeTokensFromUserSet(redis, "key", []);
  const removedWithMeta = await removeTokensAndMetadata(
    redis,
    "key",
    [],
    (token) => `push:token:${token}`
  );

  assertEq(removedFromSet, 0);
  assertEq(removedWithMeta, 0);
  assertEq(getExecCount(), 0);
}

export async function runPushSetOpsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-set-ops"));
  clearResults();

  await runTest("Token set helper deduplicates non-empty tokens", testDistinctTokenNormalization);
  await runTest("Token set helper removes tokens from user set", testRemoveTokensFromUserSet);
  await runTest("Token set helper removes tokens and metadata", testRemoveTokensAndMetadata);
  await runTest(
    "Token set helper parses srem results for removal counts",
    testRemoveTokensFromUserSetUsesParsedExecCounts
  );
  await runTest(
    "Token set helper parses object/string count shapes",
    testRemoveTokensFromUserSetParsesObjectAndStringCounts
  );
  await runTest(
    "Token+metadata helper parses srem results for removal counts",
    testRemoveTokensAndMetadataUsesParsedExecCounts
  );
  await runTest(
    "Metadata-only helper parses del result counts",
    testRemoveTokenMetadataKeysUsesParsedExecCounts
  );
  await runTest(
    "Token set helper falls back when exec results are unparseable",
    testRemovalFallbackWhenExecResultUnparseable
  );
  await runTest(
    "Metadata helper falls back when exec results are unparseable",
    testMetadataRemovalFallbackWhenExecResultUnparseable
  );
  await runTest(
    "Token+metadata helper falls back for unparseable exec results",
    testRemoveTokensAndMetadataFallbackWhenExecResultUnparseable
  );
  await runTest("Token set helper skips empty operations", testNoOpsSkipPipeline);

  return printSummary();
}

if (import.meta.main) {
  runPushSetOpsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
