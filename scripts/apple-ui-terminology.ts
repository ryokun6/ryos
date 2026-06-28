/**
 * Canonical standalone UI labels extracted from Apple's macOS localization
 * glossaries for every ryOS locale.
 *
 * The English object keys are Apple's original base strings. Localized values
 * are the dominant exact-match translations in the downloaded Brazilian,
 * French, German, Italian, Japanese, Korean, Russian, Spanish, and Traditional
 * Chinese glossaries. Context-sensitive phrases stay outside this global map.
 *
 * The `pt` locale intentionally follows Apple's Brazilian Portuguese glossary.
 */

import { RAW_APPLE_UI_TERMINOLOGY } from "./apple-ui-terminology-data";

export const APPLE_STYLE_GUIDE_SOURCE = {
  edition: "June 2026",
  sha256:
    "76118d81e4ff9eb74b1217ff8b82bbd01f62d1ff0057a1802bec288d20a5bbfe",
} as const;

/**
 * High-confidence English source strings aligned with Apple glossaries and the
 * June 2026 Apple Style Guide. Non-English locales keep their existing
 * translations; these keys are enforced in unit tests only.
 */
export const ENGLISH_STYLE_EXPECTATIONS = {
  "apps.control-panels.masterVolume": "Main Volume",
  "apps.chats.tokenStatus.authenticated": "Signed In",
  "apps.finder.menu.goUp": "go up",
  "apps.ipod.menu.repeatAll": "repeat all",
  "apps.ipod.menu.repeatOne": "repeat one",
  "apps.videos.menu.repeatAll": "repeat all",
  "apps.videos.menu.repeatOne": "repeat one",
  "apps.karaoke.menu.repeatAll": "repeat all",
  "apps.karaoke.menu.repeatOne": "repeat one",
} as const satisfies Record<string, string>;

export const TRANSLATION_LOCALES = [
  "zh-TW",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
] as const;

export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

type LocalizedTerm = Record<TranslationLocale, string>;

export const APPLE_UI_TERMINOLOGY =
  RAW_APPLE_UI_TERMINOLOGY satisfies Record<string, LocalizedTerm>;

/**
 * The same English label can represent a different concept in a specific
 * surface. These overrides keep Apple's global term as the default while
 * preserving the contextually correct wording for the listed translation key.
 */
export const APPLE_UI_CONTEXTUAL_TERMINOLOGY = {
  "apps.admin.server.ok": {
    "zh-TW": "確定",
    ja: "OK",
    ko: "확인",
    fr: "OK",
    de: "OK",
    es: "OK",
    pt: "OK",
    it: "OK",
    ru: "ОК",
  },
  "apps.dashboard.calendar.showColors": {
    ja: "色を表示",
  },
  "apps.maps.poiCategory.museum": {
    ja: "博物館",
  },
  "apps.control-panels.accentColors.graphite": {
    ko: "그라파이트",
  },
  "apps.calculator.angle.deg": {
    ko: "도",
  },
  "apps.dashboard.weather.humidity": {
    de: "Luftfeuchtigkeit",
  },
  "apps.admin.auditLog.action": {
    "zh-TW": "操作",
    ko: "작업",
  },
  "debug.console": {
    fr: "Journaux",
  },
  "debug.tabs.logs": {
    fr: "Journaux",
  },
  "apps.admin.song.lyricsSource": {
    ru: "Текст песни",
  },
  "apps.ipod.menu.lyrics": {
    ru: "Текст песни",
  },
  "apps.control-panels.dynamicWallpapers.lyrics": {
    ru: "Текст песни",
  },
  "common.dialog.saveChanges": {
    ru: "Сохранить изменения",
  },
  "apps.textedit.dialogs.saveChanges": {
    ru: "Сохранить изменения",
  },
  "apps.maps.placeCard.directions": {
    ru: "Маршрут",
  },
  "apps.maps.help.directions.title": {
    ru: "Маршрут",
  },
  "common.dialog.cancel": {
    ru: "Отмена",
  },
  "apps.chats.dialogs.cancel": {
    ru: "Отмена",
  },
  "apps.karaoke.liveListen.cancel": {
    ru: "Отмена",
  },
  "apps.control-panels.deleteAccount.cancel": {
    ru: "Отмена",
  },
  "apps.calendar.event.cancel": {
    ru: "Отмена",
  },
  "apps.contacts.picturePicker.cancel": {
    ru: "Отмена",
  },
  "apps.calculator.speech.keys.memoryRecall": {
    pt: "recuperar memória",
  },
} as const satisfies Record<string, Partial<LocalizedTerm>>;

const APPLE_UI_CONTEXTUAL_ENGLISH = {
  "apps.admin.server.ok": "OK",
  "apps.dashboard.calendar.showColors": "Show Colors",
  "apps.maps.poiCategory.museum": "Museum",
  "apps.control-panels.accentColors.graphite": "Graphite",
  "apps.calculator.angle.deg": "Degrees",
  "apps.dashboard.weather.humidity": "Humidity",
  "apps.admin.auditLog.action": "Action",
  "debug.console": "Logs",
  "debug.tabs.logs": "Logs",
  "apps.admin.song.lyricsSource": "Lyrics",
  "apps.ipod.menu.lyrics": "Lyrics",
  "apps.control-panels.dynamicWallpapers.lyrics": "Lyrics",
  "common.dialog.saveChanges": "Save Changes",
  "apps.textedit.dialogs.saveChanges": "Save Changes",
  "apps.maps.placeCard.directions": "Directions",
  "apps.maps.help.directions.title": "Directions",
  "common.dialog.cancel": "Cancel",
  "apps.chats.dialogs.cancel": "Cancel",
  "apps.karaoke.liveListen.cancel": "Cancel",
  "apps.control-panels.deleteAccount.cancel": "Cancel",
  "apps.calendar.event.cancel": "Cancel",
  "apps.contacts.picturePicker.cancel": "Cancel",
  "apps.calculator.speech.keys.memoryRecall": "memory recall",
} as const satisfies Record<
  keyof typeof APPLE_UI_CONTEXTUAL_TERMINOLOGY,
  string
>;

const contextualTerminology: Record<string, Partial<LocalizedTerm>> =
  APPLE_UI_CONTEXTUAL_TERMINOLOGY;
const contextualEnglish: Record<string, string> = APPLE_UI_CONTEXTUAL_ENGLISH;

export type AppleUiTerm = keyof typeof APPLE_UI_TERMINOLOGY;

const ELLIPSIS_SUFFIX = /(?:\.\.\.|…)$/u;

function isAppleUiTerm(value: string): value is AppleUiTerm {
  return Object.hasOwn(APPLE_UI_TERMINOLOGY, value);
}

export function getExpectedAppleUiTerm(
  englishValue: string,
  locale: TranslationLocale,
  key: string
): string | null {
  const contextual = contextualTerminology[key]?.[locale];
  if (contextual !== undefined && contextualEnglish[key] === englishValue) {
    return contextual;
  }

  const source = englishValue.replace(ELLIPSIS_SUFFIX, "");

  if (
    !isAppleUiTerm(source) ||
    (englishValue !== source && !ELLIPSIS_SUFFIX.test(englishValue))
  ) {
    return null;
  }

  const translations = APPLE_UI_TERMINOLOGY[source];
  const suffix = ELLIPSIS_SUFFIX.test(englishValue) ? "…" : "";
  return `${translations[locale]}${suffix}`;
}

export function formatAppleTerminologyForPrompt(
  locale: TranslationLocale
): string {
  return Object.entries(APPLE_UI_TERMINOLOGY)
    .map(([english, translations]) => `${english} → ${translations[locale]}`)
    .join("\n");
}

export function formatAppleContextualTerminologyForPrompt(
  locale: TranslationLocale
): string {
  return Object.entries(contextualTerminology)
    .flatMap(([key, translations]) => {
      const translation = translations[locale];
      const english = contextualEnglish[key];
      return translation === undefined || english === undefined
        ? []
        : [`${key}: ${english} → ${translation}`];
    })
    .join("\n");
}
