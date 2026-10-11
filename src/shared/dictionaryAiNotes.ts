import type {
  DictionaryAiExtras,
  DictionaryExample,
  DictionaryLanguage,
} from "./dictionary";
import { parseInlineFurigana } from "../utils/furigana";

/**
 * Headers passed to the AI SDK UI message stream. The SDK also sets
 * `Content-Type: text/event-stream`, `Connection: keep-alive`, and
 * `X-Accel-Buffering: no`. `no-transform` plus `Content-Encoding: identity`
 * stop Caddy, Coolify, and Cloudflare from compressing the stream and
 * holding it until the model finishes.
 */
export const DICTIONARY_AI_STREAM_HEADERS = {
  "Cache-Control": "no-cache, no-transform",
  "Content-Encoding": "identity",
  "X-Accel-Buffering": "no",
} as const;

type NoteSection = "usage" | "nuance" | "synonyms" | "examples";

const MARKER_SECTION: Record<string, NoteSection> = {
  NUANCE: "nuance",
  SYNONYMS: "synonyms",
  EXAMPLES: "examples",
};

function stripDanglingMarker(text: string): string {
  return text.replace(/<<<[^>\n]*$/u, "");
}

function sectionBlocks(notes: string): Record<NoteSection, { text: string; open: boolean }> {
  const blocks: Record<NoteSection, { text: string; open: boolean }> = {
    usage: { text: "", open: true },
    nuance: { text: "", open: false },
    synonyms: { text: "", open: false },
    examples: { text: "", open: false },
  };
  const hits: { index: number; length: number; section: NoteSection }[] = [];
  for (const match of notes.matchAll(/<<<\s*(NUANCE|SYNONYMS|EXAMPLES)\s*>>>/g)) {
    const name = match[1];
    if (!name) continue;
    const section = MARKER_SECTION[name];
    if (!section || match.index === undefined) continue;
    hits.push({ index: match.index, length: match[0].length, section });
  }
  hits.sort((a, b) => a.index - b.index);

  let cursor = 0;
  let current: NoteSection = "usage";
  for (const hit of hits) {
    blocks[current] = { text: notes.slice(cursor, hit.index), open: false };
    current = hit.section;
    cursor = hit.index + hit.length;
  }
  blocks[current] = { text: notes.slice(cursor), open: true };
  return blocks;
}

function completeLines(block: string, open: boolean): string[] {
  const cleaned = stripDanglingMarker(block);
  const lines = cleaned.split("\n");
  if (open && lines.length > 0 && !cleaned.endsWith("\n")) {
    lines.pop();
  }
  return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}

function toExample(line: string, lang: DictionaryLanguage): DictionaryExample {
  const splitAt = line.indexOf("||");
  const rawText = (splitAt === -1 ? line : line.slice(0, splitAt)).trim();
  const rawTranslation = splitAt === -1 ? "" : line.slice(splitAt + 2).trim();
  const example: DictionaryExample = { text: rawText };
  if (lang === "ja") {
    const parsed = parseInlineFurigana(rawText);
    example.text = parsed.text;
    if (parsed.segments.some((segment) => segment.reading)) {
      example.furigana = parsed.segments;
    }
  }
  if (rawTranslation) example.translation = rawTranslation;
  return example;
}

/**
 * Turn a growing notes stream into the fields the dictionary already renders.
 * Usage and nuance keep their incomplete tail so prose appears token by token.
 * Synonym and example lines wait for a newline so chips don't resize each token.
 */
export function parseDictionaryAiNotes(
  notes: string,
  lang: DictionaryLanguage,
  options?: { complete?: boolean }
): DictionaryAiExtras {
  const blocks = sectionBlocks(notes);
  const complete = options?.complete === true;
  const usageNotes = stripDanglingMarker(blocks.usage.text).trim();
  const nuance = stripDanglingMarker(blocks.nuance.text).trim();
  const synonyms = completeLines(blocks.synonyms.text, blocks.synonyms.open && !complete)
    .map((line) => line.replace(/^[-*]\s+/u, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 10);
  const examples = completeLines(blocks.examples.text, blocks.examples.open && !complete)
    .map((line) => line.replace(/^[-*]\s+/u, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 5)
    .map((line) => toExample(line, lang))
    .filter((example) => example.text.length > 0);

  const extras: DictionaryAiExtras = { usageNotes, synonyms, examples };
  if (nuance) extras.nuance = nuance;
  return extras;
}

export function dictionaryAiNotesHaveContent(extras: DictionaryAiExtras): boolean {
  return Boolean(
    extras.usageNotes || extras.nuance || extras.synonyms.length || extras.examples.length
  );
}

function exampleToLine(example: DictionaryExample): string {
  const text = example.furigana?.length
    ? example.furigana
        .map((segment) => (segment.reading ? `${segment.text}(${segment.reading})` : segment.text))
        .join("")
    : example.text;
  return example.translation ? `${text} || ${example.translation}` : text;
}

/** Rebuild the streamed notes format from a legacy structured cache entry. */
export function extrasToDictionaryNotes(extras: DictionaryAiExtras): string {
  const parts: string[] = [];
  const usage = extras.usageNotes.trim();
  if (usage) parts.push(usage);
  const nuance = extras.nuance?.trim();
  if (nuance) parts.push(`<<<NUANCE>>>\n${nuance}`);
  if (extras.synonyms.length) {
    parts.push(`<<<SYNONYMS>>>\n${extras.synonyms.join("\n")}`);
  }
  if (extras.examples.length) {
    parts.push(`<<<EXAMPLES>>>\n${extras.examples.map(exampleToLine).join("\n")}`);
  }
  return parts.join("\n");
}

export interface DictionaryAiUiChunk {
  type?: string;
  delta?: string;
  errorText?: string;
}

export function reduceDictionaryAiUiChunk(
  notes: string,
  chunk: DictionaryAiUiChunk
): { notes: string; error?: string } {
  if (chunk.type === "error") {
    return { notes, error: chunk.errorText || "ai_unavailable" };
  }
  if (chunk.type === "text-delta" && typeof chunk.delta === "string" && chunk.delta.length > 0) {
    return { notes: notes + chunk.delta };
  }
  return { notes };
}

/** Split an SSE buffer into complete `data:` payloads, keeping a partial tail. */
export function takeDictionaryAiSseEvents(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: string[] = [];
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    events.push(data);
  }
  return { events, rest };
}
