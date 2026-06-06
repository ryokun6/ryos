import {
  ToolLoopAgent,
  stepCountIs,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { getOpenAIProviderOptions, type SupportedModel } from "./_aiModels.js";
import type { PreparedRyoConversation } from "./ryo-conversation.js";

type RyoToolLoopAgentOptions = {
  id: string;
  prepared: Pick<PreparedRyoConversation, "selectedModel" | "tools">;
  model: SupportedModel;
  stopAfterSteps: number;
  maxOutputTokens: number;
  temperature?: number;
  headers?: Record<string, string> | undefined;
  tools?: ToolSet;
};

export function createRyoToolLoopAgent({
  id,
  prepared,
  model,
  stopAfterSteps,
  maxOutputTokens,
  temperature = 0.7,
  headers,
  tools,
}: RyoToolLoopAgentOptions): ToolLoopAgent<never, ToolSet> {
  const providerOptions = getOpenAIProviderOptions(model);

  return new ToolLoopAgent<never, ToolSet>({
    id,
    model: prepared.selectedModel,
    tools: tools ?? prepared.tools,
    allowSystemInMessages: true,
    temperature,
    maxOutputTokens,
    stopWhen: stepCountIs(stopAfterSteps),
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
