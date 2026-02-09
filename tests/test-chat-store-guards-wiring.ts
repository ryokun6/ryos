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

const readChatHelpersSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/stores/chats/authFlows.ts"), "utf-8");

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
    const source = readChatHelpersSource();

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
    const source = readChatHelpersSource();
    assert(
      /contentType\.includes\("json"\)/.test(source),
      'Expected readJsonBody to gate on contentType.includes("json")'
    );
  });

  await runTest("dedupes guard warnings with endpoint-specific keys", async () => {
    const source = readChatHelpersSource();

    assert(
      /ROOMS:\s*"fetchRooms-success-response"/.test(source),
      "Expected dedupe warning key for fetchRooms"
    );
    assert(
      /ROOM_MESSAGES:\s*"fetchMessagesForRoom-success-response"/.test(
        source
      ),
      "Expected dedupe warning key for fetchMessagesForRoom"
    );
    assert(
      /BULK_MESSAGES:\s*"fetchBulkMessages-success-response"/.test(
        source
      ),
      "Expected dedupe warning key for fetchBulkMessages"
    );

    assertEq(
      countMatches(source, /successWarningKey:\s*CHAT_PAYLOAD_WARNING_KEYS\.ROOMS/),
      1,
      "Expected room warning key usage"
    );
    assertEq(
      countMatches(
        source,
        /successWarningKey:\s*CHAT_PAYLOAD_WARNING_KEYS\.ROOM_MESSAGES/
      ),
      1,
      "Expected room-messages warning key usage"
    );
    assertEq(
      countMatches(
        source,
        /successWarningKey:\s*CHAT_PAYLOAD_WARNING_KEYS\.BULK_MESSAGES/
      ),
      1,
      "Expected bulk-messages warning key usage"
    );
  });

  console.log(section("Cooldown availability checks"));
  await runTest("checks cooldown gate for each chat fetch endpoint", async () => {
    const source = readChatHelpersSource();

    assert(
      /ROOMS:\s*"rooms"/.test(source),
      "Expected ROOMS endpoint key constant"
    );
    assert(
      /ROOM_MESSAGES:\s*"room-messages"/.test(source),
      "Expected ROOM_MESSAGES endpoint key constant"
    );
    assert(
      /BULK_MESSAGES:\s*"bulk-messages"/.test(source),
      "Expected BULK_MESSAGES endpoint key constant"
    );

    assertEq(
      countMatches(source, /endpointKey:\s*CHAT_ENDPOINT_KEYS\.ROOMS/),
      1,
      "Expected rooms fetcher cooldown gate"
    );
    assertEq(
      countMatches(source, /endpointKey:\s*CHAT_ENDPOINT_KEYS\.ROOM_MESSAGES/),
      1,
      "Expected room-messages fetcher cooldown gate"
    );
    assertEq(
      countMatches(source, /endpointKey:\s*CHAT_ENDPOINT_KEYS\.BULK_MESSAGES/),
      1,
      "Expected bulk-messages fetcher cooldown gate"
    );
  });

  await runTest("uses a positive cooldown duration constant", async () => {
    const source = readChatHelpersSource();
    const match = source.match(
      /CHAT_API_UNAVAILABLE_COOLDOWN_MS\s*=\s*([0-9_]+)/
    );
    assert(match?.[1], "Expected CHAT_API_UNAVAILABLE_COOLDOWN_MS declaration");
    const parsedMs = Number((match?.[1] || "").replaceAll("_", ""));
    assert(parsedMs > 0, "Expected positive API_UNAVAILABLE_COOLDOWN_MS");
  });

  await runTest("marks cooldown from parse guard and network failures", async () => {
    const source = readChatHelpersSource();

    assertEq(
      countMatches(source, /markApiTemporarilyUnavailable\(endpointKey\)/),
      2,
      "Expected endpoint-key cooldown marking in parse + network paths"
    );
  });

  await runTest("clears cooldown after successful payload parse", async () => {
    const source = readChatHelpersSource();

    assertEq(
      countMatches(source, /clearApiUnavailable\(endpointKey\)/),
      1,
      "Expected endpoint-key cooldown clear path"
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
