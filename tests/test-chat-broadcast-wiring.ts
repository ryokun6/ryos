#!/usr/bin/env bun
/**
 * Guardrail tests for chat REST -> Pusher event wiring.
 *
 * Why:
 * The notifications regression was caused by missing realtime emissions
 * in REST routes. These checks ensure that critical broadcast calls stay wired.
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
} from "./test-utils";

const readRoute = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertHasCall = (
  source: string,
  fnName: string,
  description: string
): void => {
  const callPattern = new RegExp(`\\b${fnName}\\s*\\(`);
  assert(callPattern.test(source), `Missing ${fnName} call for ${description}`);
};

export async function runChatBroadcastWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Broadcast Wiring Tests"));

  console.log(section("Core room/message routes"));
  await runTest("room create route emits room-created", async () => {
    const source = readRoute("_api/rooms/index.ts");
    assertHasCall(source, "broadcastRoomCreated", "room creation");
  });

  await runTest("send message route emits room-message", async () => {
    const source = readRoute("_api/rooms/[id]/messages.ts");
    assertHasCall(source, "broadcastNewMessage", "message send");
  });

  await runTest("delete message route emits message-deleted", async () => {
    const source = readRoute("_api/rooms/[id]/messages/[msgId].ts");
    assertHasCall(source, "broadcastMessageDeleted", "message delete");
  });

  console.log(section("Presence and membership routes"));
  await runTest("presence switch route emits room-updated", async () => {
    const source = readRoute("_api/presence/switch.ts");
    assertHasCall(source, "broadcastRoomUpdated", "presence switch");
  });

  await runTest("join route emits room-updated", async () => {
    const source = readRoute("_api/rooms/[id]/join.ts");
    assertHasCall(source, "broadcastRoomUpdated", "room join");
  });

  await runTest("room delete/leave route emits delete/update events", async () => {
    const source = readRoute("_api/rooms/[id].ts");
    assertHasCall(source, "broadcastRoomDeleted", "room delete / private leave");
    assertHasCall(source, "broadcastRoomUpdated", "private leave updates");
  });

  await runTest("leave route emits delete/update events", async () => {
    const source = readRoute("_api/rooms/[id]/leave.ts");
    assertHasCall(source, "broadcastRoomDeleted", "leave route deletions");
    assertHasCall(source, "broadcastRoomUpdated", "leave route updates");
  });

  await runTest("leave route removes deleted private room from registry", async () => {
    const source = readRoute("_api/rooms/[id]/leave.ts");
    assert(
      source.includes("CHAT_ROOMS_SET"),
      "Expected leave route to reference CHAT_ROOMS_SET"
    );
    assert(
      /srem\s*\(\s*CHAT_ROOMS_SET/.test(source),
      "Expected leave route to remove room id from CHAT_ROOMS_SET on deletion"
    );
  });

  await runTest("leave route clears room presence for deleted private room", async () => {
    const source = readRoute("_api/rooms/[id]/leave.ts");
    assertHasCall(source, "deleteRoomPresence", "leave route private deletion cleanup");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatBroadcastWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
