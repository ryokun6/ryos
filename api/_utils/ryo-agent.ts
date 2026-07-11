import {
  NoSuchToolError,
  ToolLoopAgent,
  isStepCount,
  type TextStreamPart,
  type ToolCallRepairFunction,
  type ToolSet,
  type TimeoutConfiguration,
} from "ai";
import { getModelReasoning } from "./_aiModels.js";
import { addCacheControlToMessages } from "./ai-prompt-cache.js";
import type {
  PreparedRyoConversation,
  RyoAgentRuntimeContext,
} from "./ryo-conversation.js";

export type { RyoAgentRuntimeContext };

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

const RYO_AGENT_TIMEOUTS = {
  chat: {
    totalMs: 180_000,
    stepMs: 90_000,
    chunkMs: 45_000,
    toolMs: 45_000,
    tools: {
      webFetchMs: 25_000,
      runJsMs: 20_000,
      searchSongsMs: 25_000,
      mapsSearchPlacesMs: 20_000,
      getWeatherMs: 15_000,
    },
  },
  telegram: {
    totalMs: 120_000,
    stepMs: 60_000,
    chunkMs: 30_000,
    toolMs: 30_000,
    tools: {
      webFetchMs: 20_000,
      runJsMs: 15_000,
      mapsSearchPlacesMs: 20_000,
      getWeatherMs: 15_000,
      songLibraryControlMs: 25_000,
    },
  },
  telegramHeartbeat: {
    totalMs: 90_000,
    stepMs: 45_000,
    toolMs: 25_000,
    tools: {
      webFetchMs: 15_000,
      runJsMs: 10_000,
    },
  },
} as const satisfies Record<string, TimeoutConfiguration<ToolSet>>;

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
  prepared: Pick<
    PreparedRyoConversation,
    | "selectedModel"
    | "modelId"
    | "tools"
    | "instructions"
    | "dynamicContextMessages"
    | "toolsContext"
    | "runtimeContext"
  >;
  temperature?: number;
  tools?: ToolSet;
  toolsContext?: PreparedRyoConversation["toolsContext"];
  runtimeContext?: RyoAgentRuntimeContext;
};

/**
 * Client-executed tools that require in-chat user approval before running.
 * Declared on the agent via AI SDK 7 `toolApproval` (replaces tool-level
 * `needsApproval`).
 */
const RYO_TOOL_APPROVAL = {
  getPreciseLocation: "user-approval" as const,
};

export function createRyoToolLoopAgent({
  preset,
  prepared,
  temperature = 0.7,
  tools,
  toolsContext,
  runtimeContext,
}: RyoToolLoopAgentOptions): ToolLoopAgent<
  never,
  ToolSet,
  RyoAgentRuntimeContext
> {
  const agentPreset = RYO_AGENT_PRESETS[preset];
  const reasoning = getModelReasoning(prepared.modelId);
  const headers = prepared.modelId.startsWith("sonnet")
    ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" }
    : undefined;
  const resolvedTools = tools ?? prepared.tools;
  const dynamicContextMessages = prepared.dynamicContextMessages;
  const resolvedToolsContext = toolsContext ?? prepared.toolsContext;
  const resolvedRuntimeContext = runtimeContext ?? prepared.runtimeContext;
  const hasToolsContext =
    resolvedToolsContext && Object.keys(resolvedToolsContext).length > 0;

  return new ToolLoopAgent<never, ToolSet, RyoAgentRuntimeContext>({
    id: agentPreset.id,
    model: prepared.selectedModel,
    tools: resolvedTools,
    // Static system prompt only — never mutate this for per-request state.
    instructions: prepared.instructions,
    temperature,
    maxOutputTokens: agentPreset.maxOutputTokens,
    stopWhen: isStepCount(agentPreset.stopAfterSteps),
    timeout: RYO_AGENT_TIMEOUTS[preset],
    ...(reasoning ? { reasoning } : {}),
    ...(hasToolsContext ? { toolsContext: resolvedToolsContext } : {}),
    ...(resolvedRuntimeContext
      ? { runtimeContext: resolvedRuntimeContext }
      : {}),
    // Inject memory + volatile state once via messages (AI SDK 7 prepareStep).
    // Returned messages carry forward for later steps, so we only prepend on
    // step 0. Do not override `instructions` here — that would bust the static
    // prompt cache.
    //
    // Every step also marks the last message with Anthropic ephemeral
    // cacheControl so multi-step tool loops can incrementally reuse prefixes.
    prepareStep: ({ stepNumber, messages, model }) => {
      const withDynamicContext =
        stepNumber === 0 && dynamicContextMessages.length > 0
          ? [...dynamicContextMessages, ...messages]
          : messages;

      return {
        messages: addCacheControlToMessages({
          messages: withDynamicContext,
          model,
        }),
      };
    },
    // Only attach approval policy when the tool is actually registered for
    // this profile (e.g. telegram omits getPreciseLocation).
    ...(resolvedTools.getPreciseLocation
      ? { toolApproval: RYO_TOOL_APPROVAL }
      : {}),
    experimental_repairToolCall: repairRyoToolCall,
    ...(headers ? { headers } : {}),
  });
}

export async function* textStreamFromFullStream<TOOLS extends ToolSet>(
  stream: AsyncIterable<TextStreamPart<TOOLS>>,
  onPart?: (part: TextStreamPart<TOOLS>) => Promise<void> | void
): AsyncIterable<string> {
  for await (const part of stream) {
    await onPart?.(part);

    if (part.type === "text-delta") {
      yield part.text;
    }
  }
}
