/**
 * Shared token estimation + turn-boundary compaction for AI chat history.
 *
 * Runtime-neutral (no React / DOM / Bun-only APIs) so both the Vite client and
 * the Bun API server can import it. Uses a conservative chars÷4 heuristic —
 * good enough for budgeting against model context windows without shipping a
 * tokenizer to the browser.
 */

import {
  AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX,
  DEFAULT_AI_MODEL,
  getModelConversationTokenBudget,
  type SupportedModel,
} from "./aiModels";

/** Fixed surcharge for image / file parts (vision tokens vary by provider). */
export const AI_IMAGE_PART_TOKEN_ESTIMATE = 1_024;

export function estimateTextTokens(text: string): number {
  // Prefer code-point length so emoji / CJK don't under-count vs UTF-16.
  const codePoints = [...text].length;
  if (codePoints <= 0) return 0;
  return Math.ceil(codePoints / 4);
}

export function estimateJsonTokens(value: unknown): number {
  try {
    return estimateTextTokens(JSON.stringify(value));
  } catch {
    return 256;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function estimateMessagePartTokens(part: unknown): number {
  if (!isRecord(part) || typeof part.type !== "string") return 32;
  const type = part.type;

  if (type === "text" && typeof part.text === "string") {
    return estimateTextTokens(part.text);
  }
  if (type === "reasoning" && typeof part.text === "string") {
    return estimateTextTokens(part.text);
  }
  if (type === "file" || type === "image") {
    return AI_IMAGE_PART_TOKEN_ESTIMATE;
  }
  if (type === "source-url" || type === "source-document") {
    return 64;
  }
  if (type === "step-start") {
    return 4;
  }

  // Tool / dynamic-tool / data parts — size the JSON payloads.
  if (type === "dynamic-tool" || type.startsWith("tool-") || type.startsWith("data-")) {
    let tokens = 24; // tool name / framing
    for (const field of ["input", "output", "rawInput", "errorText", "title"] as const) {
      if (!(field in part) || part[field] === undefined) continue;
      const value = part[field];
      tokens +=
        typeof value === "string"
          ? estimateTextTokens(value)
          : estimateJsonTokens(value);
    }
    return tokens;
  }

  return estimateJsonTokens(part);
}

export function estimateUIMessageTokens(message: {
  role?: string;
  parts?: readonly unknown[];
  content?: unknown;
}): number {
  let tokens = 8; // role / message framing
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      tokens += estimateMessagePartTokens(part);
    }
    return tokens;
  }
  if (typeof message.content === "string") {
    return tokens + estimateTextTokens(message.content);
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      tokens += estimateMessagePartTokens(part);
    }
  }
  return tokens;
}

export function estimateUIMessagesTokens(
  messages: readonly {
    role?: string;
    parts?: readonly unknown[];
    content?: unknown;
  }[]
): number {
  return messages.reduce(
    (total, message) => total + estimateUIMessageTokens(message),
    0
  );
}

export type CompactableMessage = {
  id?: string;
  role: string;
  parts?: readonly unknown[];
  content?: unknown;
};

export interface CompactMessagesByTokenBudgetOptions {
  maxTokens: number;
  /** Absolute message-count ceiling (defaults to shared safety max). */
  maxMessages?: number;
}

/**
 * Keep the newest turns that fit under a token budget, cutting only at
 * user-message boundaries so we never leave a dangling assistant reply.
 */
export function compactMessagesByTokenBudget<T extends CompactableMessage>(
  messages: readonly T[],
  options: CompactMessagesByTokenBudgetOptions
): { messages: T[]; compacted: boolean; estimatedTokens: number } {
  const maxTokens = Math.max(1, Math.floor(options.maxTokens));
  const maxMessages = Math.max(
    1,
    Math.floor(options.maxMessages ?? AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX)
  );

  if (messages.length === 0) {
    return { messages: [], compacted: false, estimatedTokens: 0 };
  }

  const turns: T[][] = [];
  let current: T[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);

  const selected: T[] = [];
  let tokens = 0;
  let messageCount = 0;
  let dropped = false;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    const turnTokens = estimateUIMessagesTokens(turn);
    const nextCount = messageCount + turn.length;
    if (
      selected.length > 0 &&
      (tokens + turnTokens > maxTokens || nextCount > maxMessages)
    ) {
      dropped = true;
      break;
    }
    // Always keep the newest turn even if it alone exceeds the budget — the
    // caller still needs the current user action to reach the model.
    selected.unshift(...turn);
    tokens += turnTokens;
    messageCount = nextCount;
    if (index === turns.length - 1 && (tokens > maxTokens || messageCount > maxMessages)) {
      // Newest turn alone is over budget; keep it and stop.
      dropped = index > 0;
      break;
    }
  }

  const compacted = dropped || selected.length !== messages.length;
  return {
    messages: compacted ? selected : [...messages],
    compacted,
    estimatedTokens: tokens,
  };
}

export function compactMessagesForModelContext<T extends CompactableMessage>(
  messages: readonly T[],
  options?: {
    modelId?: SupportedModel | null;
    maxOutputTokens?: number;
    systemTokenEstimate?: number;
    safetyTokens?: number;
    maxMessages?: number;
  }
): { messages: T[]; compacted: boolean; estimatedTokens: number; maxTokens: number } {
  const maxTokens = getModelConversationTokenBudget(
    options?.modelId ?? DEFAULT_AI_MODEL,
    {
      maxOutputTokens: options?.maxOutputTokens,
      systemTokenEstimate: options?.systemTokenEstimate,
      safetyTokens: options?.safetyTokens,
    }
  );
  const result = compactMessagesByTokenBudget(messages, {
    maxTokens,
    maxMessages: options?.maxMessages,
  });
  return { ...result, maxTokens };
}
