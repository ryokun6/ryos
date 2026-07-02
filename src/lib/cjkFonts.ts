import type { SupportedLanguage } from "./languageConfig";

const GOOGLE_CJK_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Noto+Serif+JP:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Nanum+Gothic:wght@700&display=swap";
const CHIRON_TC_STYLESHEET =
  "https://cdn.jsdelivr.net/npm/chiron-go-round-tc-webfont@1.0.11/css/vf.css";

const loadedStylesheets = new Set<string>();
const CJK_LANGUAGES = new Set<SupportedLanguage>([
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
]);

export function getCjkStylesheetsForLanguage(
  language: SupportedLanguage
): readonly string[] {
  if (!CJK_LANGUAGES.has(language)) {
    return [];
  }
  return language === "zh-TW"
    ? [GOOGLE_CJK_STYLESHEET, CHIRON_TC_STYLESHEET]
    : [GOOGLE_CJK_STYLESHEET];
}

function ensurePreconnect(origin: string): void {
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

export function ensureCjkFontsForLanguage(
  language: SupportedLanguage
): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const href of getCjkStylesheetsForLanguage(language)) {
    if (loadedStylesheets.has(href)) {
      continue;
    }
    loadedStylesheets.add(href);

    const url = new URL(href);
    ensurePreconnect(url.origin);
    if (url.hostname === "fonts.googleapis.com") {
      ensurePreconnect("https://fonts.gstatic.com");
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.media = "print";
    link.addEventListener(
      "load",
      () => {
        link.media = "all";
      },
      { once: true }
    );
    document.head.appendChild(link);
  }
}
