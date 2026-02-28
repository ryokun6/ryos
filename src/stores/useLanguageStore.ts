import { create } from "zustand";
import {
  applyLanguage,
  initializeI18n,
} from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  persistLanguageSelection,
  resolveInitialLanguage,
  type SupportedLanguage,
} from "@/lib/languageConfig";

export type LanguageCode = SupportedLanguage;

interface LanguageState {
  current: LanguageCode;
  setLanguage: (language: LanguageCode) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  current: DEFAULT_LANGUAGE,
  setLanguage: async (language) => {
    set({ current: language });
    persistLanguageSelection(language);
    await applyLanguage(language);
  },
  hydrate: async () => {
    const language = resolveInitialLanguage();
    set({ current: language });
    await initializeI18n();
    await applyLanguage(language);
  },
}));

