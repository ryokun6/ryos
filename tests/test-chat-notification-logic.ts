#!/usr/bin/env bun
/**
 * Unit tests for room notification gating logic.
 *
 * This protects the user-facing expectation:
 * show notifications for non-active channels whether Chats is open or closed.
 */

import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
} from "./test-utils";
import { shouldNotifyForRoomMessage } from "../src/utils/chatNotifications";

async function main() {
  clearResults();
  console.log(header("Chat Notification Logic Tests"));

  console.log(section("Closed chats behavior"));
  await runTest("notifies when chats is closed", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: false,
      currentRoomId: "room-a",
      messageRoomId: "room-a",
    });
    assert(result === true, "Expected notifications while chats is closed");
  });

  await runTest("notifies closed chats even with stale active room", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: false,
      currentRoomId: "room-b",
      messageRoomId: "room-b",
    });
    assert(
      result === true,
      "Expected closed chats to notify regardless of stored currentRoomId"
    );
  });

  console.log(section("Open chats behavior"));
  await runTest("suppresses notifications for active room", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: true,
      currentRoomId: "room-c",
      messageRoomId: "room-c",
    });
    assert(result === false, "Expected active room notifications to be suppressed");
  });

  await runTest("notifies for non-active room", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: true,
      currentRoomId: "room-c",
      messageRoomId: "room-d",
    });
    assert(result === true, "Expected non-active room notifications");
  });

  await runTest("notifies room messages when @ryo is active", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: true,
      currentRoomId: null,
      messageRoomId: "room-e",
    });
    assert(result === true, "Expected room notification when @ryo is active");
  });

  console.log(section("Input validation"));
  await runTest("does not notify without message room id", async () => {
    const result = shouldNotifyForRoomMessage({
      chatsOpen: true,
      currentRoomId: "room-f",
      messageRoomId: null,
    });
    assert(result === false, "Expected false for missing message room id");
  });

  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

void main();
