#!/usr/bin/env bun
/**
 * Guardrail tests for notification decision integration wiring.
 *
 * Why:
 * Both chat hooks should rely on the shared shouldNotifyForRoomMessage utility
 * to keep notification behavior consistent between foreground/background modes.
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

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertUsesSharedNotificationGate = (
  source: string,
  label: string
): void => {
  assert(
    /shouldNotifyForRoomMessage/.test(source),
    `${label}: expected shouldNotifyForRoomMessage usage`
  );
  assert(
    /shouldNotifyForRoomMessage\s*\(\s*\{/.test(source),
    `${label}: expected invocation with decision payload`
  );
};

export async function runChatNotificationIntegrationWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Notification Integration Wiring Tests"));

  console.log(section("Background hook wiring"));
  await runTest("background notifications hook uses shared gate", async () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    assertUsesSharedNotificationGate(source, "useBackgroundChatNotifications");
  });

  console.log(section("Foreground hook wiring"));
  await runTest("chat room hook uses shared gate", async () => {
    const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
    assertUsesSharedNotificationGate(source, "useChatRoom");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatNotificationIntegrationWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
