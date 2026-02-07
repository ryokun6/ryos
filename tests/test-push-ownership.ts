#!/usr/bin/env bun
/**
 * Tests for push token ownership helpers.
 */

import {
  getTokenOwnershipEntries,
  splitTokenOwnership,
} from "../_api/push/_ownership";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const TOKEN_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

async function testOwnershipLookupFromRedisLikeStore() {
  const metadataByKey = new Map<string, unknown>([
    [`push:token:${TOKEN_A}`, { username: "alice" }],
    [`push:token:${TOKEN_B}`, { username: "bob" }],
    [`push:token:${TOKEN_C}`, null],
  ]);

  const redisLike = {
    async get<T>(key: string): Promise<T> {
      return (metadataByKey.get(key) ?? null) as T;
    },
  };

  const entries = await getTokenOwnershipEntries(
    redisLike,
    "alice",
    [TOKEN_A, TOKEN_B, TOKEN_C],
    2
  );

  assertEq(entries.length, 3);
  assertEq(entries[0].token, TOKEN_A);
  assertEq(entries[0].ownedByCurrentUser, true);
  assertEq(entries[1].token, TOKEN_B);
  assertEq(entries[1].ownedByCurrentUser, false);
  assertEq(entries[2].token, TOKEN_C);
  assertEq(entries[2].ownedByCurrentUser, false);
}

async function testOwnershipSplitHelper() {
  const split = splitTokenOwnership([
    { token: TOKEN_A, ownedByCurrentUser: true },
    { token: TOKEN_B, ownedByCurrentUser: false },
    { token: TOKEN_C, ownedByCurrentUser: true },
  ]);

  assertEq(split.ownedTokens.join(","), `${TOKEN_A},${TOKEN_C}`);
  assertEq(split.unownedTokens.join(","), TOKEN_B);
}

export async function runPushOwnershipTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-ownership"));
  clearResults();

  await runTest("Push ownership lookup from redis-like store", testOwnershipLookupFromRedisLikeStore);
  await runTest("Push ownership split helper", testOwnershipSplitHelper);

  return printSummary();
}

if (import.meta.main) {
  runPushOwnershipTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
