import {
  AppId,
  getTranslatedAppName,
  getTranslatedFolderNameFromName,
} from "@/utils/i18n";
import i18n from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/languageConfig";

export interface FinderDisplayItem {
  name: string;
  isDirectory: boolean;
  path: string;
  appId?: string;
  aliasType?: "file" | "app";
  aliasTarget?: string;
}

const finderSortLocaleMap: Record<SupportedLanguage, string[]> = {
  en: ["en-US", "en"],
  "zh-TW": ["zh-Hant-TW", "zh-TW", "zh-Hant", "zh"],
  ja: ["ja-JP", "ja"],
  ko: ["ko-KR", "ko"],
  fr: ["fr-FR", "fr"],
  de: ["de-DE", "de"],
  es: ["es-ES", "es"],
  pt: ["pt-BR", "pt-PT", "pt"],
  it: ["it-IT", "it"],
  ru: ["ru-RU", "ru"],
};

const finderCollatorCache = new Map<string, Intl.Collator>();

function normalizeFinderSortValue(value: string): string {
  return value.normalize("NFKC").trim();
}

function resolveFinderSortLanguage(language?: string): SupportedLanguage {
  if (language && isSupportedLanguage(language)) {
    return language;
  }

  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  if (isSupportedLanguage(currentLanguage)) {
    return currentLanguage;
  }

  return DEFAULT_LANGUAGE;
}

function getFinderSortCollator(
  language?: string,
  sensitivity: Intl.CollatorOptions["sensitivity"] = "base"
): Intl.Collator {
  const resolvedLanguage = resolveFinderSortLanguage(language);
  const locales = finderSortLocaleMap[resolvedLanguage] ?? [resolvedLanguage];
  const cacheKey = `${locales.join("|")}::${sensitivity}`;
  const cached = finderCollatorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const collator = new Intl.Collator(locales, {
    usage: "sort",
    numeric: true,
    ignorePunctuation: true,
    sensitivity,
  });
  finderCollatorCache.set(cacheKey, collator);
  return collator;
}

export function compareFinderSortText(
  a: string,
  b: string,
  language?: string
): number {
  const normalizedA = normalizeFinderSortValue(a);
  const normalizedB = normalizeFinderSortValue(b);
  const baseResult = getFinderSortCollator(language, "base").compare(
    normalizedA,
    normalizedB
  );

  if (baseResult !== 0) {
    return baseResult;
  }

  return getFinderSortCollator(language, "variant").compare(
    normalizedA,
    normalizedB
  );
}

export function getFinderDisplayName(file: FinderDisplayItem): string {
  if (file.isDirectory) {
    return getTranslatedFolderNameFromName(file.name);
  }

  if (file.path.startsWith("/Applications/") && file.appId) {
    return getTranslatedAppName(file.appId as AppId);
  }

  if (file.path.startsWith("/Desktop/")) {
    if (file.aliasType === "app" && file.aliasTarget) {
      return getTranslatedAppName(file.aliasTarget as AppId);
    }

    if (file.appId) {
      return getTranslatedAppName(file.appId as AppId);
    }

    return file.name.replace(/\.[^/.]+$/, "");
  }

  if (
    file.path.startsWith("/Applets/") &&
    file.name.toLowerCase().endsWith(".app")
  ) {
    return file.name.slice(0, -4);
  }

  return file.name;
}

export function compareFinderItemsByDisplayName(
  a: FinderDisplayItem,
  b: FinderDisplayItem,
  language?: string
): number {
  const displayResult = compareFinderSortText(
    getFinderDisplayName(a),
    getFinderDisplayName(b),
    language
  );
  if (displayResult !== 0) {
    return displayResult;
  }

  const rawNameResult = compareFinderSortText(a.name, b.name, language);
  if (rawNameResult !== 0) {
    return rawNameResult;
  }

  return compareFinderSortText(a.path, b.path, "en");
}
