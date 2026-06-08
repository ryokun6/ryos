export const TOOL_EXECUTION_METADATA = [
  { name: "generateHtml", execution: "server" },
  { name: "searchSongs", execution: "server" },
  { name: "memoryWrite", execution: "server" },
  { name: "memoryRead", execution: "server" },
  { name: "memoryDelete", execution: "server" },
  { name: "webFetch", execution: "server" },
  { name: "cursorCloudAgent", execution: "server" },
  { name: "listCursorCloudAgentRuns", execution: "server" },
  { name: "mapsSearchPlaces", execution: "server" },
] as const;

export const SERVER_EXECUTED_TOOL_NAMES = TOOL_EXECUTION_METADATA
  .filter((tool) => tool.execution === "server")
  .map((tool) => tool.name);

export type ServerExecutedToolName = (typeof SERVER_EXECUTED_TOOL_NAMES)[number];

export const SERVER_EXECUTED_TOOL_NAME_SET = new Set<string>(
  SERVER_EXECUTED_TOOL_NAMES
);
