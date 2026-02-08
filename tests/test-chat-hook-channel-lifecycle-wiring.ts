#!/usr/bin/env bun
/**
 * Guardrail tests for chat hook channel lifecycle wiring.
 *
 * Why:
 * A previous regression involved fragile channel lifecycle handling across
 * foreground/background hooks. These checks ensure both hooks keep using
 * shared ref-counted helpers and scoped unbind cleanup.
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

const assertUsesSharedLifecycleHelpers = (
  source: string,
  label: string
): void => {
  assert(
    /subscribePusherChannel\s*\(/.test(source),
    `${label}: expected subscribePusherChannel usage`
  );
  assert(
    /unsubscribePusherChannel\s*\(/.test(source),
    `${label}: expected unsubscribePusherChannel usage`
  );
  assert(
    !/pusherRef\.current\?\.(subscribe|unsubscribe)\s*\(/.test(source),
    `${label}: expected no direct pusherRef.current subscribe/unsubscribe calls`
  );
};

const assertNoBroadUnbinds = (source: string, label: string): void => {
  // Broad unbind looks like: channel.unbind("event")
  const broadUnbindPattern = /\.unbind\(\s*"[^"]+"\s*\)/g;
  assert(
    !broadUnbindPattern.test(source),
    `${label}: expected scoped unbind handlers, found broad unbind`
  );
};

export async function runChatHookChannelLifecycleWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Hook Channel Lifecycle Wiring Tests"));

  console.log(section("Background notifications hook"));
  await runTest("background hook uses shared lifecycle helpers", async () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    assertUsesSharedLifecycleHelpers(source, "useBackgroundChatNotifications");
  });

  await runTest("background hook uses scoped unbind handlers", async () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    assertNoBroadUnbinds(source, "useBackgroundChatNotifications");
  });

  console.log(section("Foreground chat room hook"));
  await runTest("chat room hook uses shared lifecycle helpers", async () => {
    const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
    assertUsesSharedLifecycleHelpers(source, "useChatRoom");
  });

  await runTest("chat room hook uses scoped unbind handlers", async () => {
    const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
    assertNoBroadUnbinds(source, "useChatRoom");
  });

  return printSummary();
}

if (import.meta.main) {
  runChatHookChannelLifecycleWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
