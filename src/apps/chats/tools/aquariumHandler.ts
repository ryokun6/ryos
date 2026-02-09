import type { ToolHandler } from "./types";

export const handleAquarium: ToolHandler = (_input, toolCallId, context) => {
  context.addToolResult({
    tool: "aquarium",
    toolCallId,
    output: "Aquarium displayed",
  });
};
