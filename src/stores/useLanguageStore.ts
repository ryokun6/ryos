import { create } from "zustand";
import {
  changeLanguage,
  autoDetectLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/lib/i18n";

export type LanguageCode = SupportedLanguage;

interface LanguageState {
  current: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  hydrate: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  current: "en",
  setLanguage: (language) => {
    set({ current: language });
    localStorage.setItem("ryos_language", language);
    // Mark as initialized when user manually sets language
    localStorage.setItem("ryos_language_initialized", "true");
    changeLanguage(language);
  },
  hydrate: () => {
    const saved = localStorage.getItem("ryos_language") as LanguageCode | null;
    const isInitialized = localStorage.getItem("ryos_language_initialized");

    let language: LanguageCode;

    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      // User has previously set or auto-detected a language
      language = saved;
    } else if (!isInitialized) {
      // First initialization: auto-detect from browser locale
      language = autoDetectLanguage();
      localStorage.setItem("ryos_language", language);
      localStorage.setItem("ryos_language_initialized", "true");
    } else {
      // Fallback to English
      language = "en";
    }

    set({ current: language });
    changeLanguage(language);
  },
}));

