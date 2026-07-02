import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslation from "./locales/en/translation.json";
import { ensureCjkFontsForLanguage } from "./cjkFonts";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  resolveInitialLanguage,
  type SupportedLanguage,
} from "./languageConfig";

type TranslationMessages = Record<string, unknown>;
type TranslationModule = { default: TranslationMessages };
type LocaleLoader = () => Promise<TranslationModule>;

const resources = {
  [DEFAULT_LANGUAGE]: {
    translation: enTranslation,
  },
};

const localeJsonPaths: Partial<Record<SupportedLanguage, string>> = {
  "zh-TW": "./locales/zh-TW/translation.json",
  "zh-CN": "./locales/zh-CN/translation.json",
  ja: "./locales/ja/translation.json",
  ko: "./locales/ko/translation.json",
  fr: "./locales/fr/translation.json",
  de: "./locales/de/translation.json",
  es: "./locales/es/translation.json",
  pt: "./locales/pt/translation.json",
  it: "./locales/it/translation.json",
  ru: "./locales/ru/translation.json",
};

const localeLoaders: Partial<Record<SupportedLanguage, LocaleLoader>> = {
  "zh-TW": () => import("./locales/zh-TW/translation.json"),
  "zh-CN": () => import("./locales/zh-CN/translation.json"),
  ja: () => import("./locales/ja/translation.json"),
  ko: () => import("./locales/ko/translation.json"),
  fr: () => import("./locales/fr/translation.json"),
  de: () => import("./locales/de/translation.json"),
  es: () => import("./locales/es/translation.json"),
  pt: () => import("./locales/pt/translation.json"),
  it: () => import("./locales/it/translation.json"),
  ru: () => import("./locales/ru/translation.json"),
};

const loadingLanguages = new Map<SupportedLanguage, Promise<void>>();

let initializePromise: Promise<void> | null = null;
let defaultInitPromise: Promise<void> | null = null;
let initialLanguagePromise: Promise<void> | null = null;
let hasBoundLanguageSync = false;
let latestApplyRequestId = 0;

const syncDocumentLanguage = (language: string): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = language;
};

const bindLanguageSync = (): void => {
  if (hasBoundLanguageSync) {
    return;
  }

  i18n.on("languageChanged", syncDocumentLanguage);
  hasBoundLanguageSync = true;
};

const getCurrentLanguage = (): SupportedLanguage => {
  const candidate = i18n.resolvedLanguage || i18n.language;
  return isSupportedLanguage(candidate) ? candidate : DEFAULT_LANGUAGE;
};

const setLanguageOnI18n = async (language: SupportedLanguage): Promise<void> => {
  if (getCurrentLanguage() === language) {
    syncDocumentLanguage(language);
    ensureCjkFontsForLanguage(language);
    return;
  }

  await i18n.changeLanguage(language);
  syncDocumentLanguage(language);
  ensureCjkFontsForLanguage(language);
};

const initializeDefaultI18n = async (): Promise<void> => {
  if (defaultInitPromise) {
    return defaultInitPromise;
  }

  defaultInitPromise = (async () => {
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources,
        lng: DEFAULT_LANGUAGE,
        fallbackLng: DEFAULT_LANGUAGE,
        defaultNS: "translation",
        ns: ["translation"],
        initImmediate: false,
        interpolation: {
          escapeValue: false, // React already escapes values
        },
      });
    }

    bindLanguageSync();
    syncDocumentLanguage(getCurrentLanguage());
  })();

  return defaultInitPromise;
};

const applyInitialLanguage = async (): Promise<void> => {
  if (initialLanguagePromise) {
    return initialLanguagePromise;
  }

  initialLanguagePromise = (async () => {
    const initialLanguage = resolveInitialLanguage();
    await ensureLanguageResources(initialLanguage);
    await setLanguageOnI18n(initialLanguage);
  })();

  return initialLanguagePromise;
};

export async function ensureLanguageResources(
  language: SupportedLanguage
): Promise<void> {
  if (language === DEFAULT_LANGUAGE) {
    return;
  }

  if (i18n.hasResourceBundle(language, "translation")) {
    return;
  }

  const existingLoad = loadingLanguages.get(language);
  if (existingLoad) {
    await existingLoad;
    return;
  }

  const loader = localeLoaders[language];
  if (!loader) {
    return;
  }

  const loadPromise = loader()
    .then((module) => {
      if (!i18n.hasResourceBundle(language, "translation")) {
        i18n.addResourceBundle(
          language,
          "translation",
          module.default,
          true,
          true
        );
      }
    })
    .finally(() => {
      loadingLanguages.delete(language);
    });

  loadingLanguages.set(language, loadPromise);
  await loadPromise;
}

export async function initializeI18n(): Promise<void> {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    await initializeDefaultI18n();
    await applyInitialLanguage();
  })();

  return initializePromise;
}

export async function initializeI18nForFirstPaint(): Promise<void> {
  await initializeDefaultI18n();
  void applyInitialLanguage().catch((error) => {
    console.error("[ryOS] Failed to apply initial language:", error);
  });
}

export async function applyLanguage(
  language: SupportedLanguage
): Promise<void> {
  await initializeI18n();

  const requestId = ++latestApplyRequestId;

  await ensureLanguageResources(language);

  if (requestId !== latestApplyRequestId) {
    return;
  }

  await setLanguageOnI18n(language);
}

const reloadTranslationBundle = (
  language: SupportedLanguage,
  messages: TranslationMessages
): void => {
  if (!i18n.isInitialized) {
    return;
  }

  if (i18n.hasResourceBundle(language, "translation")) {
    i18n.removeResourceBundle(language, "translation");
  }

  i18n.addResourceBundle(language, "translation", messages, true, true);
  loadingLanguages.delete(language);
  void i18n.changeLanguage(i18n.language);
};

if (import.meta.hot) {
  const hot = import.meta.hot;

  hot.accept("./locales/en/translation.json", (mod) => {
    const messages = mod?.default as TranslationMessages | undefined;
    if (messages) {
      reloadTranslationBundle(DEFAULT_LANGUAGE, messages);
    }
  });

  for (const [language, jsonPath] of Object.entries(localeJsonPaths) as Array<
    [SupportedLanguage, string]
  >) {
    hot.accept(jsonPath, (mod) => {
      const messages = mod?.default as TranslationMessages | undefined;
      if (messages) {
        reloadTranslationBundle(language, messages);
      }
    });
  }
}

export default i18n;

