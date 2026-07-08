import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const API_TEST_FILES = [
  "tests/integration/api/test-account-delete.test.ts",
  "tests/integration/api/test-admin.test.ts",
  "tests/integration/api/test-ai-conversation-api.test.ts",
  "tests/integration/api/test-ai.test.ts",
  "tests/integration/api/test-api-validation.test.ts",
  "tests/integration/api/test-auth-ban-lockout.test.ts",
  "tests/integration/api/test-auth-extra.test.ts",
  "tests/integration/api/test-auth-recovery.test.ts",
  "tests/integration/api/test-iframe-check.test.ts",
  "tests/integration/api/test-link-preview.test.ts",
  "tests/integration/api/test-listen-security.test.ts",
  "tests/integration/api/test-media.test.ts",
  "tests/integration/api/test-new-api.test.ts",
  "tests/integration/api/test-parse-title.test.ts",
  "tests/integration/api/test-proactive-greeting-api.test.ts",
  "tests/integration/api/test-pusher-auth.test.ts",
  "tests/integration/api/test-rooms-extra.test.ts",
  "tests/integration/api/test-share-applet.test.ts",
  "tests/integration/api/test-song.test.ts",
  "tests/integration/api/test-speech.test.ts",
  "tests/integration/api/test-sync-v2-api.test.ts",
  "tests/integration/api/test-sync-v2-engine-e2e.test.ts",
  "tests/integration/api/test-telegram-webhook.test.ts",
];

export const OPT_IN_TEST_FILES = [
  "tests/integration/opt-in/test-realtime-ws-local.test.ts",
];

const TEST_FILE_RE = /^test-.*\.test\.(ts|tsx)$/;

function walkTestFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip helpers and fixtures — they are not suites.
      if (name === "helpers" || name === "fixtures") continue;
      walkTestFiles(full, out);
      continue;
    }
    if (TEST_FILE_RE.test(name)) out.push(full);
  }
  return out;
}

export function discoverTestFiles(): string[] {
  return walkTestFiles("tests").sort();
}

export function getUnitTestFiles(): string[] {
  const excluded = new Set([...API_TEST_FILES, ...OPT_IN_TEST_FILES]);
  return discoverTestFiles().filter((file) => !excluded.has(file));
}

/** Convenience: all unit suites under a domain folder (e.g. "chat", "sync"). */
export function getUnitDomainFiles(domain: string): string[] {
  const prefix = join("tests", "unit", domain) + "/";
  return getUnitTestFiles().filter((file) => file.startsWith(prefix));
}
