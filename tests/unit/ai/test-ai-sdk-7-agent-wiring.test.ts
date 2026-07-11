import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addCacheControlToMessages } from "../../../api/_utils/ai-prompt-cache.js";
import { buildChatToolsContextMap } from "../../../api/chat/tools/context.js";
import { chatToolsContextSchema } from "../../../api/chat/tools/context.js";
import type { ModelMessage } from "ai";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AI SDK 7 Ryo agent wiring", () => {
  test("ToolLoopAgent uses static instructions and prepareStep for dynamic context", () => {
    const source = readSource("api/_utils/ryo-agent.ts");

    expect(source).toContain("instructions: prepared.instructions");
    expect(source).toContain("prepareStep:");
    expect(source).toContain("dynamicContextMessages");
    expect(source).toContain('getPreciseLocation: "user-approval"');
    expect(source).toContain("toolApproval: RYO_TOOL_APPROVAL");
    expect(source).toContain("timeout: RYO_AGENT_TIMEOUTS[preset]");
    expect(source).toContain("getModelReasoning");
    expect(source).toContain("toolsContext");
    expect(source).toContain("runtimeContext");
    expect(source).toContain("addCacheControlToMessages");
    expect(source).not.toContain("allowSystemInMessages");
    expect(source).not.toContain("getOpenAIProviderOptions");
    expect(source).not.toMatch(/needsApproval\s*:/);
    // prepareStep must not override instructions (keeps static prompt cache)
    expect(source).not.toMatch(/prepareStep:[\s\S]*?instructions\s*:/);
  });

  test("prepareRyoConversationModelInput returns static instructions + dynamicContextMessages", () => {
    const source = readSource("api/_utils/ryo-conversation.ts");

    expect(source).toContain("instructions: SystemModelMessage");
    expect(source).toContain("dynamicContextMessages: ModelMessage[]");
    expect(source).toContain("toolsContext: ChatToolsContextMap");
    expect(source).toContain("runtimeContext: RyoAgentRuntimeContext");
    expect(source).toContain("enrichedMessages: modelMessages");
    expect(source).toContain("buildChatToolsContextMap");
    expect(source).toMatch(/Static instructions stay in the top-level/);
  });

  test("chat tools no longer set needsApproval on getPreciseLocation", () => {
    const source = readSource("api/chat/tools/index.ts");
    const toolBlockStart = source.indexOf(
      "// Precise Location Tool (Client-side execution, approval-gated)"
    );
    const toolBlock = source.slice(
      toolBlockStart,
      source.indexOf("mapsSearchPlaces:", toolBlockStart)
    );

    expect(toolBlock).toContain("getPreciseLocation:");
    expect(toolBlock).toContain("toolApproval");
    expect(toolBlock).not.toMatch(/needsApproval\s*:/);
  });

  test("server chat tools declare contextSchema for toolsContext", () => {
    const source = readSource("api/chat/tools/index.ts");
    expect(source).toContain("contextSchema: chatToolsContextSchema");
    expect(source).toContain("bindServerExecute");
    expect(source).toContain("options?.context ?? fallbackContext");
  });
});

describe("AI SDK 7 prompt cache helper", () => {
  test("marks last message for Anthropic models only", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "again" },
    ];

    const anthropicCached = addCacheControlToMessages({
      messages,
      model: {
        provider: "anthropic.messages",
        modelId: "claude-sonnet-4-6",
      } as never,
    });

    expect(anthropicCached[0].providerOptions).toBeUndefined();
    expect(anthropicCached[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });

    const openaiPassthrough = addCacheControlToMessages({
      messages,
      model: {
        provider: "openai.responses",
        modelId: "gpt-5.5",
      } as never,
    });
    expect(openaiPassthrough).toEqual(messages);
  });

  test("merges into existing anthropic providerOptions instead of replacing them", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "cached",
        providerOptions: {
          anthropic: {
            cacheControl: { type: "ephemeral" },
            // Preserve any other Anthropic bag fields already on the message.
            somethingElse: true,
          } as never,
          otherProvider: { keep: true } as never,
        },
      },
    ];

    const cached = addCacheControlToMessages({
      messages,
      model: {
        provider: "anthropic.messages",
        modelId: "claude-sonnet-4-6",
      } as never,
    });

    expect(cached[0].providerOptions).toEqual({
      otherProvider: { keep: true },
      anthropic: {
        somethingElse: true,
        cacheControl: { type: "ephemeral" },
      },
    });
  });
});

describe("AI SDK 7 agent call-site timeouts", () => {
  test("chat / telegram / heartbeat pass timeout on stream/generate", () => {
    const chat = readSource("api/chat.ts");
    expect(chat).toContain("RYO_AGENT_TIMEOUTS");
    expect(chat).toContain("timeout: RYO_AGENT_TIMEOUTS.chat");

    const telegram = readSource("api/webhooks/telegram.ts");
    expect(telegram).toContain("timeout: RYO_AGENT_TIMEOUTS.telegram");

    const heartbeat = readSource("api/cron/telegram-heartbeat.ts");
    expect(heartbeat).toContain(
      "timeout: RYO_AGENT_TIMEOUTS.telegramHeartbeat"
    );
  });
});

describe("AI SDK 7 toolsContext map", () => {
  test("buildChatToolsContextMap only includes tools with contextSchema", () => {
    const context = {
      log: () => {},
      logError: () => {},
      env: {},
      username: "ryo",
    };

    const map = buildChatToolsContextMap(
      {
        memoryWrite: {
          description: "write",
          inputSchema: chatToolsContextSchema,
          contextSchema: chatToolsContextSchema,
          execute: async () => ({ ok: true }),
        },
        launchApp: {
          description: "launch",
          inputSchema: chatToolsContextSchema,
        },
      } as never,
      context
    );

    expect(Object.keys(map)).toEqual(["memoryWrite"]);
    expect(map.memoryWrite).toBe(context);
  });
});
