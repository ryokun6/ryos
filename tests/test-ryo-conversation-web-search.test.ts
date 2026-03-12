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
  model: "gpt-5.3" | "gpt-5.4" | "sonnet-4.6" | "gemini-3-flash";
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

  test("adds web_search for telegram on gpt-5.3", async () => {
    const prepared = await prepareConversation({
      channel: "telegram",
      model: "gpt-5.3",
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
});
