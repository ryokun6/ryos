import { create } from "zustand";
import { changeLanguage } from "@/lib/i18n";

export type LanguageCode = "en" | "zh-TW" | "ja" | "ko" | "fr" | "de";

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
    changeLanguage(language);
  },
  hydrate: () => {
    const saved = localStorage.getItem("ryos_language") as LanguageCode | null;
    const language = saved || "en";
    set({ current: language });
    changeLanguage(language);
  },
}));

