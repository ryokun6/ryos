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

/** Friendly labels for tools where word-splitting would be awkward */
const TOOL_DISPLAY_LABELS: Record<string, string> = {
  cursorCloudAgent: "Cursor Cloud agent",
  cursorRyOsRepoAgent: "Cursor Cloud agent",
  listCursorCloudAgentRuns: "Cursor agent runs",
};

export function formatToolName(name: string): string {
  const override = TOOL_DISPLAY_LABELS[name];
  if (override) return override;
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase());
}

type SongLibraryScope = "user" | "global" | "any";
type SongLibraryAction =
  | "list"
  | "search"
  | "get"
  | "searchYoutube"
  | "add";

export type SongLibraryToolInput = {
  action?: SongLibraryAction;
  scope?: SongLibraryScope;
  query?: string;
  id?: string;
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  album?: string;
};

export type SongLibraryToolOutput = {
  success?: boolean;
  message?: string;
  scope?: SongLibraryScope;
  songs?: unknown[];
  youtubeResults?: unknown[];
  song?: {
    title?: string;
    artist?: string;
    source?: "user_library" | "global_cache" | "combined";
  } | null;
};

function formatSongLibraryScope(scope: unknown): string {
  switch (scope) {
    case "user":
      return "your library";
    case "global":
      return "the global library";
    default:
      return "your and shared libraries";
  }
}

function formatSongSource(source: unknown): string {
  switch (source) {
    case "user_library":
      return "your library";
    case "global_cache":
      return "the global library";
    case "combined":
      return "your library and the global library";
    default:
      return "the song library";
  }
}

export function getSongLibraryCallSummary(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const songInput = input as SongLibraryToolInput;
  const scopeLabel = formatSongLibraryScope(songInput.scope);
  const query =
    typeof songInput.query === "string" ? songInput.query.trim() : "";
  const id = typeof songInput.id === "string" ? songInput.id.trim() : "";

  switch (songInput.action) {
    case "list":
      return `Loading recent songs from ${scopeLabel}...`;
    case "search":
      return query
        ? `Searching ${scopeLabel} for "${query}"...`
        : `Searching ${scopeLabel}...`;
    case "searchYoutube":
      return query ? `Searching YouTube for "${query}"...` : "Searching YouTube...";
    case "get":
      return id
        ? `Loading details for ${id} from ${scopeLabel}...`
        : "Loading song details...";
    case "add": {
      const label =
        songInput.title?.trim() ||
        songInput.videoId?.trim() ||
        songInput.id?.trim() ||
        "song";
      return `Adding "${label}" to your library...`;
    }
    default:
      return null;
  }
}

export function getSongLibraryResultSummary(
  output: unknown,
  input?: unknown
): string | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const songOutput = output as SongLibraryToolOutput;
  const songInput =
    input && typeof input === "object" ? (input as SongLibraryToolInput) : {};
  const action = songInput.action;
  const scopeLabel = formatSongLibraryScope(songOutput.scope ?? songInput.scope);
  const query =
    typeof songInput.query === "string" ? songInput.query.trim() : "";

  if (songOutput.success === false) {
    return songOutput.message?.trim() || "Song library request failed.";
  }

  if (action === "list" && Array.isArray(songOutput.songs)) {
    const count = songOutput.songs.length;
    return count === 0
      ? `No songs found in ${scopeLabel}.`
      : `Found ${count} ${count === 1 ? "song" : "songs"} in ${scopeLabel}.`;
  }

  if (action === "search" && Array.isArray(songOutput.songs)) {
    const count = songOutput.songs.length;
    if (count === 0) {
      return query
        ? `No songs matched "${query}" in ${scopeLabel}.`
        : `No songs matched in ${scopeLabel}.`;
    }
    return query
      ? `Found ${count} ${count === 1 ? "song" : "songs"} for "${query}" in ${scopeLabel}.`
      : `Found ${count} ${count === 1 ? "song" : "songs"} in ${scopeLabel}.`;
  }

  if (action === "searchYoutube" && Array.isArray(songOutput.youtubeResults)) {
    const count = songOutput.youtubeResults.length;
    if (count === 0) {
      return query
        ? `No YouTube matches found for "${query}".`
        : "No YouTube matches found.";
    }
    return query
      ? `Found ${count} YouTube ${count === 1 ? "match" : "matches"} for "${query}".`
      : `Found ${count} YouTube ${count === 1 ? "match" : "matches"}.`;
  }

  if (action === "get" && songOutput.song) {
    const title = songOutput.song.title?.trim() || songInput.id?.trim() || "song";
    const artist = songOutput.song.artist?.trim();
    return `Loaded "${title}"${artist ? ` by ${artist}` : ""} from ${formatSongSource(songOutput.song.source)}.`;
  }

  if (action === "add" && songOutput.song) {
    if (typeof songOutput.message === "string" && songOutput.message.trim().length > 0) {
      return songOutput.message.trim();
    }
    const title =
      songOutput.song.title?.trim() ||
      songInput.title?.trim() ||
      songInput.videoId?.trim() ||
      songInput.id?.trim() ||
      "song";
    const artist = songOutput.song.artist?.trim();
    return `Added "${title}"${artist ? ` by ${artist}` : ""} to your library.`;
  }

  if (typeof songOutput.message === "string" && songOutput.message.trim().length > 0) {
    return songOutput.message.trim();
  }

  return null;
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
