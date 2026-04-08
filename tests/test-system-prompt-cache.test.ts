import { describe, expect, test } from "bun:test";
import {
  createDynamicSystemMessage,
  createStaticSystemMessage,
  createSystemMessages,
} from "../api/_utils/prompt-cache.js";
import {
  prepareRyoConversationModelInput,
  type RyoConversationSystemState,
} from "../api/_utils/ryo-conversation.js";

describe("system prompt cache boundaries", () => {
  test("marks only static system prompts for provider caching", () => {
    const staticMessage = createStaticSystemMessage("stable instructions");
    const dynamicMessage = createDynamicSystemMessage("runtime state");

    expect(staticMessage).toMatchObject({
      role: "system",
      content: "stable instructions",
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
    expect(dynamicMessage).toEqual({
      role: "system",
      content: "runtime state",
    });
  });

  test("places static system prompts before dynamic context", () => {
    const messages = createSystemMessages({
      staticPrompt: "stable instructions",
      dynamicPrompt: "<system_state>runtime state</system_state>",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "system",
      content: "stable instructions",
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
    expect(messages[1]).toEqual({
      role: "system",
      content: "<system_state>runtime state</system_state>",
    });
  });

  test("keeps Ryo static instructions cacheable while isolating runtime state", async () => {
    const systemState: RyoConversationSystemState = {
      username: "ryo",
      userOS: "macOS",
      locale: "en-US",
      userLocalTime: {
        timeString: "10:30 AM",
        dateString: "Saturday, March 7, 2026",
        timeZone: "America/Los_Angeles",
      },
      requestGeo: {
        city: "San Francisco",
        country: "US",
      },
      runningApps: {
        foreground: {
          instanceId: "ie-1",
          appId: "internet-explorer",
          title: "Internet Explorer",
        },
        background: [],
      },
      internetExplorer: {
        url: "https://example.com",
        year: "1999",
        currentPageTitle: "Example",
        aiGeneratedMarkdown: "# dynamic page content",
      },
    };

    const prepared = await prepareRyoConversationModelInput({
      channel: "chat",
      model: "sonnet-4.6",
      username: "ryo",
      systemState,
      messages: [{ role: "user", content: "what's open?" }],
      preloadedMemoryContext: {
        userMemories: {
          version: 1,
          memories: [
            {
              key: "projects",
              summary: "User is optimizing prompt cache behavior.",
              updatedAt: 123,
            },
          ],
        },
        dailyNotesText: "2026-03-07:\n  10:00:00: user is testing prompts",
        userTimeZone: "America/Los_Angeles",
      },
    });

    expect(prepared.enrichedMessages[0]).toMatchObject({
      role: "system",
      content: prepared.staticSystemPrompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
    expect(prepared.enrichedMessages[1]).toEqual({
      role: "system",
      content: prepared.dynamicSystemPrompt,
    });
    expect(prepared.staticSystemPrompt).toContain("<chat_instructions>");
    expect(prepared.staticSystemPrompt).not.toContain("User Location:");
    expect(prepared.staticSystemPrompt).not.toContain("10:30 AM");
    expect(prepared.staticSystemPrompt).not.toContain("# dynamic page content");
    expect(prepared.staticSystemPrompt).not.toContain("optimizing prompt cache behavior");
    expect(prepared.dynamicSystemPrompt).toContain("<system_state>");
    expect(prepared.dynamicSystemPrompt).toContain("San Francisco");
    expect(prepared.dynamicSystemPrompt).toContain("10:30 AM");
    expect(prepared.dynamicSystemPrompt).toContain("# dynamic page content");
    expect(prepared.dynamicSystemPrompt).toContain("optimizing prompt cache behavior");
  });
});
