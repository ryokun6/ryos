import type { SupportedLanguage } from "@/lib/languageConfig";

/** One exercise's localized name and step-by-step instructions. */
export interface ExerciseCopy {
  name: string;
  instructions: string[];
}

/** Locale catalog keyed by free-exercise-db id. */
export type ExerciseCatalog = Record<string, ExerciseCopy>;

export interface ExerciseNameDisplay {
  /** Name shown as the title. English when the UI language is English. */
  primary: string;
  /** English name under a non-English title. Null when it would repeat the title. */
  secondary: string | null;
}

const CATALOG_URLS: Partial<Record<SupportedLanguage, string>> = {
  "zh-TW": new URL("../locales/zh-TW.json", import.meta.url).href,
  "zh-CN": new URL("../locales/zh-CN.json", import.meta.url).href,
  ja: new URL("../locales/ja.json", import.meta.url).href,
  ko: new URL("../locales/ko.json", import.meta.url).href,
  fr: new URL("../locales/fr.json", import.meta.url).href,
  de: new URL("../locales/de.json", import.meta.url).href,
  es: new URL("../locales/es.json", import.meta.url).href,
  pt: new URL("../locales/pt.json", import.meta.url).href,
  it: new URL("../locales/it.json", import.meta.url).href,
  ru: new URL("../locales/ru.json", import.meta.url).href,
};

const catalogCache = new Map<string, ExerciseCatalog>();
const catalogLoads = new Map<string, Promise<ExerciseCatalog | null>>();

export function exerciseNameDisplay(
  englishName: string,
  localizedName: string | null | undefined,
  locale: string
): ExerciseNameDisplay {
  const localized = localizedName?.trim();
  if (locale === "en" || !localized || localized === englishName) {
    return { primary: englishName, secondary: null };
  }
  return { primary: localized, secondary: englishName };
}

/** Labels searched for an exercise. English is always included. */
export function exerciseSearchLabels(
  englishName: string,
  localizedName?: string | null
): string[] {
  const localized = localizedName?.trim();
  if (!localized || localized === englishName) return [englishName];
  return [englishName, localized];
}

export function localizedInstructions(
  english: readonly string[],
  localized: readonly string[] | null | undefined,
  locale: string
): string[] {
  if (locale === "en" || !localized?.length) return [...english];
  return [...localized];
}

export function peekExerciseCatalog(locale: string): ExerciseCatalog | null {
  return catalogCache.get(locale) ?? null;
}

/** Load the non-English exercise catalog once per session. English uses the library text. */
export function loadExerciseCatalog(locale: string): Promise<ExerciseCatalog | null> {
  if (locale === "en" || !CATALOG_URLS[locale as SupportedLanguage]) {
    return Promise.resolve(null);
  }
  const cached = catalogCache.get(locale);
  if (cached) return Promise.resolve(cached);
  const pending = catalogLoads.get(locale);
  if (pending) return pending;

  const url = CATALOG_URLS[locale as SupportedLanguage]!;
  const load = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ExerciseCatalog;
      catalogCache.set(locale, data);
      return data;
    })
    .catch((error) => {
      console.error(`[ryOS] Failed to load fitness exercise catalog (${locale})`, error);
      return null;
    })
    .finally(() => {
      catalogLoads.delete(locale);
    });
  catalogLoads.set(locale, load);
  return load;
}
