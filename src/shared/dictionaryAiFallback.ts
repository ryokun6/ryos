import type {
  DictionaryEntry,
  DictionaryExample,
  DictionaryLanguage,
  DictionarySense,
} from "./dictionary";
import { parseInlineFurigana } from "../utils/furigana";

const MAX_SENSES = 6;
const MAX_EXAMPLES = 3;
const MAX_SYNONYMS = 10;

type SectionName = "entry" | "sense" | "example" | "synonyms" | "not_found";

const MARKER_NAME: Record<string, SectionName> = {
  ENTRY: "entry",
  SENSE: "sense",
  EXAMPLE: "example",
  SYNONYMS: "synonyms",
  NOT_FOUND: "not_found",
};

export interface DictionaryAiFallbackParse {
  status: "pending" | "not_found" | "entry";
  entry: DictionaryEntry | null;
  /** Sense whose gloss is still growing. Null once that gloss's marker has closed. */
  streamingSenseIndex: number | null;
}

function stripDanglingMarker(text: string): string {
  return text.replace(/<<<[^>\n]*$/u, "");
}

interface Section {
  name: SectionName;
  text: string;
  open: boolean;
}

function splitFallbackSections(text: string): Section[] {
  const hits: { index: number; length: number; name: SectionName }[] = [];
  for (const match of text.matchAll(/<<<\s*(ENTRY|SENSE|EXAMPLE|SYNONYMS|NOT_FOUND)\s*>>>/g)) {
    const raw = match[1];
    if (!raw || match.index === undefined) continue;
    const name = MARKER_NAME[raw];
    if (!name) continue;
    hits.push({ index: match.index, length: match[0].length, name });
  }
  const sections: Section[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const next = hits[i + 1];
    if (!hit) continue;
    const start = hit.index + hit.length;
    sections.push({
      name: hit.name,
      text: text.slice(start, next ? next.index : text.length),
      open: !next,
    });
  }
  return sections;
}

function entryFields(
  block: string,
  open: boolean,
  complete: boolean
): { headword: string; reading: string } {
  const raw = stripDanglingMarker(block).replace(/^\n+/u, "");
  const newline = raw.indexOf("\n");
  if (newline === -1) return { headword: raw.trim(), reading: "" };
  const headword = raw.slice(0, newline).trim();
  const rest = raw.slice(newline + 1);
  const secondBreak = rest.indexOf("\n");
  // Hold the reading until its line (or the whole header) is finished so IPA,
  // furigana, and character cards don't reflow on every token.
  if (open && !complete && secondBreak === -1) return { headword, reading: "" };
  const reading = (secondBreak === -1 ? rest : rest.slice(0, secondBreak)).trim();
  return { headword, reading };
}

function senseFields(
  block: string,
  open: boolean,
  complete: boolean
): { pos: string; gloss: string } {
  const raw = stripDanglingMarker(block).replace(/^\n+/u, "");
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { pos: "", gloss: "" };
  const pos = raw.slice(0, pipe).trim();
  const gloss = raw.slice(pipe + 1).replace(/^[ \t]+/u, "");
  return { pos, gloss: !open || complete ? gloss.trim() : gloss };
}

function completeLines(block: string, dropPartial: boolean): string[] {
  const cleaned = stripDanglingMarker(block);
  const lines = cleaned.split("\n");
  if (dropPartial && lines.length > 0 && !cleaned.endsWith("\n")) lines.pop();
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

function exampleToLine(example: DictionaryExample): string {
  const text = example.furigana?.length
    ? example.furigana
        .map((segment) => (segment.reading ? `${segment.text}(${segment.reading})` : segment.text))
        .join("")
    : example.text;
  return example.translation ? `${text} || ${example.translation}` : text;
}

/**
 * Turn a growing fallback stream into the dictionary entry the app already renders.
 * The headword and the open gloss keep their incomplete tail. Reading, examples,
 * and synonyms wait for a finished line so those rows don't resize each token.
 */
export function parseDictionaryAiFallback(
  text: string,
  word: string,
  lang: DictionaryLanguage,
  options?: { complete?: boolean }
): DictionaryAiFallbackParse {
  const complete = options?.complete === true;
  const sections = splitFallbackSections(text);
  if (sections.length === 0) {
    return { status: "pending", entry: null, streamingSenseIndex: null };
  }

  let headword = "";
  let reading = "";
  const senses: DictionarySense[] = [];
  const synonyms: string[] = [];
  let streamingSenseIndex: number | null = null;
  let sawNotFound = false;

  for (const section of sections) {
    if (section.name === "not_found") {
      sawNotFound = true;
      continue;
    }
    if (section.name === "entry") {
      const fields = entryFields(section.text, section.open, complete);
      headword = fields.headword;
      reading = fields.reading;
      continue;
    }
    if (section.name === "sense") {
      if (senses.length >= MAX_SENSES) continue;
      const fields = senseFields(section.text, section.open, complete);
      if (!fields.gloss.trim()) continue;
      const sense: DictionarySense = { glosses: [fields.gloss] };
      if (fields.pos) sense.partOfSpeech = fields.pos;
      senses.push(sense);
      streamingSenseIndex = section.open && !complete ? senses.length - 1 : null;
      continue;
    }
    if (section.name === "example") {
      const sense = senses[senses.length - 1];
      if (!sense) continue;
      const examples = completeLines(section.text, section.open && !complete)
        .map((line) => line.replace(/^[-*]\s+/u, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_EXAMPLES)
        .map((line) => toExample(line, lang))
        .filter((example) => example.text.length > 0);
      if (examples.length) sense.examples = examples;
      continue;
    }
    if (section.name === "synonyms") {
      const lines = completeLines(section.text, section.open && !complete)
        .map((line) => line.replace(/^[-*]\s+/u, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_SYNONYMS);
      synonyms.push(...lines);
    }
  }

  if (!headword && senses.length === 0) {
    return {
      status: sawNotFound ? "not_found" : "pending",
      entry: null,
      streamingSenseIndex: null,
    };
  }

  const entry: DictionaryEntry = {
    id: `ai:${lang}:${word}`,
    lang,
    headword: headword || word,
    senses,
    source: "ai",
  };
  if (reading) {
    if (lang === "en") entry.ipa = reading;
    else if (lang === "zh" || lang === "ja") entry.reading = reading;
  }
  if (synonyms.length) entry.synonyms = synonyms.slice(0, MAX_SYNONYMS);
  return { status: "entry", entry, streamingSenseIndex };
}

/** Rebuild the streamed fallback format from a legacy structured cache entry. */
export function entryToDictionaryFallbackText(entry: DictionaryEntry): string {
  const reading = entry.lang === "en" ? (entry.ipa ?? "") : (entry.reading ?? "");
  const lines = ["<<<ENTRY>>>", entry.headword, reading];
  for (const sense of entry.senses) {
    lines.push("<<<SENSE>>>", `${sense.partOfSpeech ?? ""} | ${sense.glosses.join("\n")}`);
    for (const example of sense.examples ?? []) {
      lines.push("<<<EXAMPLE>>>", exampleToLine(example));
    }
  }
  if (entry.synonyms?.length) {
    lines.push("<<<SYNONYMS>>>", ...entry.synonyms);
  }
  return lines.join("\n");
}
