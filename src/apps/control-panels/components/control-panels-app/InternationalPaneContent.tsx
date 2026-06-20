import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LanguageCode } from "@/stores/useLanguageStore";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";

/** Fixed reference instant for locale format previews (classic 10.3 International). */
const SAMPLE_INSTANT = new Date(2006, 5, 20, 15, 30, 0);
const SAMPLE_NUMBER = 1234.56;

function getLocaleFormatSamples(locale: LanguageCode) {
  return {
    dateShort: new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
      SAMPLE_INSTANT
    ),
    dateLong: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
      SAMPLE_INSTANT
    ),
    time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
      SAMPLE_INSTANT
    ),
    number: new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(SAMPLE_NUMBER),
  };
}

export type InternationalPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  currentLanguage: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
};

export function InternationalPaneContent({
  t,
  currentLanguage,
  setLanguage,
}: InternationalPaneContentProps) {
  const formatSamples = useMemo(
    () => getLocaleFormatSamples(currentLanguage),
    [currentLanguage]
  );
  const languageLabel = t(`settings.language.${
    currentLanguage === "zh-TW"
      ? "chineseTraditional"
      : currentLanguage === "ja"
        ? "japanese"
        : currentLanguage === "ko"
          ? "korean"
          : currentLanguage === "es"
            ? "spanish"
            : currentLanguage === "fr"
              ? "french"
              : currentLanguage === "de"
                ? "german"
                : currentLanguage === "pt"
                  ? "portuguese"
                  : currentLanguage === "it"
                    ? "italian"
                    : currentLanguage === "ru"
                      ? "russian"
                      : "english"
  }`);

  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <ControlPanelsPrefFormRow
          label={t("settings.language.title")}
          description={t("settings.language.description")}
        >
          <Select
            value={currentLanguage}
            onValueChange={(value) => setLanguage(value as LanguageCode)}
          >
            <SelectTrigger className="w-[140px] flex-shrink-0">
              <SelectValue>{languageLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("settings.language.english")}</SelectItem>
              <SelectItem value="zh-TW">
                {t("settings.language.chineseTraditional")}
              </SelectItem>
              <SelectItem value="ja">{t("settings.language.japanese")}</SelectItem>
              <SelectItem value="ko">{t("settings.language.korean")}</SelectItem>
              <SelectItem value="es">{t("settings.language.spanish")}</SelectItem>
              <SelectItem value="fr">{t("settings.language.french")}</SelectItem>
              <SelectItem value="de">{t("settings.language.german")}</SelectItem>
              <SelectItem value="pt">{t("settings.language.portuguese")}</SelectItem>
              <SelectItem value="it">{t("settings.language.italian")}</SelectItem>
              <SelectItem value="ru">{t("settings.language.russian")}</SelectItem>
            </SelectContent>
          </Select>
        </ControlPanelsPrefFormRow>

        <div className="control-panels-pref-format-samples" aria-live="polite">
          <div className="control-panels-pref-format-sample-row">
            <span className="control-panels-pref-format-sample-label">
              {t("apps.control-panels.formatSamples.dates")}
            </span>
            <div className="control-panels-pref-format-sample-value">
              <div>{formatSamples.dateShort}</div>
              <div>{formatSamples.dateLong}</div>
            </div>
          </div>
          <div className="control-panels-pref-format-sample-row">
            <span className="control-panels-pref-format-sample-label">
              {t("apps.control-panels.formatSamples.times")}
            </span>
            <span className="control-panels-pref-format-sample-value">
              {formatSamples.time}
            </span>
          </div>
          <div className="control-panels-pref-format-sample-row">
            <span className="control-panels-pref-format-sample-label">
              {t("apps.control-panels.formatSamples.numbers")}
            </span>
            <span className="control-panels-pref-format-sample-value">
              {formatSamples.number}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
