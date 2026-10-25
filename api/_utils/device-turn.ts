import { randomUUID } from "node:crypto";
import type { Redis } from "./redis.js";
import * as RateLimit from "./_rate-limit.js";
import { getTelegramModel } from "./_aiModels.js";
import {
  prepareRyoConversationModelInput,
  type SimpleConversationMessage,
} from "./ryo-conversation.js";
import {
  createRyoToolLoopAgent,
  RYO_AGENT_TIMEOUTS,
  textStreamFromFullStream,
} from "./ryo-agent.js";
import {
  appendDeviceConversationMessage,
  loadDeviceConversationHistory,
} from "./device-conversation.js";

type Log = (...args: unknown[]) => void;

export type DeviceTurnLimit =
  | { allowed: true }
  | { allowed: false; limit: number; resetSeconds?: number };

/** Burst limit shared by the HTTP turn route and the voice socket. */
export async function checkDeviceTurnLimit(
  redis: Redis,
  username: string
): Promise<DeviceTurnLimit> {
  if (username === "ryo") return { allowed: true };
  const burst = await RateLimit.checkCounterLimit({
    key: RateLimit.makeKey(["rl", "device", "user", username]),
    windowSeconds: 5 * 60,
    limit: 20,
    redis,
  });
  if (burst.allowed) return { allowed: true };
  return { allowed: false, limit: burst.limit, resetSeconds: burst.resetSeconds };
}

function toolResultMessage(output: unknown): { message: string; success: boolean } | null {
  if (!output || typeof output !== "object" || !("message" in output)) return null;
  const message = (output as { message?: unknown }).message;
  if (typeof message !== "string" || message.trim().length === 0) return null;
  const success = (output as { success?: unknown }).success;
  return { message: message.trim(), success: success !== false };
}

export interface DeviceTurnResult {
  messageId: string;
  text: string;
}

/**
 * Runs one Ryo turn on the device channel and records it in the device
 * history. `onText` receives reply text as the model writes it.
 */
export async function runDeviceTurn({
  redis,
  username,
  text,
  log,
  logError,
  onText,
}: {
  redis: Redis;
  username: string;
  text: string;
  log: Log;
  logError: Log;
  onText?: (delta: string) => void;
}): Promise<DeviceTurnResult> {
  const history = await loadDeviceConversationHistory(redis, username);
  const messages: SimpleConversationMessage[] = [
    ...history.map((message, index) => ({
      id: `history-${index}`,
      role: message.role,
      content: message.content,
    })),
    { id: `device-${randomUUID()}`, role: "user", content: text },
  ];

  const model = getTelegramModel((message, ...rest) =>
    log(String(message), rest.length > 0 ? rest : undefined)
  );
  const prepared = await prepareRyoConversationModelInput({
    channel: "device",
    messages,
    username,
    redis,
    model,
    log: (...args: unknown[]) => log(`[Device:${username}]`, args),
    logError: (...args: unknown[]) => logError(`[Device:${username}]`, args),
  });

  let lastToolMessage = "";
  const agent = createRyoToolLoopAgent({
    preset: "telegram",
    prepared,
  });
  const result = await agent.stream({
    messages: prepared.enrichedMessages,
    timeout: RYO_AGENT_TIMEOUTS.telegram,
  });
  let replyText = "";
  const textStream = textStreamFromFullStream(result.stream, (chunk) => {
    if (chunk.type !== "tool-result") return;
    const toolMessage = toolResultMessage((chunk as { output?: unknown }).output);
    if (toolMessage?.success) lastToolMessage = toolMessage.message;
  });
  for await (const chunk of textStream) {
    replyText += chunk;
    onText?.(chunk);
  }
  const streamed = replyText.trim();
  replyText = streamed || lastToolMessage || "done.";
  if (!streamed) onText?.(replyText);

  const now = Date.now();
  await appendDeviceConversationMessage(redis, username, {
    role: "user",
    content: text,
    createdAt: now,
  });
  await appendDeviceConversationMessage(redis, username, {
    role: "assistant",
    content: replyText,
    createdAt: now + 1,
  });

  return { messageId: `device-${randomUUID()}`, text: replyText };
}
