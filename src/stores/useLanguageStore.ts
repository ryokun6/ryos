import { create } from "zustand";
import {
  changeLanguage,
  autoDetectLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/lib/i18n";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

export type LanguageCode = SupportedLanguage;

interface LanguageState extends PersistedStoreMeta {
  current: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  hydrate: () => void;
}

const STORE_NAME = "ryos:language";
const STORE_VERSION = 1;

const applyLanguage = (language: LanguageCode) => {
  localStorage.setItem("ryos_language", language);
  localStorage.setItem("ryos_language_initialized", "true");
  changeLanguage(language);
};

export const useLanguageStore = create<LanguageState>()(
  createPersistedStore(
    (set) => ({
      current: "en",
      _updatedAt: Date.now(),
      setLanguage: (language) => {
        set({ current: language, _updatedAt: Date.now() });
        applyLanguage(language);
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

        set({ current: language, _updatedAt: Date.now() });
        changeLanguage(language);
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        current: state.current,
        _updatedAt: state._updatedAt,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("[LanguageStore] Rehydrate failed:", error);
          return;
        }
        if (state?.current) {
          applyLanguage(state.current);
        }
      },
    }
  )
);

