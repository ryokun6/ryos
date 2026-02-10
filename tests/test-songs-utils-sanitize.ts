#!/usr/bin/env bun
/**
 * Runtime tests for song sanitizeInput helper.
 *
 * Why:
 * sanitizeInput was refactored from a single regex to explicit codepoint
 * filtering. These checks lock in expected behavior for invisible-character
 * stripping and normal Unicode preservation.
 */

import { sanitizeInput } from "../_api/songs/_utils";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assertEq,
} from "./test-utils";

export async function runSongSanitizeTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Song sanitizeInput Tests"));

  console.log(section("Invisible character stripping"));
  await runTest("removes zero-width spaces and joiners", async () => {
    assertEq(sanitizeInput("A\u200BB\u200CC\u200DD"), "ABCD");
  });

  await runTest("removes directional and invisible operator marks", async () => {
    assertEq(sanitizeInput("x\u202Ay\u2063z\u202E"), "xyz");
  });

  await runTest("removes listed code points and trims result", async () => {
    assertEq(sanitizeInput("\u00AD  hello\u2060 "), "hello");
  });

  console.log(section("Unicode preservation"));
  await runTest("preserves emoji and CJK text", async () => {
    assertEq(sanitizeInput("你好🙂世界"), "你好🙂世界");
  });

  await runTest("keeps visible punctuation and spacing intact", async () => {
    assertEq(sanitizeInput("A - B / C"), "A - B / C");
  });

  return printSummary();
}

if (import.meta.main) {
  runSongSanitizeTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
