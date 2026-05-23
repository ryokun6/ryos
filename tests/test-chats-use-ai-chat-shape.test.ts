/**
 * Smoke test: lock down the public return shape of `useAiChat` so the
 * waved-out refactor (and any future internal split) doesn't accidentally
 * change what consumers see.
 *
 * Both `ChatsAppComponent` and Terminal's `useTerminalLogic` destructure
 * specific keys from this hook — adding or removing a key here will
 * break them at runtime even though TypeScript may still happily compile
 * the hook's body.
 *
 * Why parse the source instead of calling the hook: actually rendering
 * the hook would require React, Vercel AI SDK, Zustand stores, etc. all
 * wired up — too much surface area for a unit test. The hook returns a
 * single object literal, so a syntactic check is sufficient to detect
 * shape drift.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(
  __dirname,
  "..",
  "src",
  "apps",
  "chats",
  "hooks",
  "useAiChat.ts"
);

const REQUIRED_KEYS = [
  // AI chat state & actions
  "messages",
  "input",
  "handleInputChange",
  "handleSubmit",
  "handleSubmitMessage",
  "isLoading",
  "reload",
  "error",
  "stop",
  "append",
  "handleDirectMessageSubmit",
  "handleNudge",
  "clearChats",
  "handleSaveTranscript",
  // Image attachment
  "selectedImage",
  "handleImageChange",
  // Rate limit
  "rateLimitError",
  "needsUsername",
  // Dialogs
  "isClearDialogOpen",
  "setIsClearDialogOpen",
  "confirmClearChats",
  "isSaveDialogOpen",
  "setIsSaveDialogOpen",
  "saveFileName",
  "setSaveFileName",
  "handleSaveSubmit",
  // TTS
  "isSpeaking",
  "currentSpokenBlockId",
] as const;

describe("useAiChat return shape", () => {
  const source = readFileSync(HOOK_PATH, "utf8");

  // Extract the final `return { ... };` block of the exported hook.
  // The hook's body ends with `return { ... };\n}` and the object literal
  // is the only one returned from `useAiChat`, so the last `return {`
  // through the matching `};` captures it.
  const lastReturnIdx = source.lastIndexOf("return {");
  if (lastReturnIdx === -1) {
    throw new Error("Could not find `return {` in useAiChat.ts");
  }
  const closeIdx = source.indexOf("};", lastReturnIdx);
  const returnBlock = source.slice(lastReturnIdx, closeIdx);

  for (const key of REQUIRED_KEYS) {
    test(`exposes \`${key}\``, () => {
      // Match either shorthand (`key,`/`key\n`) or aliased form (`key: ...,`).
      const shorthandRe = new RegExp(`\\b${key}\\s*[,\\n]`);
      const aliasedRe = new RegExp(`\\b${key}\\s*:`);
      expect(shorthandRe.test(returnBlock) || aliasedRe.test(returnBlock)).toBe(
        true
      );
    });
  }
});
