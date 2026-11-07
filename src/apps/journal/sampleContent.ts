import type { JournalDoc, JournalDocNode } from "./types";
import { JOURNAL_ENTRY_DAYS, JOURNAL_ENTRY_FRAGMENTS } from "./journalEntries";

export type JournalCopy = {
  "zh-TW": string;
  "zh-CN": string;
  en: string;
};

export interface JournalFragment {
  id: string;
  dayId: string;
  kind: "text" | "photo";
  text: JournalCopy | null;
  photo: string | null;
  x: number;
  y: number;
  w: number;
  rotate: number;
}

export interface JournalDay {
  id: string;
  mood: number;
  title: JournalCopy;
}

export const JOURNAL_DAYS: readonly JournalDay[] = JOURNAL_ENTRY_DAYS;

export const JOURNAL_FRAGMENTS: readonly JournalFragment[] = JOURNAL_ENTRY_FRAGMENTS;

export const DEFAULT_DAY_ID = JOURNAL_DAYS[JOURNAL_DAYS.length - 1].id;

export function journalLocale(language: string | undefined): keyof JournalCopy {
  const value = (language ?? "en").toLowerCase();
  if (
    value === "zh-tw" ||
    value.includes("hant") ||
    value.endsWith("-tw") ||
    value.endsWith("-hk") ||
    value.endsWith("-mo")
  ) {
    return "zh-TW";
  }
  if (value.startsWith("zh")) return "zh-CN";
  return "en";
}

export function journalText(
  text: JournalCopy,
  language: string | undefined
): string {
  return text[journalLocale(language)];
}

export function sampleJournalTitle(dayId: string, language: string | undefined): string {
  const day = JOURNAL_DAYS.find((item) => item.id === dayId);
  return day ? journalText(day.title, language) : "";
}

export function fragmentsForDay(dayId: string): JournalFragment[] {
  return JOURNAL_FRAGMENTS.filter((fragment) => fragment.dayId === dayId);
}

export function sampleDoc(text: string): JournalDoc {
  const blocks = text.length > 0 ? text.split(/\n{2,}/) : [""];
  return {
    type: "doc",
    content: blocks.map((block) => {
      const content: JournalDocNode[] = [];
      const lines = block.split("\n");
      lines.forEach((line, index) => {
        if (index > 0) content.push({ type: "hardBreak" });
        if (line.length > 0) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    }),
  };
}

export function formatJournalDay(dayId: string, language: string | undefined): string {
  const locale = journalLocale(language);
  return new Intl.DateTimeFormat(locale === "en" ? "en" : locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayId}T12:00:00Z`));
}
