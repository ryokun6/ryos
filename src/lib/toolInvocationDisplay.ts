export type WebSearchToolOutput = {
  action?: {
    type?: string;
    query?: string;
    url?: string | null;
    pattern?: string | null;
  };
  sources?: Array<
    | {
        type?: "url";
        url?: string;
      }
    | {
        type?: "api";
        name?: string;
      }
  >;
};

export function formatToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase());
}

export function getWebSearchSummary(
  output: unknown
): { query: string | null; sourceCount: number } | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const webSearchOutput = output as WebSearchToolOutput;
  const query =
    typeof webSearchOutput.action?.query === "string" &&
    webSearchOutput.action.query.trim().length > 0
      ? webSearchOutput.action.query.trim()
      : null;
  const sourceCount = Array.isArray(webSearchOutput.sources)
    ? webSearchOutput.sources.length
    : 0;

  if (!webSearchOutput.action && !Array.isArray(webSearchOutput.sources)) {
    return null;
  }

  return { query, sourceCount };
}
