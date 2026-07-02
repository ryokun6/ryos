import { detectLanguageFromLocale } from "@/lib/languageConfig";
import type {
  BooksChineseScript,
  BooksTextLayout,
} from "@/stores/useBooksStore";

/**
 * EPUB metadata / BCP-47 tag resolves to Chinese (Simplified or Traditional).
 * Unknown / missing language is not treated as Chinese.
 */
export function isChineseBookLanguage(language?: string | null): boolean {
  if (!language) return false;
  const resolved = detectLanguageFromLocale(language);
  return resolved === "zh-CN" || resolved === "zh-TW";
}

/**
 * EPUB metadata / BCP-47 tag resolves to any CJK language. Unknown / missing
 * language is not treated as CJK (vertical text stays off).
 */
export function isCjkBookLanguage(language?: string | null): boolean {
  if (!language) return false;
  const resolved = detectLanguageFromLocale(language);
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
