import { describe, expect, test } from "bun:test";
import {
  extractUrlsFromContent,
  filterLinkPreviewUrls,
  isCursorAgentDashboardUrl,
  messageHasCursorCloudAgentCard,
} from "../src/apps/chats/components/chat-messages/chat-message-item/utils";

describe("isCursorAgentDashboardUrl", () => {
  test("matches cursor.com agent dashboard URLs", () => {
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents/bc_abc")).toBe(
      true
    );
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents/ag1")).toBe(
      true
    );
  });

  test("does not match other cursor.com or unrelated URLs", () => {
    expect(isCursorAgentDashboardUrl("https://cursor.com/")).toBe(false);
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents/")).toBe(false);
    expect(isCursorAgentDashboardUrl("https://example.com/agents/foo")).toBe(
      false
    );
    expect(isCursorAgentDashboardUrl("https://youtube.com/watch?v=abc")).toBe(
      false
    );
  });
});

describe("messageHasCursorCloudAgentCard", () => {
  test("detects async cursorCloudAgent tool output", () => {
    expect(
      messageHasCursorCloudAgentCard([
        {
          type: "tool-cursorCloudAgent",
          toolCallId: "tc1",
          state: "output-available",
          output: { async: true, runId: "run-1", agentId: "ag1" },
        },
      ])
    ).toBe(true);
  });

  test("ignores non-async or incomplete cursorCloudAgent parts", () => {
    expect(
      messageHasCursorCloudAgentCard([
        {
          type: "tool-cursorCloudAgent",
          toolCallId: "tc1",
          state: "input-available",
        },
      ])
    ).toBe(false);
    expect(
      messageHasCursorCloudAgentCard([
        {
          type: "tool-cursorCloudAgent",
          toolCallId: "tc1",
          state: "output-available",
          output: { async: false, runId: "run-1" },
        },
      ])
    ).toBe(false);
    expect(messageHasCursorCloudAgentCard(undefined)).toBe(false);
  });
});

describe("filterLinkPreviewUrls", () => {
  test("suppresses only cursor agent dashboard URLs when card is shown", () => {
    const urls = [
      "https://cursor.com/agents/bc_abc",
      "https://youtube.com/watch?v=abc",
      "https://example.com/story",
    ];
    expect(
      filterLinkPreviewUrls(urls, { suppressCursorAgentDashboard: true })
    ).toEqual(["https://youtube.com/watch?v=abc", "https://example.com/story"]);
    expect(
      filterLinkPreviewUrls(urls, { suppressCursorAgentDashboard: false })
    ).toEqual(urls);
  });
});

describe("extractUrlsFromContent integration", () => {
  test("extracts bare agent dashboard URL from assistant text", () => {
    const content =
      "Started the agent. Agent: https://cursor.com/agents/bc_abc";
    expect(extractUrlsFromContent(content)).toEqual([
      "https://cursor.com/agents/bc_abc",
    ]);
  });
});
