import i18n from "@/lib/i18n";
import type {
  LanguageOption,
  LocationOption,
} from "@/stores/useInternetExplorerStore";

/**
 * Pure display-name lookups for the Internet Explorer language/location pickers.
 * Extracted from `useInternetExplorerLogic.ts`. Reads the `i18n` singleton at
 * call time (no React hooks), so behavior is identical to the inline versions.
 */

export const getLanguageDisplayName = (lang: LanguageOption): string => {
  const { t } = i18n;
  const languageMap: Record<LanguageOption, string> = {
    auto: t("apps.internet-explorer.autodetected"),
    english: t("apps.internet-explorer.english"),
    chinese: t("apps.internet-explorer.chineseTraditional"),
    japanese: t("apps.internet-explorer.japanese"),
    korean: t("apps.internet-explorer.korean"),
    french: t("apps.internet-explorer.french"),
    spanish: t("apps.internet-explorer.spanish"),
    portuguese: t("apps.internet-explorer.portuguese"),
    german: t("apps.internet-explorer.german"),
    welsh: t("apps.internet-explorer.welsh"),
    sanskrit: t("apps.internet-explorer.sanskrit"),
    latin: t("apps.internet-explorer.latin"),
    alien: t("apps.internet-explorer.alienLanguage"),
    ai_language: t("apps.internet-explorer.aiLanguage"),
    digital_being: t("apps.internet-explorer.digitalBeingLanguage"),
  };
  return languageMap[lang] || t("apps.internet-explorer.autodetected");
};

export const getLocationDisplayName = (loc: LocationOption): string => {
  const { t } = i18n;
  const locationMap: Record<LocationOption, string> = {
    auto: t("apps.internet-explorer.autodetected"),
    united_states: t("apps.internet-explorer.unitedStates"),
    china: t("apps.internet-explorer.china"),
    japan: t("apps.internet-explorer.japan"),
    korea: t("apps.internet-explorer.southKorea"),
    france: t("apps.internet-explorer.france"),
    spain: t("apps.internet-explorer.spain"),
    portugal: t("apps.internet-explorer.portugal"),
    germany: t("apps.internet-explorer.germany"),
    canada: t("apps.internet-explorer.canada"),
    uk: t("apps.internet-explorer.unitedKingdom"),
    india: t("apps.internet-explorer.india"),
    brazil: t("apps.internet-explorer.brazil"),
    australia: t("apps.internet-explorer.australia"),
    russia: t("apps.internet-explorer.russia"),
  };
  return locationMap[loc] || t("apps.internet-explorer.autodetected");
};
