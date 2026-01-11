import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslation from "./locales/en/translation.json";
import zhTWTranslation from "./locales/zh-TW/translation.json";
import jaTranslation from "./locales/ja/translation.json";
import koTranslation from "./locales/ko/translation.json";
import frTranslation from "./locales/fr/translation.json";
import deTranslation from "./locales/de/translation.json";
import esTranslation from "./locales/es/translation.json";
import ptTranslation from "./locales/pt/translation.json";
import itTranslation from "./locales/it/translation.json";
import ruTranslation from "./locales/ru/translation.json";

const resources = {
  en: {
    translation: enTranslation,
  },
  "zh-TW": {
    translation: zhTWTranslation,
  },
  ja: {
    translation: jaTranslation,
  },
  ko: {
    translation: koTranslation,
  },
  fr: {
    translation: frTranslation,
  },
  de: {
    translation: deTranslation,
  },
  es: {
    translation: esTranslation,
  },
  pt: {
    translation: ptTranslation,
  },
  it: {
    translation: itTranslation,
  },
  ru: {
    translation: ruTranslation,
  },
};

export const SUPPORTED_LANGUAGES = ["en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Maps a browser locale to our supported languages with fuzzy matching.
 * Examples:
 * - zh, zh-Hans, zh-CN, zh-Hans-CN, zh-Hant, zh-Hant-TW -> zh-TW
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
export const detectLanguageFromLocale = (locale: string): SupportedLanguage | null => {
  const normalizedLocale = locale.toLowerCase();
  
  // Exact match first (case-insensitive)
  const exactMatch = SUPPORTED_LANGUAGES.find(
    lang => lang.toLowerCase() === normalizedLocale
  );
  if (exactMatch) return exactMatch;
  
  // Extract language code (first part before hyphen)
  const langCode = normalizedLocale.split("-")[0];
  
  // Special case: all Chinese variants map to zh-TW
  if (langCode === "zh") {
    return "zh-TW";
  }
  
  // Check if language code matches any supported language
  const langMatch = SUPPORTED_LANGUAGES.find(
    lang => lang.toLowerCase() === langCode || lang.toLowerCase().startsWith(langCode + "-")
  );
  if (langMatch) return langMatch;
  
  return null;
};

/**
 * Auto-detects the best matching language from browser settings.
 * Checks navigator.languages (array of preferred languages) for fuzzy matches.
 */
export const autoDetectLanguage = (): SupportedLanguage => {
  // Get browser's preferred languages
  const browserLanguages = navigator.languages || [navigator.language];
  
  for (const browserLang of browserLanguages) {
    const matched = detectLanguageFromLocale(browserLang);
    if (matched) {
      return matched;
    }
  }
  
  return "en"; // Default fallback
};

// Storage keys
const LANGUAGE_KEY = "ryos:language";
const LANGUAGE_INITIALIZED_KEY = "ryos:language-initialized";
const LEGACY_LANGUAGE_KEY = "ryos_language";
const LEGACY_LANGUAGE_INITIALIZED_KEY = "ryos_language_initialized";

// Get initial language from localStorage, or auto-detect on first initialization
const getInitialLanguage = (): string => {
  // Try new keys first, fall back to legacy
  let saved = localStorage.getItem(LANGUAGE_KEY);
  let isInitialized = localStorage.getItem(LANGUAGE_INITIALIZED_KEY);

  // Check legacy keys if new ones don't exist
  if (!saved) {
    const legacySaved = localStorage.getItem(LEGACY_LANGUAGE_KEY);
    if (legacySaved) {
      saved = legacySaved;
      // Migrate to new key
      localStorage.setItem(LANGUAGE_KEY, saved);
      localStorage.removeItem(LEGACY_LANGUAGE_KEY);
    }
  }
  if (!isInitialized) {
    const legacyInitialized = localStorage.getItem(LEGACY_LANGUAGE_INITIALIZED_KEY);
    if (legacyInitialized) {
      isInitialized = legacyInitialized;
      // Migrate to new key
      localStorage.setItem(LANGUAGE_INITIALIZED_KEY, isInitialized);
      localStorage.removeItem(LEGACY_LANGUAGE_INITIALIZED_KEY);
    }
  }
  
  // If user has previously set a language, use it
  if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
    return saved;
  }
  
  // If this is first initialization, auto-detect
  if (!isInitialized) {
    const detectedLanguage = autoDetectLanguage();
    // Store the detected language and mark as initialized
    localStorage.setItem(LANGUAGE_KEY, detectedLanguage);
    localStorage.setItem(LANGUAGE_INITIALIZED_KEY, "true");
    return detectedLanguage;
  }
  
  return "en";
};

const initialLanguage = getInitialLanguage();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: "en",
    defaultNS: "translation",
    ns: ["translation"],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "ryos_language",
      caches: ["localStorage"],
    },
  });

// Set initial HTML lang attribute for CSS :lang() selectors
document.documentElement.lang = initialLanguage;

// Sync i18n language when store changes
export const changeLanguage = (language: string) => {
  i18n.changeLanguage(language);
  // Update HTML lang attribute for CSS :lang() selectors
  document.documentElement.lang = language;
};

export default i18n;

