import { create } from "zustand";
import { applyLanguage } from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  persistLanguageSelection,
  resolveInitialLanguage,
  type SupportedLanguage,
} from "@/lib/languageConfig";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";

export type LanguageCode = SupportedLanguage;

interface LanguageState {
  current: LanguageCode;
  setLanguage: (language: LanguageCode) => Promise<void>;
  hydrate: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  current: DEFAULT_LANGUAGE,
  setLanguage: async (language) => {
    const previousLanguage = useLanguageStore.getState().current;
    set({ current: language });
    persistLanguageSelection(language);
    await applyLanguage(language);
    if (previousLanguage !== language) {
      track(SETTINGS_ANALYTICS.LANGUAGE_CHANGE, {
        language,
        previousLanguage,
      });
    }
  },
  /** Sync store with persisted language (i18n is initialized in main bootstrap). */
  hydrate: () => {
    set({ current: resolveInitialLanguage() });
  },
}));

