#!/usr/bin/env bun

import type { AIChatMessage } from "../src/types/chat";
import {
  buildChatTranscript,
  formatTranscriptTimestamp,
} from "../src/apps/chats/utils/chatTranscript";
import {
  assert,
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const asAiMessage = (value: unknown): AIChatMessage => value as AIChatMessage;

export async function runChatTranscriptTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Transcript Utility Tests"));

  console.log(section("Timestamp formatting"));
  await runTest("formats valid timestamps into 12-hour display time", async () => {
    const formatted = formatTranscriptTimestamp("2026-02-08T15:45:00.000Z");
    assert(formatted.includes(":"), "Expected formatted time to include ':'");
    assert(
      /[AP]M$/i.test(formatted.trim()),
      "Expected formatted time to include AM/PM suffix",
    );
  });

  await runTest("returns empty string for missing or invalid timestamps", async () => {
    assertEq(formatTranscriptTimestamp(undefined), "");
    assertEq(formatTranscriptTimestamp("invalid-date"), "");
  });

  console.log(section("Transcript generation"));
  await runTest("uses username for user messages and Ryo for assistant messages", async () => {
    const transcript = buildChatTranscript({
      messages: [
        asAiMessage({
          id: "u-1",
          role: "user",
          parts: [],
          metadata: { createdAt: new Date("2026-02-08T01:23:00.000Z") },
        }),
        asAiMessage({
          id: "a-1",
          role: "assistant",
          parts: [],
          metadata: { createdAt: new Date("2026-02-08T01:24:00.000Z") },
        }),
      ],
      username: "alice",
      getVisibleText: (message) =>
        message.role === "assistant" ? "Assistant reply" : "User request",
    });

    assert(
      transcript.includes("**alice**"),
      "Expected transcript to include provided username",
    );
    assert(
      transcript.includes("**Ryo**"),
      "Expected transcript to include assistant sender label",
    );
    assert(
      transcript.includes("User request") &&
        transcript.includes("Assistant reply"),
      "Expected transcript to include visible message content",
    );
  });

  await runTest("falls back to 'You' when username is unavailable", async () => {
    const transcript = buildChatTranscript({
      messages: [
        asAiMessage({
          id: "u-2",
          role: "user",
          parts: [],
          metadata: {},
        }),
      ],
      username: null,
      getVisibleText: () => "Fallback user content",
    });

    assert(
      transcript.includes("**You**"),
      "Expected transcript to fall back to 'You' for user sender",
    );
    assert(
      transcript.includes("Fallback user content"),
      "Expected transcript to include provided message content",
    );
  });

  await runTest("omits empty timestamp parentheses when message timestamp is missing", async () => {
    const transcript = buildChatTranscript({
      messages: [
        asAiMessage({
          id: "assistant-no-time",
          role: "assistant",
          parts: [],
          metadata: {},
        }),
      ],
      username: "alice",
      getVisibleText: () => "No time content",
    });

    assert(
      transcript.includes("**Ryo**:"),
      "Expected sender header without timestamp parentheses",
    );
    assert(
      !transcript.includes("()"),
      "Did not expect empty timestamp parentheses in transcript",
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatTranscriptTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
