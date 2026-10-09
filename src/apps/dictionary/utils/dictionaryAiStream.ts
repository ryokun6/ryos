import type { DictionaryAiExtras } from "@/shared/dictionary";

export interface DictionaryAiStreamMessage {
  extras?: DictionaryAiExtras;
  error?: string;
  done?: boolean;
}

/** Partials can omit arrays until the model finishes those fields. */
export function normalizeDictionaryAiExtras(extras: DictionaryAiExtras): DictionaryAiExtras {
  const normalized: DictionaryAiExtras = {
    usageNotes: typeof extras.usageNotes === "string" ? extras.usageNotes : "",
    synonyms: Array.isArray(extras.synonyms) ? extras.synonyms : [],
    examples: Array.isArray(extras.examples) ? extras.examples : [],
  };
  if (typeof extras.nuance === "string" && extras.nuance) normalized.nuance = extras.nuance;
  return normalized;
}

/** Split a growing NDJSON buffer into complete lines, keeping a partial tail. */
export function takeDictionaryAiStreamLines(buffer: string): {
  lines: string[];
  rest: string;
} {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim().length > 0), rest };
}

export function parseDictionaryAiStreamLine(line: string): DictionaryAiStreamMessage {
  const parsed = JSON.parse(line) as DictionaryAiStreamMessage;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid dictionary AI stream line");
  }
  return parsed;
}
