import type { Redis } from "../../../_utils/redis.js";
import { extractMemoriesFromConversation } from "../../extract-memories.js";
import { toPlainAIConversationMessages } from "./store.js";
import type { AIConversationMessage } from "../../../../src/shared/contracts/aiConversation.js";

type LogFn = (...args: unknown[]) => void;

/**
 * Best-effort memory extraction for a just-cleared conversation. Runs once
 * from the reset endpoint (via `waitUntil`); a failure is logged and dropped
 * rather than retried — memory extraction is advisory, not transactional.
 */
export async function processClearedAIConversationMemory({
  redis,
  username,
  messages,
  operationId,
  timeZone,
  log,
  logError,
}: {
  redis: Redis;
  username: string;
  messages: readonly AIConversationMessage[];
  operationId: string;
  timeZone?: string;
  log?: LogFn;
  logError?: LogFn;
}): Promise<void> {
  const plainMessages = toPlainAIConversationMessages(messages);
  if (!plainMessages.some((message) => message.role === "user")) {
    return;
  }
  await extractMemoriesFromConversation({
    redis,
    username,
    messages: plainMessages.map((message) => ({
      role: message.role,
      content: message.content,
      metadata: { createdAt: message.createdAt },
    })),
    ...(timeZone ? { timeZone } : {}),
    storeLongTermMemories: true,
    markTodayProcessed: true,
    operationScopeId: operationId,
    ...(log ? { log } : {}),
    ...(logError ? { logError } : {}),
  });
}
