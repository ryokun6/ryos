import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TRANSLATION_LANGUAGES } from "@/utils/lyricsTranslation";

export type TranslatedLyricsLanguage = {
  label: string;
  code: string | null;
  separator?: boolean;
};

/** Maps iPod/Karaoke translation language config through i18n labels. */
export function useTranslatedLyricsLanguages(): TranslatedLyricsLanguage[] {
  const { t } = useTranslation();
  return useMemo(
    () =>
      TRANSLATION_LANGUAGES.map((lang) => ({
        label: lang.labelKey ? t(lang.labelKey) : lang.label || "",
        code: lang.code,
        separator: lang.separator,
      })),
    [t],
  );
}
