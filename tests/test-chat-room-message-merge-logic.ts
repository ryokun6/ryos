#!/usr/bin/env bun
/**
 * Runtime tests for extracted chat room message merge helpers.
 */

import type { ChatMessage } from "../src/types/chat";
import {
  capRoomMessages,
  mergeServerMessagesWithOptimistic,
  sortAndCapRoomMessages,
} from "../src/stores/chatsRoomMessages";
import {
  assert,
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const createMessage = (
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "id" | "timestamp">
): ChatMessage => ({
  id: overrides.id,
  roomId: overrides.roomId || "room-1",
  username: overrides.username || "alice",
  content: overrides.content || "hello",
  timestamp: overrides.timestamp,
  clientId: overrides.clientId,
});

export async function runChatRoomMessageMergeLogicTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Room Message Merge Logic Tests"));

  console.log(section("Sort + cap helpers"));
  await runTest("sortAndCapRoomMessages sorts ascending and caps to 500", async () => {
    const input = Array.from({ length: 505 }, (_, index) =>
      createMessage({
        id: `m-${index + 1}`,
        timestamp: 505 - index,
      })
    );

    const result = sortAndCapRoomMessages(input);
    assertEq(result.length, 500, "Expected sortAndCapRoomMessages to cap at 500");
    assertEq(result[0]?.timestamp, 6, "Expected oldest retained timestamp to be 6");
    assertEq(result[result.length - 1]?.timestamp, 505);
  });

  await runTest("capRoomMessages keeps latest 500 entries", async () => {
    const input = Array.from({ length: 510 }, (_, index) =>
      createMessage({
        id: `msg-${index + 1}`,
        timestamp: index + 1,
      })
    );

    const result = capRoomMessages(input);
    assertEq(result.length, 500);
    assertEq(result[0]?.id, "msg-11");
    assertEq(result[result.length - 1]?.id, "msg-510");
  });

  console.log(section("Optimistic merge behavior"));
  await runTest("replaces temp message by matching server clientId", async () => {
    const existing = [
      createMessage({
        id: "temp_1",
        clientId: "cid-1",
        username: "alice",
        content: "draft",
        timestamp: 1000,
      }),
    ];
    const fetched = [
      createMessage({
        id: "srv-1",
        clientId: "cid-1",
        username: "alice",
        content: "draft",
        timestamp: 1010,
      }),
    ];

    const result = mergeServerMessagesWithOptimistic(existing, fetched);
    assertEq(result.length, 1);
    assertEq(result[0]?.id, "srv-1");
    assertEq(result[0]?.clientId, "cid-1");
  });

  await runTest("replaces temp message by username/content/time window match", async () => {
    const existing = [
      createMessage({
        id: "temp_2",
        username: "bob",
        content: "same text",
        timestamp: 2000,
      }),
    ];
    const fetched = [
      createMessage({
        id: "srv-2",
        username: "bob",
        content: "same text",
        timestamp: 2005,
      }),
    ];

    const result = mergeServerMessagesWithOptimistic(existing, fetched);
    assertEq(result.length, 1);
    assertEq(result[0]?.id, "srv-2");
    assertEq(result[0]?.clientId, "temp_2");
  });

  await runTest("keeps unmatched optimistic temp message", async () => {
    const existing = [
      createMessage({
        id: "temp_3",
        username: "alice",
        content: "still pending",
        timestamp: 3000,
      }),
    ];
    const fetched = [
      createMessage({
        id: "srv-3",
        username: "carol",
        content: "different",
        timestamp: 3010,
      }),
    ];

    const result = mergeServerMessagesWithOptimistic(existing, fetched);
    assertEq(result.length, 2);
    assert(result.some((message) => message.id === "temp_3"), "Expected temp message to remain");
    assert(result.some((message) => message.id === "srv-3"), "Expected server message to exist");
  });

  await runTest("preserves clientId on server-id overlay", async () => {
    const existing = [
      createMessage({
        id: "srv-4",
        clientId: "cid-existing",
        username: "alice",
        content: "old",
        timestamp: 4000,
      }),
    ];
    const fetched = [
      createMessage({
        id: "srv-4",
        username: "alice",
        content: "new",
        timestamp: 4010,
      }),
    ];

    const result = mergeServerMessagesWithOptimistic(existing, fetched);
    assertEq(result.length, 1);
    assertEq(result[0]?.id, "srv-4");
    assertEq(result[0]?.clientId, "cid-existing");
    assertEq(result[0]?.content, "new");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatRoomMessageMergeLogicTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
