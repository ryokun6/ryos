import {
  ToolLoopAgent,
  stepCountIs,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { getOpenAIProviderOptions } from "./_aiModels.js";
import type { PreparedRyoConversation } from "./ryo-conversation.js";

export const RYO_AGENT_PRESETS = {
  chat: {
    id: "ryo-chat",
    stopAfterSteps: 8,
    maxOutputTokens: 8192,
  },
  telegram: {
    id: "ryo-telegram",
    stopAfterSteps: 6,
    maxOutputTokens: 4000,
  },
  telegramHeartbeat: {
    id: "ryo-telegram-heartbeat",
    stopAfterSteps: 6,
    maxOutputTokens: 4000,
  },
} as const;

type RyoAgentPresetName = keyof typeof RYO_AGENT_PRESETS;

type RyoToolLoopAgentOptions = {
  preset: RyoAgentPresetName;
  prepared: Pick<PreparedRyoConversation, "selectedModel" | "modelId" | "tools">;
  temperature?: number;
  tools?: ToolSet;
};

export function createRyoToolLoopAgent({
  preset,
  prepared,
  temperature = 0.7,
  tools,
}: RyoToolLoopAgentOptions): ToolLoopAgent<never, ToolSet> {
  const agentPreset = RYO_AGENT_PRESETS[preset];
  const providerOptions = getOpenAIProviderOptions(prepared.modelId);
  const headers = prepared.modelId.startsWith("sonnet")
    ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" }
    : undefined;

  return new ToolLoopAgent<never, ToolSet>({
    id: agentPreset.id,
    model: prepared.selectedModel,
    tools: tools ?? prepared.tools,
    allowSystemInMessages: true,
    temperature,
    maxOutputTokens: agentPreset.maxOutputTokens,
    stopWhen: stepCountIs(agentPreset.stopAfterSteps),
    ...(headers ? { headers } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  });
}

export async function* textStreamFromFullStream<TOOLS extends ToolSet>(
  fullStream: AsyncIterable<TextStreamPart<TOOLS>>,
  onPart?: (part: TextStreamPart<TOOLS>) => Promise<void> | void
): AsyncIterable<string> {
  for await (const part of fullStream) {
    await onPart?.(part);

    if (part.type === "text-delta") {
      yield part.text;
    }
  }
}
