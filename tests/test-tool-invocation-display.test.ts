import { describe, expect, test } from "bun:test";
import {
  formatToolName,
  getSongLibraryCallSummary,
  getSongLibraryResultSummary,
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

  test("builds rich song library loading summaries", () => {
    expect(
      getSongLibraryCallSummary({
        action: "search",
        scope: "user",
        query: "private favorite",
      })
    ).toBe('Searching your library for "private favorite"...');

    expect(
      getSongLibraryCallSummary({
        action: "get",
        scope: "global",
        id: "song_user_1",
      })
    ).toBe("Loading details for song_user_1 from the global library...");

    expect(
      getSongLibraryCallSummary({
        action: "searchYoutube",
        query: "city pop",
      })
    ).toBe('Searching YouTube for "city pop"...');

    expect(
      getSongLibraryCallSummary({
        action: "add",
        title: "Plastic Love",
      })
    ).toBe('Adding "Plastic Love" to your library...');
  });

  test("summarizes song library search results with scope and query", () => {
    expect(
      getSongLibraryResultSummary(
        {
          success: true,
          scope: "any",
          songs: [{ id: "song_user_1" }, { id: "song_user_2" }],
        },
        {
          action: "search",
          query: "private favorite",
        }
      )
    ).toBe('Found 2 songs for "private favorite" in your and shared libraries.');
  });

  test("summarizes song library get results with song metadata", () => {
    expect(
      getSongLibraryResultSummary(
        {
          success: true,
          scope: "any",
          song: {
            title: "Private Favorite",
            artist: "Ryo",
            source: "combined",
          },
        },
        {
          action: "get",
          id: "song_user_1",
        }
      )
    ).toBe(
      'Loaded "Private Favorite" by Ryo from your library and the global library.'
    );
  });

  test("summarizes song library YouTube search and add results", () => {
    expect(
      getSongLibraryResultSummary(
        {
          success: true,
          youtubeResults: [{ videoId: "abc" }, { videoId: "def" }],
        },
        {
          action: "searchYoutube",
          query: "plastic love",
        }
      )
    ).toBe('Found 2 YouTube matches for "plastic love".');

    expect(
      getSongLibraryResultSummary(
        {
          success: true,
          message: 'Added "Plastic Love" to your library.',
          song: {
            title: "Plastic Love",
            artist: "Mariya Takeuchi",
            source: "combined",
          },
        },
        {
          action: "add",
          videoId: "abc123",
        }
      )
    ).toBe('Added "Plastic Love" to your library.');
  });

  test("surfaces song library error messages", () => {
    expect(
      getSongLibraryResultSummary(
        {
          success: false,
          message: "Authentication required to search the user's synced song library.",
          scope: "user",
        },
        {
          action: "search",
          query: "shared",
        }
      )
    ).toBe("Authentication required to search the user's synced song library.");
  });
});
