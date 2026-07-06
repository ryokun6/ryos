import { readdirSync } from "node:fs";
import { join } from "node:path";

export const API_TEST_FILES = [
  "tests/test-account-delete.test.ts",
  "tests/test-admin.test.ts",
  "tests/test-ai-conversation-api.test.ts",
  "tests/test-ai.test.ts",
  "tests/test-api-validation.test.ts",
  "tests/test-auth-ban-lockout.test.ts",
  "tests/test-auth-extra.test.ts",
  "tests/test-auth-recovery.test.ts",
  "tests/test-iframe-check.test.ts",
  "tests/test-link-preview.test.ts",
  "tests/test-listen-security.test.ts",
  "tests/test-media.test.ts",
  "tests/test-new-api.test.ts",
  "tests/test-parse-title.test.ts",
  "tests/test-pusher-auth.test.ts",
  "tests/test-rooms-extra.test.ts",
  "tests/test-share-applet.test.ts",
  "tests/test-song.test.ts",
  "tests/test-speech.test.ts",
  "tests/test-sync-v2-api.test.ts",
  "tests/test-sync-v2-engine-e2e.test.ts",
  "tests/test-telegram-webhook.test.ts",
];

export const OPT_IN_TEST_FILES = [
  "tests/test-realtime-ws-local.test.ts",
];

export function discoverTestFiles(): string[] {
  return readdirSync("tests")
    .filter((name) => /^test-.*\.test\.(ts|tsx)$/.test(name))
    .map((name) => join("tests", name))
    .sort();
}

export function getUnitTestFiles(): string[] {
  const excluded = new Set([...API_TEST_FILES, ...OPT_IN_TEST_FILES]);
  return discoverTestFiles().filter((file) => !excluded.has(file));
}
