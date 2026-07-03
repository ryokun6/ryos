import { detectLanguageFromLocale } from "@/lib/languageConfig";
import type {
  BooksChineseScript,
  BooksTextLayout,
} from "@/stores/useBooksStore";

/**
 * EPUB `dc:language` values in the wild are not always BCP-47: legacy books
 * use ISO 639-2 codes ("jpn", "kor", "zho", "chi", "cmn") or the bare country
 * code "jp". Map those primary subtags to BCP-47 so the language gates
 * (vertical text, Chinese script conversion) and locale-aware font stacks
 * recognize such books — otherwise e.g. a Japanese book tagged "jpn" never
 * gets the vertical layout option.
 */
const LEGACY_PRIMARY_SUBTAG_FIXES: Record<string, string> = {
  jpn: "ja",
  jp: "ja",
  kor: "ko",
  zho: "zh",
  chi: "zh",
  cmn: "zh",
};

/** Normalize a raw EPUB metadata language tag; null for missing/blank. */
export function normalizeBookLanguage(
  language?: string | null
): string | null {
  if (!language) return null;
  const trimmed = language.trim();
  if (!trimmed) return null;
  const subtags = trimmed.replaceAll("_", "-").split("-");
  const fixedPrimary = LEGACY_PRIMARY_SUBTAG_FIXES[subtags[0].toLowerCase()];
  if (!fixedPrimary) return trimmed;
  return [fixedPrimary, ...subtags.slice(1)].join("-");
}

/**
 * EPUB metadata / BCP-47 tag resolves to Chinese (Simplified or Traditional).
 * Unknown / missing language is not treated as Chinese.
 */
export function isChineseBookLanguage(language?: string | null): boolean {
  const normalized = normalizeBookLanguage(language);
  if (!normalized) return false;
  const resolved = detectLanguageFromLocale(normalized);
  return resolved === "zh-CN" || resolved === "zh-TW";
}

/**
 * EPUB metadata / BCP-47 tag resolves to any CJK language. Unknown / missing
 * language is not treated as CJK (vertical text stays off).
 */
export function isCjkBookLanguage(language?: string | null): boolean {
  const normalized = normalizeBookLanguage(language);
  if (!normalized) return false;
  const resolved = detectLanguageFromLocale(normalized);
  return (
    resolved === "zh-CN" ||
    resolved === "zh-TW" ||
    resolved === "ja" ||
    resolved === "ko"
  );
}

/**
 * Simplified/Traditional conversion is only meaningful for Chinese books.
 * Japanese, Korean, Latin, and unknown languages always keep the original text.
 */
export function resolveEffectiveChineseScript(
  script: BooksChineseScript,
  language?: string | null
): BooksChineseScript {
  if (script === "original") return "original";
  return isChineseBookLanguage(language) ? script : "original";
}

/**
 * Vertical writing mode is only allowed for CJK books. Other languages
 * (and unknown metadata) stay on the publisher / horizontal layout.
 */
export function resolveEffectiveTextLayout(
  layout: BooksTextLayout,
  language?: string | null
): BooksTextLayout {
  if (layout !== "vertical") return layout;
  return isCjkBookLanguage(language) ? "vertical" : "book";
}
