import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { TimezonePreference } from "@/lib/timezoneConfig";
import {
  AUTO_TIMEZONE,
  formatOffsetLabel,
  formatTimezoneCity,
  getSupportedTimezones,
  getTimezoneOffsetMinutes,
  groupTimezonesByRegion,
  resolveEffectiveTimezone,
} from "@/lib/timezoneConfig";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import { InternationalGlobe } from "./InternationalGlobe";

/** Fixed reference instant for locale format previews (classic 10.3 International). */
const SAMPLE_INSTANT = new Date(2006, 5, 20, 15, 30, 0);
const SAMPLE_NUMBER = 1234.56;

function getLocaleFormatSamples(locale: LanguageCode, timeZone: string) {
  return {
    dateShort: new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeZone,
    }).format(SAMPLE_INSTANT),
    dateLong: new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone,
    }).format(SAMPLE_INSTANT),
    time: new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone,
    }).format(SAMPLE_INSTANT),
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
  timezone: TimezonePreference;
  setTimezone: (timezone: TimezonePreference) => void;
};

export function InternationalPaneContent({
  t,
  currentLanguage,
  setLanguage,
  timezone,
  setTimezone,
}: InternationalPaneContentProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const effectiveTimezone = useMemo(
    () => resolveEffectiveTimezone(timezone),
    [timezone]
  );

  const timezoneGroups = useMemo(
    () => groupTimezonesByRegion(getSupportedTimezones()),
    []
  );

  const offsetLabel = useMemo(
    () => formatOffsetLabel(getTimezoneOffsetMinutes(effectiveTimezone, now)),
    [effectiveTimezone, now]
  );

  const localTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(currentLanguage, {
        timeStyle: "medium",
        timeZone: effectiveTimezone,
      }).format(now);
    } catch {
      return now.toLocaleTimeString();
    }
  }, [currentLanguage, effectiveTimezone, now]);

  const localDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(currentLanguage, {
        dateStyle: "full",
        timeZone: effectiveTimezone,
      }).format(now);
    } catch {
      return now.toLocaleDateString();
    }
  }, [currentLanguage, effectiveTimezone, now]);

  const cityLabel = formatTimezoneCity(effectiveTimezone);

  const timezoneTriggerLabel =
    timezone === AUTO_TIMEZONE
      ? t("apps.control-panels.timezoneAutomaticCity", { city: cityLabel })
      : `${cityLabel} (${offsetLabel})`;

  const formatSamples = useMemo(
    () => getLocaleFormatSamples(currentLanguage, effectiveTimezone),
    [currentLanguage, effectiveTimezone]
  );
  const languageLabel = t(
    `settings.language.${
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
    }`
  );

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

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.timeZone")}
          description={t("apps.control-panels.timeZoneDescription")}
        >
          <Select
            value={timezone}
            onValueChange={(value) =>
              setTimezone(value as TimezonePreference)
            }
          >
            <SelectTrigger className="w-[180px] flex-shrink-0">
              <SelectValue>{timezoneTriggerLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value={AUTO_TIMEZONE}>
                {t("apps.control-panels.timezoneAutomatic")}
              </SelectItem>
              <SelectSeparator />
              {timezoneGroups.map((group) => (
                <SelectGroup key={group.region}>
                  <SelectLabel>{group.region}</SelectLabel>
                  {group.zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {formatTimezoneCity(zone)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </ControlPanelsPrefFormRow>

        <div
          className="flex items-center justify-center gap-4 py-2"
          aria-live="polite"
        >
          <InternationalGlobe timeZone={effectiveTimezone} size={132} />
          <div className="flex flex-col gap-0.5 font-geneva-12 min-w-[120px]">
            <div className="text-[13px] font-semibold leading-tight">
              {cityLabel}
            </div>
            <div className="text-[20px] font-semibold tabular-nums leading-tight">
              {localTime}
            </div>
            <div className="text-[11px] opacity-70 leading-tight">
              {localDate}
            </div>
            <div className="text-[11px] opacity-70 leading-tight">
              {offsetLabel}
            </div>
          </div>
        </div>

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
