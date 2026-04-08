import { describe, expect, test } from "bun:test";
import {
  prepareRyoConversationModelInput,
  type RyoConversationSystemState,
} from "../api/_utils/ryo-conversation.js";

const baseMessages = [{ id: "msg-1", role: "user", content: "what happened today?" }];

const baseSystemState: RyoConversationSystemState = {
  username: "ryo",
  userLocalTime: {
    timeString: "10:30 AM",
    dateString: "Saturday, March 7, 2026",
    timeZone: "America/Los_Angeles",
  },
  requestGeo: {
    city: "San Francisco",
    region: "California",
    country: "US",
  },
};

async function prepareConversation(options: {
  channel: "chat" | "telegram";
  model: "gpt-5.4" | "sonnet-4.6" | "gemini-3-flash";
  username?: string | null;
  systemState?: RyoConversationSystemState;
}) {
  return prepareRyoConversationModelInput({
    channel: options.channel,
    messages: baseMessages,
    model: options.model,
    username: options.username,
    systemState: options.systemState,
  });
}

function hasWebSearchTool(
  tools: Record<string, unknown>
): tools is Record<string, { id?: string }> {
  return "web_search" in tools;
}

function hasGoogleSearchTool(
  tools: Record<string, unknown>
): tools is Record<string, { id?: string }> {
  return "google_search" in tools;
}

describe("prepareRyoConversationModelInput web search gating", () => {
  test("adds web_search for authenticated chat on gpt-5.4", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      model: "gpt-5.4",
      username: "ryo",
      systemState: baseSystemState,
    });

    expect(hasWebSearchTool(prepared.tools)).toBe(true);
    expect(prepared.tools.web_search.id).toBe("openai.web_search");
  });

  test("does not add web_search for anonymous chat on gpt-5.4", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      model: "gpt-5.4",
      username: null,
      systemState: baseSystemState,
    });

    expect("web_search" in prepared.tools).toBe(false);
  });

  test("does not add web_search for authenticated chat on non-openai models", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      model: "sonnet-4.6",
      username: "ryo",
      systemState: baseSystemState,
    });

    expect("web_search" in prepared.tools).toBe(false);
  });

  test("adds web_search for telegram on gpt-5.4", async () => {
    const prepared = await prepareConversation({
      channel: "telegram",
      model: "gpt-5.4",
      username: "ryo",
    });

    expect(hasWebSearchTool(prepared.tools)).toBe(true);
    expect(prepared.tools.web_search.id).toBe("openai.web_search");
  });

  test("adds google_search for authenticated chat on gemini 3 flash", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      model: "gemini-3-flash",
      username: "ryo",
      systemState: baseSystemState,
    });

    expect("web_search" in prepared.tools).toBe(false);
    expect(hasGoogleSearchTool(prepared.tools)).toBe(true);
    expect(prepared.tools.google_search.id).toBe("google.google_search");
  });

  test("adds google_search for telegram on gemini 3 flash", async () => {
    const prepared = await prepareConversation({
      channel: "telegram",
      model: "gemini-3-flash",
      username: "ryo",
    });

    expect("web_search" in prepared.tools).toBe(false);
    expect(hasGoogleSearchTool(prepared.tools)).toBe(true);
    expect(prepared.tools.google_search.id).toBe("google.google_search");
  });

  test("does not add google_search for anonymous gemini conversations", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      model: "gemini-3-flash",
      username: null,
      systemState: baseSystemState,
    });

    expect("google_search" in prepared.tools).toBe(false);
  });

  test("splits cacheable memory context from volatile runtime state", async () => {
    const prepared = await prepareRyoConversationModelInput({
      channel: "chat",
      messages: baseMessages,
      model: "gpt-5.4",
      username: "ryo",
      systemState: {
        ...baseSystemState,
        runningApps: {
          foreground: {
            instanceId: "chat-1",
            appId: "chats",
            title: "Chats",
          },
          background: [],
        },
      },
      preloadedMemoryContext: {
        userMemories: {
          version: 1,
          memories: [
            {
              key: "projects",
              summary: "User is iterating on prompt caching",
              updatedAt: 123,
            },
          ],
        },
        dailyNotesText: "2026-03-07 – exploring static prompt caching",
        userTimeZone: "America/Los_Angeles",
      },
    });

    expect(prepared.loadedSections).toEqual([
      "STATIC_SYSTEM_PROMPT",
      "MEMORY_CONTEXT",
      "RUNTIME_SYSTEM_STATE",
    ]);
    expect(prepared.dynamicSystemPrompts).toHaveLength(2);
    expect(prepared.dynamicSystemPrompts[0]).toContain("<memory_context>");
    expect(prepared.dynamicSystemPrompts[0]).toContain("## DAILY NOTES (recent journal)");
    expect(prepared.dynamicSystemPrompts[0]).toContain("projects: User is iterating on prompt caching");
    expect(prepared.dynamicSystemPrompts[0]).not.toContain("<system_state>");
    expect(prepared.dynamicSystemPrompts[1]).toContain("<system_state>");
    expect(prepared.dynamicSystemPrompts[1]).toContain("## RUNNING APPLICATIONS");
    expect(prepared.dynamicSystemPrompts[1]).not.toContain("## LONG-TERM MEMORIES");

    expect(prepared.enrichedMessages[0]?.role).toBe("system");
    expect(prepared.enrichedMessages[0]).toHaveProperty("providerOptions");
    expect(prepared.enrichedMessages[1]?.role).toBe("system");
    expect(prepared.enrichedMessages[1]).toHaveProperty("providerOptions");
    expect(prepared.enrichedMessages[2]?.role).toBe("system");
    expect(prepared.enrichedMessages[2]).not.toHaveProperty("providerOptions");
  });
});
