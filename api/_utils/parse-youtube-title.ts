import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

export interface ParsedYouTubeTitle {
  title: string;
  artist?: string;
  album?: string;
}

export type ParseYouTubeTitleFallback = "regex" | "raw";

export interface ParseYouTubeTitleOptions {
  requestId?: string;
  fallback?: ParseYouTubeTitleFallback;
  includeAlbum?: boolean;
  timeoutProfile?: "default" | "route";
}

const ParsedTitleSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable().optional(),
});

const AI_TITLE_PARSE_TIMEOUTS_MS = {
  default: 8000,
  route: 3000,
} as const;

export function sanitizeInput(str: string): string {
  if (!str) return str;
  // eslint-disable-next-line no-misleading-character-class -- intentionally matching zero-width and invisible Unicode characters
  return str.replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B\u180C\u180D\u180E\u2000-\u200F\u202A-\u202E\u2061-\u2064\u206A-\u206F]/g, "").trim();
}

function stripParentheticalSegments(str: string): string {
  if (!str) return str;
  let s = str;
  const bracketPatterns = [
    /\s*\([^)]*\)\s*/g,
    /\s*（[^）]*）\s*/g,
    /\s*【[^】]*】\s*/g,
    /\s*「[^」]*」\s*/g,
    /\s*『[^』]*』\s*/g,
  ];
  for (const re of bracketPatterns) {
    s = s.replace(re, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

function cleanTitleMarkers(rawTitle: string): string {
  return sanitizeInput(rawTitle)
    .replace(/\s*[[(【「『]?\s*(official\s*)?(music\s*)?(video|mv|m\/v|audio|lyric|lyrics|visualizer|live)\s*[\])】」』]?\s*/gi, " ")
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, "")
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, "")
    .replace(/\s*Official\s*(Music\s*)?Video/gi, "")
    .replace(/\s*\(Official\s*Audio\)/gi, "")
    .replace(/\s*\[Official\s*Audio\]/gi, "")
    .replace(/\s*\(Lyric\s*Video\)/gi, "")
    .replace(/\s*\[Lyric\s*Video\]/gi, "")
    .replace(/\s*\(Lyrics\)/gi, "")
    .replace(/\s*\[Lyrics\]/gi, "")
    .replace(/\s*\(Audio\)/gi, "")
    .replace(/\s*\[Audio\]/gi, "")
    .replace(/\s*\(MV\)/gi, "")
    .replace(/\s*\[MV\]/gi, "")
    .replace(/\s*MV$/gi, "")
    .replace(/\s*M\/V$/gi, "")
    .replace(/\s*【[^】]*】\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanChannelArtist(channelName: string): string {
  return channelName
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

export function parseYouTubeTitleSimple(
  rawTitle: string,
  channelName?: string
): ParsedYouTubeTitle & { artist: string } {
  if (!rawTitle) {
    return { title: "", artist: "" };
  }

  let cleaned = cleanTitleMarkers(rawTitle);

  const quotedMatch = cleaned.match(/^(.+?)\s*[「'"]([^」'"]+)[」'"]/);
  if (quotedMatch) {
    return {
      title: quotedMatch[2].trim(),
      artist: stripParentheticalSegments(quotedMatch[1]).trim(),
    };
  }

  cleaned = stripParentheticalSegments(cleaned);

  const delimiterMatch = cleaned.match(/^(.+?)\s*[-–—|]\s*(.+)$/);
  if (delimiterMatch) {
    return {
      title: delimiterMatch[2].trim(),
      artist: delimiterMatch[1].trim(),
    };
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };
  }

  let artist = "";
  if (channelName) {
    const genericPatterns =
      /vevo|topic|official|music|records|entertainment|labels/i;
    if (!genericPatterns.test(channelName)) {
      artist = cleanChannelArtist(channelName);
    }
  }

  return { title: cleaned, artist };
}

export function isValidParsedResult(
  result: { title?: string | null; artist?: string | null },
  rawTitle: string
): boolean {
  const title = result.title || "";
  const artist = result.artist || "";
  const jsonPattern = /[{}":].*[{}":]|"artist"|"title"/i;
  if (jsonPattern.test(title) || jsonPattern.test(artist)) {
    return false;
  }
  if (title.length > rawTitle.length * 2) {
    return false;
  }
  return true;
}

function rawFallback(rawTitle: string): ParsedYouTubeTitle {
  return { title: rawTitle };
}

function regexFallback(
  rawTitle: string,
  channelName?: string
): ParsedYouTubeTitle {
  return parseYouTubeTitleSimple(rawTitle, channelName);
}

function fallbackTitle(
  fallback: ParseYouTubeTitleFallback,
  rawTitle: string,
  channelName?: string
): ParsedYouTubeTitle {
  return fallback === "raw"
    ? rawFallback(rawTitle)
    : regexFallback(rawTitle, channelName);
}

function normalizeOptions(
  options?: string | ParseYouTubeTitleOptions
): ParseYouTubeTitleOptions {
  if (typeof options === "string") {
    return { requestId: options, fallback: "regex" };
  }
  return { fallback: "regex", ...(options || {}) };
}

export async function parseYouTubeTitleWithAI(
  rawTitle: string,
  channelName?: string,
  options?: string | ParseYouTubeTitleOptions
): Promise<ParsedYouTubeTitle> {
  const opts = normalizeOptions(options);
  const fallback = opts.fallback ?? "regex";
  const cleanTitle = sanitizeInput(rawTitle);
  const cleanChannel = channelName ? sanitizeInput(channelName) : undefined;

  if (!cleanTitle) {
    return fallbackTitle(fallback, rawTitle, channelName);
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    AI_TITLE_PARSE_TIMEOUTS_MS[opts.timeoutProfile ?? "default"]
  );

  try {
    const { output: parsedData } = await generateText({
      model: google("gemini-3-flash-preview"),
      output: Output.object({
        schema: ParsedTitleSchema,
        name: "parsed_youtube_title",
      }),
      instructions: `You are an expert music metadata parser. Given a raw YouTube video title and optionally the channel name, extract the song title and artist. If possible, also extract the album name.

Rules:
- Return ONLY the clean song title, artist name, and optional album name as simple strings.
- Prefer original language names over translated or romanized names.
- Remove video markers like "Official MV", "Lyric Video", "[MV]", "(Audio)", etc.
- The artist is usually before a delimiter (-, –, —, |), inside a quoted-title pattern, or in the channel name.
- Channel names ending in "VEVO", "- Topic", or containing "Official" often indicate the artist.
- If you cannot determine a field, return null.

Examples:
- title="Jay Chou - Sunny Day (周杰倫 - 晴天)", channel="Jay Chou" -> {"title":"晴天","artist":"周杰倫","album":null}
- title="NewJeans (뉴진스) 'How Sweet' Official MV", channel="HYBE LABELS" -> {"title":"How Sweet","artist":"뉴진스","album":null}
- title="Lofi Hip Hop Radio - Beats to Relax/Study to", channel="ChillHop Music" -> {"title":"Lofi Hip Hop Radio - Beats to Relax/Study to","artist":null,"album":null}`,
      messages: [
        {
          role: "user",
          content: `Title: ${cleanTitle}${cleanChannel ? `\nChannel: ${cleanChannel}` : ""}`,
        },
      ],
      temperature: 0.1,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!parsedData) {
      return fallbackTitle(fallback, rawTitle, channelName);
    }

    const result: ParsedYouTubeTitle = {
      title: parsedData.title ?? cleanTitle,
      artist: parsedData.artist ?? undefined,
      album: opts.includeAlbum ? parsedData.album ?? undefined : undefined,
    };

    if (!isValidParsedResult(result, cleanTitle)) {
      return fallbackTitle(fallback, rawTitle, channelName);
    }

    return result;
  } catch {
    clearTimeout(timeoutId);
    return fallbackTitle(fallback, rawTitle, channelName);
  }
}
