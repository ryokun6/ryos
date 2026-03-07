import { describe, expect, test } from "bun:test";
import {
  formatToolName,
  getWebSearchSummary,
} from "../src/lib/toolInvocationDisplay";

describe("tool invocation display helpers", () => {
  test("formats underscored and camelCase tool names for display", () => {
    expect(formatToolName("web_search")).toBe("Web search");
    expect(formatToolName("calendarControl")).toBe("Calendar Control");
    expect(formatToolName("infinite-mac")).toBe("Infinite mac");
  });

  test("extracts a query from web search output", () => {
    expect(
      getWebSearchSummary({
        action: {
          type: "search",
          query: "latest San Francisco news",
        },
        sources: [{ type: "url", url: "https://example.com" }],
      })
    ).toEqual({
      query: "latest San Francisco news",
      sourceCount: 1,
    });
  });

  test("falls back to generic web search output when no query exists", () => {
    expect(
      getWebSearchSummary({
        action: {
          type: "openPage",
          url: "https://example.com/article",
        },
      })
    ).toEqual({
      query: null,
      sourceCount: 0,
    });
  });

  test("ignores unrelated output shapes", () => {
    expect(getWebSearchSummary("not-an-object")).toBeNull();
    expect(getWebSearchSummary({ message: "hello" })).toBeNull();
  });
});
