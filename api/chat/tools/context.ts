import { z } from "zod";
import type { ToolSet } from "ai";
import type { MemoryToolContext } from "./executors.js";

/**
 * AI SDK 7 per-tool context schema for server-executed chat tools.
 * Validates that the toolsContext entry has the logging/env surface tools need.
 * Redis/username/geo are optional depending on channel and auth.
 */
export const chatToolsContextSchema = z.custom<MemoryToolContext>(
  (value): value is MemoryToolContext =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as MemoryToolContext).log === "function" &&
    typeof (value as MemoryToolContext).logError === "function" &&
    typeof (value as MemoryToolContext).env === "object" &&
    (value as MemoryToolContext).env !== null,
  { message: "Invalid chat tools context" }
);

export type ChatToolsContextMap = Record<string, MemoryToolContext>;

/**
 * Build a per-tool toolsContext map for every tool that declares contextSchema.
 * AI SDK 7 keys toolsContext by tool name; each tool only receives its entry.
 */
export function buildChatToolsContextMap(
  tools: ToolSet,
  context: MemoryToolContext
): ChatToolsContextMap {
  const map: ChatToolsContextMap = {};
  for (const [name, toolDef] of Object.entries(tools)) {
    if (
      toolDef &&
      typeof toolDef === "object" &&
      "contextSchema" in toolDef &&
      toolDef.contextSchema
    ) {
      map[name] = context;
    }
  }
  return map;
}
