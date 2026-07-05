import type { AIChatMessage } from "@/types/chat";
import { getBrowserTimeZone } from "@/api/core";
import { ASSISTANT_SUMMON_MESSAGE } from "@/shared/assistantGreeting";
import { abortableFetch, type AbortableFetchOptions } from "@/utils/abortableFetch";
import { createClientLogger } from "@/utils/logger";
import { getApiUrl } from "@/utils/platform";

const log = createClientLogger("ConversationMemory");

export type ConversationMemorySource = "chats" | "assistant";

export interface ConversationMemoryMessage {
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
  metadata?: {
    createdAt: string | number;
  };
}

export type ConversationMemoryProcessingResult =
  | {
      status: "skipped";
      reason: "not-authenticated" | "no-user-content";
    }
  | {
      status: "processed";
      extracted: number;
      dailyNotes: number;
    }
  | {
      status: "failed";
    };

interface ProcessConversationMemoriesInput {
  messages: readonly AIChatMessage[];
  isAuthenticated: boolean;
  source: ConversationMemorySource;
}

type MemoryExtractionRequest = (
  url: string,
  options: AbortableFetchOptions
) => Promise<Response>;

interface ProcessConversationMemoriesDependencies {
  request: MemoryExtractionRequest;
  resolveApiUrl: (path: string) => string;
  getTimeZone: () => string | null | undefined;
}

const defaultDependencies: ProcessConversationMemoriesDependencies = {
  request: abortableFetch,
  resolveApiUrl: getApiUrl,
  getTimeZone: getBrowserTimeZone,
};

function normalizeCreatedAt(value: unknown): string | number | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return undefined;
}

export function prepareConversationMessagesForMemory(
  messages: readonly AIChatMessage[]
): ConversationMemoryMessage[] {
  const prepared: ConversationMemoryMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const parts = message.parts.flatMap((part) =>
      part.type === "text" && typeof part.text === "string" && part.text.trim()
        ? [{ type: "text" as const, text: part.text }]
        : []
    );
    if (parts.length === 0) {
      continue;
    }

    const visibleText = parts.map((part) => part.text).join("\n").trim();
    if (message.role === "user" && visibleText === ASSISTANT_SUMMON_MESSAGE) {
      continue;
    }

    const createdAt = normalizeCreatedAt(message.metadata?.createdAt);
    prepared.push({
      role: message.role,
      parts,
      ...(createdAt === undefined ? {} : { metadata: { createdAt } }),
    });
  }

  return prepared;
}

function parseMemoryExtractionResponse(
  value: unknown
): { extracted: number; dailyNotes: number } {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid memory extraction response");
  }

  const extracted = Reflect.get(value, "extracted");
  const dailyNotes = Reflect.get(value, "dailyNotes");
  if (
    typeof extracted !== "number" ||
    !Number.isFinite(extracted) ||
    typeof dailyNotes !== "number" ||
    !Number.isFinite(dailyNotes)
  ) {
    throw new Error("Invalid memory extraction response");
  }

  return { extracted, dailyNotes };
}

export async function processConversationMemories(
  input: ProcessConversationMemoriesInput,
  dependencies: ProcessConversationMemoriesDependencies = defaultDependencies
): Promise<ConversationMemoryProcessingResult> {
  if (!input.isAuthenticated) {
    return { status: "skipped", reason: "not-authenticated" };
  }

  const messages = prepareConversationMessagesForMemory(input.messages);
  if (!messages.some((message) => message.role === "user")) {
    return { status: "skipped", reason: "no-user-content" };
  }

  const timeZone = dependencies.getTimeZone() || "UTC";
  log.debug("Processing cleared conversation", {
    source: input.source,
    messageCount: messages.length,
  });

  try {
    const response = await dependencies.request(
      dependencies.resolveApiUrl("/api/ai/extract-memories"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Timezone": timeZone,
        },
        body: JSON.stringify({ timeZone, messages }),
        timeout: 65000,
        retry: { maxAttempts: 1 },
      }
    );
    const result = parseMemoryExtractionResponse(await response.json());

    log.debug("Processed cleared conversation", {
      source: input.source,
      extracted: result.extracted,
      dailyNotes: result.dailyNotes,
    });
    return { status: "processed", ...result };
  } catch (error) {
    log.warn("Failed to process cleared conversation", {
      source: input.source,
      error,
    });
    return { status: "failed" };
  }
}
