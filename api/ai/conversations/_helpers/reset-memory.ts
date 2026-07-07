import type { Redis } from "../../../_utils/redis.js";
import { deleteUnreferencedAIAttachmentsForNames } from "../../attachments/_helpers/store.js";
import { extractMemoriesFromConversation } from "../../extract-memories.js";
import {
  processPendingAIConversationResetMemory,
  type ProcessPendingAIConversationResetMemoryResult,
} from "./store.js";
import type { AIConversationChannel } from "../../../../src/shared/contracts/aiConversation.js";

type LogFn = (...args: unknown[]) => void;

export async function extractPendingAIConversationResetMemory({
  redis,
  username,
  channel,
  log,
  logError,
}: {
  redis: Redis;
  username: string;
  channel: AIConversationChannel;
  log?: LogFn;
  logError?: LogFn;
}): Promise<ProcessPendingAIConversationResetMemoryResult> {
  return processPendingAIConversationResetMemory({
    redis,
    username,
    channel,
    processSnapshot: async (snapshot) => {
      await deleteUnreferencedAIAttachmentsForNames({
        redis,
        username,
        names: snapshot.attachmentNames,
      });
      if (!snapshot.messages.some((message) => message.role === "user")) {
        return;
      }
      await extractMemoriesFromConversation({
        redis,
        username,
        messages: snapshot.messages.map((message) => ({
          role: message.role,
          content: message.content,
          metadata: { createdAt: message.createdAt },
        })),
        ...(snapshot.timeZone ? { timeZone: snapshot.timeZone } : {}),
        storeLongTermMemories: true,
        markTodayProcessed: true,
        operationScopeId: snapshot.id,
        ...(log ? { log } : {}),
        ...(logError ? { logError } : {}),
      });
    },
  });
}
