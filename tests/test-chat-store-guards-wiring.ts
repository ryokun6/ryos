#!/usr/bin/env bun
/**
 * Guardrail tests for chat store API response/cooldown wiring.
 *
 * Why:
 * Frontend-only mode can return non-JSON API responses and repeated retries can
 * spam warnings and failed requests. These checks protect the guard rails added
 * to useChatsStore.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";

const readStoreSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/stores/useChatsStore.ts"), "utf-8");

const countMatches = (source: string, pattern: RegExp): number =>
  source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))
    ?.length || 0;

export async function runChatStoreGuardsWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Store Guard Wiring Tests"));

  console.log(section("JSON response guard wiring"));
  await runTest("uses readJsonBody for rooms/messages success payloads", async () => {
    const source = readStoreSource();

    assert(
      source.includes('"fetchRooms success response"'),
      "Expected fetchRooms success response guard context"
    );
    assert(
      source.includes('"fetchMessagesForRoom success response"'),
      "Expected fetchMessagesForRoom success response guard context"
    );
    assert(
      source.includes('"fetchBulkMessages success response"'),
      "Expected fetchBulkMessages success response guard context"
    );
  });

  await runTest("readJsonBody accepts json media type variants", async () => {
    const source = readStoreSource();
    assert(
      /contentType\.includes\("json"\)/.test(source),
      'Expected readJsonBody to gate on contentType.includes("json")'
    );
  });

  await runTest("dedupes guard warnings with endpoint-specific keys", async () => {
    const source = readStoreSource();

    assert(
      /warnChatsStoreOnce\s*\(\s*"fetchRooms-success-response"/.test(source),
      "Expected dedupe warning key for fetchRooms"
    );
    assert(
      /warnChatsStoreOnce\s*\(\s*"fetchMessagesForRoom-success-response"/.test(
        source
      ),
      "Expected dedupe warning key for fetchMessagesForRoom"
    );
    assert(
      /warnChatsStoreOnce\s*\(\s*"fetchBulkMessages-success-response"/.test(
        source
      ),
      "Expected dedupe warning key for fetchBulkMessages"
    );
  });

  console.log(section("Cooldown availability checks"));
  await runTest("checks cooldown gate for each chat fetch endpoint", async () => {
    const source = readStoreSource();

    assertEq(
      countMatches(source, /isApiTemporarilyUnavailable\("rooms"\)/),
      1,
      "Expected rooms fetcher cooldown gate"
    );
    assertEq(
      countMatches(source, /isApiTemporarilyUnavailable\("room-messages"\)/),
      1,
      "Expected room-messages fetcher cooldown gate"
    );
    assertEq(
      countMatches(source, /isApiTemporarilyUnavailable\("bulk-messages"\)/),
      1,
      "Expected bulk-messages fetcher cooldown gate"
    );
  });

  await runTest("uses a positive cooldown duration constant", async () => {
    const source = readStoreSource();
    const match = source.match(/API_UNAVAILABLE_COOLDOWN_MS\s*=\s*([0-9_]+)/);
    assert(match?.[1], "Expected API_UNAVAILABLE_COOLDOWN_MS declaration");
    const parsedMs = Number((match?.[1] || "").replaceAll("_", ""));
    assert(parsedMs > 0, "Expected positive API_UNAVAILABLE_COOLDOWN_MS");
  });

  await runTest("marks cooldown from parse guard and network failures", async () => {
    const source = readStoreSource();

    assertEq(
      countMatches(source, /markApiTemporarilyUnavailable\("rooms"\)/),
      2,
      "Expected rooms cooldown marking in guard + network catch"
    );
    assertEq(
      countMatches(source, /markApiTemporarilyUnavailable\("room-messages"\)/),
      2,
      "Expected room-messages cooldown marking in guard + network catch"
    );
    assertEq(
      countMatches(source, /markApiTemporarilyUnavailable\("bulk-messages"\)/),
      2,
      "Expected bulk-messages cooldown marking in guard + network catch"
    );
  });

  await runTest("clears cooldown after successful payload parse", async () => {
    const source = readStoreSource();

    assertEq(
      countMatches(source, /clearApiUnavailable\("rooms"\)/),
      1,
      "Expected rooms cooldown clear path"
    );
    assertEq(
      countMatches(source, /clearApiUnavailable\("room-messages"\)/),
      1,
      "Expected room-messages cooldown clear path"
    );
    assertEq(
      countMatches(source, /clearApiUnavailable\("bulk-messages"\)/),
      1,
      "Expected bulk-messages cooldown clear path"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatStoreGuardsWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
