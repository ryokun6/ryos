import { describe, expect, test } from "bun:test";
import { withoutContentlessFailedAssistant } from "../../../src/apps/chats/utils/failedAssistantMessage";
import { describeErrorForLog } from "../../../src/utils/errorLog";
import { formatConsoleArguments } from "../../../src/utils/consoleCapture";

describe("withoutContentlessFailedAssistant", () => {
  const user = { role: "user", parts: [{ type: "text", text: "hi" }] };
  const greeting = {
    role: "assistant",
    parts: [{ type: "text", text: "hello" }],
  };

  test("drops a trailing empty assistant only when the turn errored", () => {
    const empty = { role: "assistant", parts: [] as Array<{ type: string; text?: string }> };
    expect(withoutContentlessFailedAssistant([greeting, user, empty], true)).toEqual([
      greeting,
      user,
    ]);
    expect(withoutContentlessFailedAssistant([greeting, user, empty], false)).toEqual([
      greeting,
      user,
      empty,
    ]);
  });

  test("keeps an assistant message that already has text or a tool part", () => {
    const partial = {
      role: "assistant",
      parts: [{ type: "text", text: "partial" }],
    };
    const tool = {
      role: "assistant",
      parts: [{ type: "tool-launchApp", state: "output-available" }],
    };
    expect(withoutContentlessFailedAssistant([user, partial], true)).toEqual([
      user,
      partial,
    ]);
    expect(withoutContentlessFailedAssistant([user, tool], true)).toEqual([user, tool]);
  });

  test("treats whitespace and reasoning-only parts as contentless", () => {
    const blank = {
      role: "assistant",
      parts: [
        { type: "reasoning", text: "hidden" },
        { type: "text", text: "   " },
      ],
    };
    expect(withoutContentlessFailedAssistant([user, blank], true)).toEqual([user]);
  });
});

describe("client error logging", () => {
  test("describeErrorForLog includes the message and cause", () => {
    const cause = new Error("reasoning part rs_abc:0 not found");
    const error = new Error("An error occurred.", { cause });
    expect(describeErrorForLog(error)).toEqual({
      name: "Error",
      message: "An error occurred.",
      cause: "reasoning part rs_abc:0 not found",
    });
  });

  test("console capture keeps the message when the stack omits it", () => {
    const error = new Error("reasoning part rs_abc:0 not found");
    error.stack = "processQueue@aiModelRequest.js:191:12\nrun@aiModelRequest.js:80:5";
    error.cause = new Error("provider rejected the summary");
    const formatted = formatConsoleArguments(["AI Chat Error:", error]);
    expect(formatted.text).toContain("Error: reasoning part rs_abc:0 not found");
    expect(formatted.text).toContain("Caused by: Error: provider rejected the summary");
    expect(formatted.text).toContain("processQueue@aiModelRequest.js:191:12");
  });
});
