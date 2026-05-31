import { describe, expect, test } from "bun:test";
import {
  filterUrlsForChatLinkPreviews,
  isCursorAgentDashboardUrl,
} from "../src/utils/cursorAgentDashboardUrl";
import { extractUrlsFromContent } from "../src/apps/chats/components/chat-messages/chat-message-item/utils";

describe("isCursorAgentDashboardUrl", () => {
  test("matches canonical Cursor agent dashboard URLs", () => {
    expect(
      isCursorAgentDashboardUrl("https://cursor.com/agents/bc_abc123")
    ).toBe(true);
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents/ag1")).toBe(
      true
    );
    expect(
      isCursorAgentDashboardUrl("https://www.cursor.com/agents/foo/")
    ).toBe(true);
    expect(
      isCursorAgentDashboardUrl(
        "https://cursor.com/agents/bc_abc?tab=overview#section"
      )
    ).toBe(true);
  });

  test("rejects non-dashboard Cursor and other hosts", () => {
    expect(isCursorAgentDashboardUrl("https://cursor.com/")).toBe(false);
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents")).toBe(false);
    expect(isCursorAgentDashboardUrl("https://cursor.com/agents/")).toBe(
      false
    );
    expect(isCursorAgentDashboardUrl("https://github.com/ryokun6/ryos")).toBe(
      false
    );
    expect(isCursorAgentDashboardUrl("not-a-url")).toBe(false);
  });
});

describe("filterUrlsForChatLinkPreviews", () => {
  test("drops Cursor agent dashboard URLs only", () => {
    const filtered = filterUrlsForChatLinkPreviews([
      "https://cursor.com/agents/bc_1",
      "https://example.com/docs",
      "https://cursor.com/agents/bc_2/",
    ]);
    expect(filtered).toEqual(["https://example.com/docs"]);
  });
});

describe("chat message link preview extraction", () => {
  test("assistant text with agent dashboard + normal link keeps one preview", () => {
    const content =
      "Started the agent: https://cursor.com/agents/bc_xyz\n\nDetails: https://example.com/page";
    const urls = filterUrlsForChatLinkPreviews(extractUrlsFromContent(content));
    expect(urls).toEqual(["https://example.com/page"]);
  });
});
