import { describe, expect, test } from "bun:test";
import {
  buildStaticSystemPrompt,
  buildMemoryContextPrompt,
  buildVolatileStatePrompt,
  prepareRyoConversationModelInput,
  type RyoConversationSystemState,
} from "../../../api/_utils/ryo-conversation.js";
import type { MemoryIndex } from "../../../api/_utils/_memory.js";

const baseSystemState: RyoConversationSystemState = {
  username: "testuser",
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
    foreground: { instanceId: "1", appId: "chats", title: "Chats" },
    background: [{ instanceId: "2", appId: "ipod", title: "iPod" }],
  },
  ipod: {
    currentTrack: { id: "track1", title: "Test Song", artist: "Test Artist" },
    librarySource: "youtube",
    isPlaying: true,
  },
};

const testMemories: MemoryIndex = {
  memories: [
    { key: "name", summary: "Their name is Test User" },
    { key: "preferences", summary: "Likes dark mode" },
  ],
  updatedAt: Date.now(),
};

describe("prompt caching structure", () => {
  test("buildStaticSystemPrompt is deterministic for same channel", () => {
    const a = buildStaticSystemPrompt("chat");
    const b = buildStaticSystemPrompt("chat");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1000);
  });

  test("buildStaticSystemPrompt differs between channels", () => {
    const chat = buildStaticSystemPrompt("chat");
    const telegram = buildStaticSystemPrompt("telegram");
    expect(chat).not.toBe(telegram);
  });

  test("buildMemoryContextPrompt includes user identity and memories", () => {
    const prompt = buildMemoryContextPrompt({
      username: "ryo",
      userMemories: testMemories,
      dailyNotesText: "Today I worked on prompt caching.",
    });

    expect(prompt).toContain("<user_context>");
    expect(prompt).toContain("Current User: ryo");
    expect(prompt).toContain("LONG-TERM MEMORIES");
    expect(prompt).toContain("name: Their name is Test User");
    expect(prompt).toContain("DAILY NOTES");
    expect(prompt).toContain("Today I worked on prompt caching.");
    expect(prompt).toContain("</user_context>");
  });

  test("buildMemoryContextPrompt is stable without memories", () => {
    const a = buildMemoryContextPrompt({ username: "ryo" });
    const b = buildMemoryContextPrompt({ username: "ryo" });
    expect(a).toBe(b);
    expect(a).toContain("Current User: ryo");
    expect(a).not.toContain("LONG-TERM MEMORIES");
  });

  test("buildMemoryContextPrompt does not contain volatile data", () => {
    const prompt = buildMemoryContextPrompt({
      username: "ryo",
      userMemories: testMemories,
    });

    expect(prompt).not.toContain("Ryo Time:");
    expect(prompt).not.toContain("User OS:");
    expect(prompt).not.toContain("RUNNING APPLICATIONS");
    expect(prompt).not.toContain("MEDIA PLAYBACK");
  });

  test("buildVolatileStatePrompt includes time and system state", () => {
    const prompt = buildVolatileStatePrompt({
      channel: "chat",
      systemState: baseSystemState,
      username: "testuser",
    });

    expect(prompt).toContain("<system_state>");
    expect(prompt).toContain("Ryo Time:");
    expect(prompt).toContain("User OS: macOS");
    expect(prompt).toContain("RUNNING APPLICATIONS");
    expect(prompt).toContain("Foreground: chats (Chats)");
    expect(prompt).toContain("MEDIA PLAYBACK");
    expect(prompt).toContain("iPod (YouTube): Test Song by Test Artist");
    expect(prompt).toContain("</system_state>");
  });

  test("buildVolatileStatePrompt labels Apple Music iPod context", () => {
    const prompt = buildVolatileStatePrompt({
      channel: "chat",
      systemState: {
        ...baseSystemState,
        ipod: {
          currentTrack: {
            id: "am:1616228595",
            title: "Apple Song",
            artist: "Apple Artist",
            source: "appleMusic",
          },
          librarySource: "appleMusic",
          isPlaying: true,
        },
      },
      username: "testuser",
    });

    expect(prompt).toContain("iPod (Apple Music): Apple Song by Apple Artist");
  });

  test("buildVolatileStatePrompt does not contain memory data", () => {
    const prompt = buildVolatileStatePrompt({
      channel: "chat",
      systemState: baseSystemState,
      username: "testuser",
    });

    expect(prompt).not.toContain("LONG-TERM MEMORIES");
    expect(prompt).not.toContain("DAILY NOTES");
    expect(prompt).not.toContain("Current User:");
  });

  test("buildVolatileStatePrompt excludes apps/media for telegram", () => {
    const prompt = buildVolatileStatePrompt({
      channel: "telegram",
      systemState: baseSystemState,
      username: "testuser",
    });

    expect(prompt).toContain("Ryo Time:");
    expect(prompt).not.toContain("RUNNING APPLICATIONS");
    expect(prompt).not.toContain("MEDIA PLAYBACK");
  });

  test("prepareRyoConversationModelInput emits three instruction messages with cache control", async () => {
    const result = await prepareRyoConversationModelInput({
      channel: "chat",
      messages: [{ id: "1", role: "user", content: "hello" }],
      systemState: baseSystemState,
      username: "testuser",
      preloadedMemoryContext: {
        userMemories: testMemories,
        dailyNotesText: "Test daily note",
      },
    });

    expect(Array.isArray(result.instructions)).toBe(true);
    const instructionMessages = result.instructions as Array<{
      role: string;
      content: string;
      providerOptions?: unknown;
    }>;

    expect(instructionMessages.length).toBe(3);

    // First: static instructions (cached)
    expect(instructionMessages[0].content).toContain("core_priority");
    expect(instructionMessages[0].providerOptions).toBeDefined();

    // Second: memory context (cached)
    expect(instructionMessages[1].content).toContain("user_context");
    expect(instructionMessages[1].content).toContain("LONG-TERM MEMORIES");
    expect(instructionMessages[1].providerOptions).toBeDefined();

    // Third: volatile state (NOT cached)
    expect(instructionMessages[2].content).toContain("system_state");
    expect(instructionMessages[2].content).toContain("Ryo Time:");
    expect(instructionMessages[2].providerOptions).toBeUndefined();

    // Conversation messages must not carry system roles (AI SDK 7)
    expect(result.enrichedMessages.every((m) => m.role !== "system")).toBe(true);
    expect(result.enrichedMessages.some((m) => m.role === "user")).toBe(true);

    // Verify the new fields are populated
    expect(result.memoryContextPrompt).toContain("user_context");
    expect(result.volatileStatePrompt).toContain("system_state");
  });

  test("prepareRyoConversationModelInput emits three instruction messages without memories", async () => {
    const result = await prepareRyoConversationModelInput({
      channel: "chat",
      messages: [{ id: "1", role: "user", content: "hello" }],
      systemState: baseSystemState,
      username: "testuser",
      preloadedMemoryContext: {
        userMemories: null,
        dailyNotesText: null,
      },
    });

    const instructionMessages = result.instructions as Array<{
      role: string;
      content: string;
    }>;

    // Still 3 messages: static + minimal memory context (user identity) + volatile
    expect(instructionMessages.length).toBe(3);
    expect(instructionMessages[0].content).toContain("core_priority");
    expect(instructionMessages[1].content).toContain("user_context");
    expect(instructionMessages[2].content).toContain("system_state");
    expect(result.enrichedMessages.every((m) => m.role !== "system")).toBe(true);
  });
});
