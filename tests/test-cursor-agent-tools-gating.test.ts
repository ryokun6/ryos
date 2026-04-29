import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  prepareRyoConversationModelInput,
  type RyoConversationSystemState,
} from "../api/_utils/ryo-conversation.js";

/**
 * End-to-end gating: only the configured owner account ("ryo"), AND only when
 * CURSOR_API_KEY is set, should see the cursorAgent* tools registered with the
 * model. This locks the gate at the wiring layer (one level above the
 * per-executor owner check).
 */

const baseMessages = [
  { id: "msg-1", role: "user", content: "are any cursor agents running?" },
];

const baseSystemState: RyoConversationSystemState = {
  username: "ryo",
  userLocalTime: {
    timeString: "10:30 AM",
    dateString: "Wednesday, April 29, 2026",
    timeZone: "America/Los_Angeles",
  },
};

async function prepareConversation(options: {
  channel: "chat" | "telegram";
  username?: string | null;
}) {
  return prepareRyoConversationModelInput({
    channel: options.channel,
    messages: baseMessages,
    model: "sonnet-4.6",
    username: options.username,
    systemState: baseSystemState,
  });
}

describe("cursorAgent tool gating in prepareRyoConversationModelInput", () => {
  let priorApiKey: string | undefined;

  beforeAll(() => {
    priorApiKey = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = "test-cursor-api-key";
  });

  afterAll(() => {
    if (priorApiKey === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = priorApiKey;
    }
  });

  test("registers cursorAgentStart and cursorAgentList for owner (chat)", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: "ryo",
    });
    expect("cursorAgentStart" in prepared.tools).toBe(true);
    expect("cursorAgentList" in prepared.tools).toBe(true);
  });

  test("registers cursorAgentStart and cursorAgentList for owner (telegram)", async () => {
    const prepared = await prepareConversation({
      channel: "telegram",
      username: "ryo",
    });
    expect("cursorAgentStart" in prepared.tools).toBe(true);
    expect("cursorAgentList" in prepared.tools).toBe(true);
  });

  test("does not register cursorAgent tools for a non-owner username", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: "alice",
    });
    expect("cursorAgentStart" in prepared.tools).toBe(false);
    expect("cursorAgentList" in prepared.tools).toBe(false);
  });

  test("does not register cursorAgent tools for an anonymous user", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: null,
    });
    expect("cursorAgentStart" in prepared.tools).toBe(false);
    expect("cursorAgentList" in prepared.tools).toBe(false);
  });

  test("does not include the Cursor system-prompt addon for non-owner", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: "alice",
    });
    expect(prepared.staticSystemPrompt).not.toContain("CURSOR CLOUD AGENTS");
    expect(prepared.staticSystemPrompt).not.toContain("cursorAgentStart");
  });

  test("includes the Cursor system-prompt addon for owner", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: "ryo",
    });
    expect(prepared.staticSystemPrompt).toContain("CURSOR CLOUD AGENTS");
    expect(prepared.staticSystemPrompt).toContain("cursorAgentStart");
    expect(prepared.staticSystemPrompt).toContain("cursorAgentList");
  });
});

describe("cursorAgent tool gating without CURSOR_API_KEY", () => {
  let priorApiKey: string | undefined;

  beforeAll(() => {
    priorApiKey = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
  });

  afterAll(() => {
    if (priorApiKey !== undefined) {
      process.env.CURSOR_API_KEY = priorApiKey;
    }
  });

  test("does not register cursorAgent tools when CURSOR_API_KEY is absent, even for owner", async () => {
    const prepared = await prepareConversation({
      channel: "chat",
      username: "ryo",
    });
    expect("cursorAgentStart" in prepared.tools).toBe(false);
    expect("cursorAgentList" in prepared.tools).toBe(false);
  });
});
