export const SUPPORTED_LANGUAGES = [
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

// Storage keys
const LANGUAGE_KEY = "ryos:language";
const LANGUAGE_INITIALIZED_KEY = "ryos:language-initialized";

export const isSupportedLanguage = (
  language: string | null | undefined
): language is SupportedLanguage =>
  !!language && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);

/**
 * Maps a browser locale to our supported languages with fuzzy matching.
 * Examples:
 * - zh, zh-Hans, zh-CN, zh-SG -> zh-CN
 * - zh-Hant, zh-TW, zh-HK, zh-MO -> zh-TW
 * - ja, ja-JP -> ja
 * - ko, ko-KR -> ko
 * - fr, fr-FR, fr-CA -> fr
 * - de, de-DE, de-AT, de-CH -> de
 * - es, es-ES, es-MX, es-AR -> es
 * - pt, pt-BR, pt-PT -> pt
 * - it, it-IT -> it
 * - ru, ru-RU -> ru
 * - en, en-US, en-GB -> en
 */
export const detectLanguageFromLocale = (
  locale: string
): SupportedLanguage | null => {
  const normalizedLocale = locale.replaceAll("_", "-").toLowerCase();

  // Exact match first (case-insensitive)
  const exactMatch = SUPPORTED_LANGUAGES.find(
    (lang) => lang.toLowerCase() === normalizedLocale
  );
  if (exactMatch) return exactMatch;

  const subtags = normalizedLocale.split("-");
  const langCode = subtags[0];

  // Resolve Chinese script and region variants before fuzzy language matching.
  if (langCode === "zh") {
    if (
      subtags.includes("hant") ||
      subtags.some((subtag) => ["tw", "hk", "mo"].includes(subtag))
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  // Check if language code matches any supported language
  const langMatch = SUPPORTED_LANGUAGES.find(
    (lang) =>
      lang.toLowerCase() === langCode ||
      lang.toLowerCase().startsWith(`${langCode}-`)
  );
  if (langMatch) return langMatch;

  return null;
};

/**
 * Auto-detects the best matching language from browser settings.
 * Checks navigator.languages (array of preferred languages) for fuzzy matches.
 */
export const autoDetectLanguage = (): SupportedLanguage => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const browserLanguages =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const browserLang of browserLanguages) {
    const matched = detectLanguageFromLocale(browserLang);
    if (matched) {
      return matched;
    }
  }

  return DEFAULT_LANGUAGE;
};

type PersistedLanguageState = {
  saved: SupportedLanguage | null;
  isInitialized: boolean;
};

const readStorageValue = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (key: string, value: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
};

const readPersistedLanguageState = (): PersistedLanguageState => {
  const savedRaw = readStorageValue(LANGUAGE_KEY);
  const initializedRaw = readStorageValue(LANGUAGE_INITIALIZED_KEY);

  return {
    saved: isSupportedLanguage(savedRaw) ? savedRaw : null,
    isInitialized: initializedRaw === "true",
  };
};

export const persistLanguageSelection = (language: SupportedLanguage): void => {
  writeStorageValue(LANGUAGE_KEY, language);
  writeStorageValue(LANGUAGE_INITIALIZED_KEY, "true");
};

/**
 * Resolve the user's current preferred language and persist any first-run
 * auto-detection so later boots stay stable.
 */
export const resolveInitialLanguage = (): SupportedLanguage => {
  const { saved, isInitialized } = readPersistedLanguageState();

  if (saved) {
    return saved;
  }

  if (!isInitialized) {
    const detectedLanguage = autoDetectLanguage();
    persistLanguageSelection(detectedLanguage);
    return detectedLanguage;
  }

  return DEFAULT_LANGUAGE;
};
