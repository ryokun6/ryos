import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslation from "./locales/en/translation.json";
import zhTWTranslation from "./locales/zh-TW/translation.json";
import jaTranslation from "./locales/ja/translation.json";
import koTranslation from "./locales/ko/translation.json";
import frTranslation from "./locales/fr/translation.json";
import deTranslation from "./locales/de/translation.json";

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
};

// Get initial language from localStorage or default to "en"
const getInitialLanguage = (): string => {
  const saved = localStorage.getItem("ryos_language");
  if (saved && ["en", "zh-TW", "ja", "ko", "fr", "de"].includes(saved)) {
    return saved;
  }
  return "en";
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
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

// Sync i18n language when store changes
export const changeLanguage = (language: string) => {
  i18n.changeLanguage(language);
};

export default i18n;

