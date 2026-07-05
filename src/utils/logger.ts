import { isDebugEnabled } from "@/utils/debug";
import { summarizeForStructuredLog } from "@/shared/logSummarize";

export type LogContext = Record<string, unknown>;

const CLIENT_LOG_OPTIONS = {
  maxStringLength: 160,
  includeBrowserTypes: true,
  includeErrorProps: true,
} as const;

export function summarizeForLog(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  key?: string
): unknown {
  return summarizeForStructuredLog(value, depth, seen, key, CLIENT_LOG_OPTIONS);
}

function formatLogArgs(scope: string, message: string, context?: unknown): unknown[] {
  const prefix = `[${scope}]`;
  return context === undefined
    ? [prefix, message]
    : [prefix, message, summarizeForLog(context)];
}

export function createClientLogger(scope: string) {
  return {
    debug(message: string, context?: unknown): void {
      if (isDebugEnabled()) console.log(...formatLogArgs(scope, message, context));
    },
    info(message: string, context?: unknown): void {
      if (isDebugEnabled()) console.info(...formatLogArgs(scope, message, context));
    },
    warn(message: string, context?: unknown): void {
      console.warn(...formatLogArgs(scope, message, context));
    },
    error(message: string, context?: unknown): void {
      console.error(...formatLogArgs(scope, message, context));
    },
  };
}
