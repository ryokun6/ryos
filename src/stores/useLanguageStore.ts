import { create } from "zustand";
import {
  changeLanguage,
  autoDetectLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/lib/i18n";

export type LanguageCode = SupportedLanguage;

// Storage keys
const LANGUAGE_KEY = "ryos:language";
const LANGUAGE_INITIALIZED_KEY = "ryos:language-initialized";
const LEGACY_LANGUAGE_KEY = "ryos_language";
const LEGACY_LANGUAGE_INITIALIZED_KEY = "ryos_language_initialized";

interface LanguageState {
  current: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  hydrate: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  current: "en",
  setLanguage: (language) => {
    set({ current: language });
    localStorage.setItem(LANGUAGE_KEY, language);
    // Mark as initialized when user manually sets language
    localStorage.setItem(LANGUAGE_INITIALIZED_KEY, "true");
    // Clean up legacy keys
    localStorage.removeItem(LEGACY_LANGUAGE_KEY);
    localStorage.removeItem(LEGACY_LANGUAGE_INITIALIZED_KEY);
    changeLanguage(language);
  },
  hydrate: () => {
    // Try new keys first, fall back to legacy
    let saved = localStorage.getItem(LANGUAGE_KEY) as LanguageCode | null;
    let isInitialized = localStorage.getItem(LANGUAGE_INITIALIZED_KEY);

    // Check legacy keys if new ones don't exist
    if (!saved) {
      const legacySaved = localStorage.getItem(LEGACY_LANGUAGE_KEY) as LanguageCode | null;
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

    let language: LanguageCode;

    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      // User has previously set or auto-detected a language
      language = saved;
    } else if (!isInitialized) {
      // First initialization: auto-detect from browser locale
      language = autoDetectLanguage();
      localStorage.setItem(LANGUAGE_KEY, language);
      localStorage.setItem(LANGUAGE_INITIALIZED_KEY, "true");
    } else {
      // Fallback to English
      language = "en";
    }

    set({ current: language });
    changeLanguage(language);
  },
}));

