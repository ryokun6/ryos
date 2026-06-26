import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { TimezonePreference } from "@/lib/timezoneConfig";
import {
  formatOffsetLabel,
  formatTimezoneCity,
  getTimezoneOffsetMinutes,
  resolveEffectiveTimezone,
} from "@/lib/timezoneConfig";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import { InternationalWorldMap } from "./InternationalWorldMap";
import { TimezoneCombobox } from "./TimezoneCombobox";
import { useControlPanelsTabClasses } from "./useControlPanelsTabClasses";

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

type InternationalTab = "language" | "dateTime";

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
  const [tab, setTab] = useState<InternationalTab>("language");
  const { barClassName, triggerClassName, triggerStyle } =
    useControlPanelsTabClasses();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const effectiveTimezone = useMemo(
    () => resolveEffectiveTimezone(timezone),
    [timezone]
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
    <div className="control-panels-pref-form control-panels-pref-form-tabbed">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className={cn("control-panels-pref-tab-bar", barClassName)}
          aria-label={t("apps.control-panels.panes.international")}
        >
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={tab === "language" ? "active" : "inactive"}
            aria-selected={tab === "language"}
            onClick={() => setTab("language")}
          >
            {t("apps.control-panels.internationalTabs.language")}
          </button>
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={tab === "dateTime" ? "active" : "inactive"}
            aria-selected={tab === "dateTime"}
            onClick={() => setTab("dateTime")}
          >
            {t("apps.control-panels.internationalTabs.dateTime")}
          </button>
        </div>

        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={tab !== "language"}
            aria-hidden={tab !== "language"}
          >
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
                    <SelectItem value="en">
                      {t("settings.language.english")}
                    </SelectItem>
                    <SelectItem value="zh-TW">
                      {t("settings.language.chineseTraditional")}
                    </SelectItem>
                    <SelectItem value="ja">
                      {t("settings.language.japanese")}
                    </SelectItem>
                    <SelectItem value="ko">
                      {t("settings.language.korean")}
                    </SelectItem>
                    <SelectItem value="es">
                      {t("settings.language.spanish")}
                    </SelectItem>
                    <SelectItem value="fr">
                      {t("settings.language.french")}
                    </SelectItem>
                    <SelectItem value="de">
                      {t("settings.language.german")}
                    </SelectItem>
                    <SelectItem value="pt">
                      {t("settings.language.portuguese")}
                    </SelectItem>
                    <SelectItem value="it">
                      {t("settings.language.italian")}
                    </SelectItem>
                    <SelectItem value="ru">
                      {t("settings.language.russian")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </ControlPanelsPrefFormRow>

              <div
                className="control-panels-pref-format-samples"
                aria-live="polite"
              >
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

          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={tab !== "dateTime"}
            aria-hidden={tab !== "dateTime"}
          >
            <div className="control-panels-pref-form-section">
              <div
                className="overflow-hidden rounded-[6px] border border-black/30"
                aria-hidden
              >
                <InternationalWorldMap timeZone={effectiveTimezone} />
              </div>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.timeZone")}
                description={t("apps.control-panels.timeZoneDescription")}
              >
                <TimezoneCombobox
                  value={timezone}
                  onChange={setTimezone}
                  t={t}
                />
              </ControlPanelsPrefFormRow>

              <div
                className="flex items-baseline justify-between gap-3 font-geneva-12"
                aria-live="polite"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold leading-tight">
                    {cityLabel}
                  </span>
                  <span className="text-[11px] opacity-70 leading-tight">
                    {localDate}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[20px] font-semibold tabular-nums leading-tight">
                    {localTime}
                  </span>
                  <span className="text-[11px] opacity-70 leading-tight">
                    {offsetLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
