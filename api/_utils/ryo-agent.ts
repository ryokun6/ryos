import {
  NoSuchToolError,
  ToolLoopAgent,
  isStepCount,
  type TextStreamPart,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import { getOpenAIProviderOptions } from "./_aiModels.js";
import type { PreparedRyoConversation } from "./ryo-conversation.js";

/**
 * Deterministic tool-call repair for malformed inputs.
 *
 * Models occasionally emit tool arguments as double-encoded JSON or wrapped
 * in markdown fences, which fails schema parsing and surfaces as a tool
 * error the model must burn a step recovering from. This repairs the common
 * encoding mistakes without an extra LLM round-trip; anything else (including
 * calls to unknown tools) is left to the SDK's normal error path.
 */
export const repairRyoToolCall: ToolCallRepairFunction<ToolSet> = async ({
  toolCall,
  error,
}) => {
  if (NoSuchToolError.isInstance(error)) {
    return null;
  }

  const raw = toolCall.input;
  if (typeof raw !== "string") return null;

  let candidate = raw.trim();

  // Strip markdown code fences (```json ... ```)
  const fenceMatch = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    candidate = fenceMatch[1].trim();
  }

  try {
    let parsed: unknown = JSON.parse(candidate);
    // Unwrap double-encoded JSON ("{\"a\":1}" parsed to a string)
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const repairedInput = JSON.stringify(parsed);
      if (repairedInput !== raw) {
        return { ...toolCall, input: repairedInput };
      }
    }
  } catch {
    // Not repairable deterministically; let the SDK surface the error.
  }

  return null;
};

export const RYO_AGENT_PRESETS = {
  chat: {
    id: "ryo-chat",
    stopAfterSteps: 10,
    maxOutputTokens: 48000,
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
    stopWhen: isStepCount(agentPreset.stopAfterSteps),
    experimental_repairToolCall: repairRyoToolCall,
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
