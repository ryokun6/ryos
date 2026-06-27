import { memo, useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  AUTO_TIMEZONE,
  buildTimezoneSearchText,
  formatOffsetLabel,
  formatTimezoneCityLocalized,
  formatTimezoneRegionLocalized,
  getSupportedTimezones,
  getTimezoneNameVariants,
  getTimezoneOffsetMinutes,
  resolveEffectiveTimezone,
  type TimezonePreference,
} from "@/lib/timezoneConfig";

export type TimezoneComboboxProps = {
  value: TimezonePreference;
  onChange: (value: TimezonePreference) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  className?: string;
};

function TimezoneComboboxImpl({
  value,
  onChange,
  t,
  locale,
  className,
}: TimezoneComboboxProps) {
  // Computing offsets / abbreviations for every zone is non-trivial; once per mount.
  const autoCity = useMemo(
    () =>
      formatTimezoneCityLocalized(
        resolveEffectiveTimezone(AUTO_TIMEZONE),
        locale
      ),
    [locale]
  );

  const options = useMemo<ComboboxOption[]>(() => {
    const now = new Date();
    const automaticLabel = t("apps.control-panels.timezoneAutomatic");
    const zones: ComboboxOption[] = [
      {
        value: AUTO_TIMEZONE,
        label: automaticLabel,
        description: autoCity,
        searchText: `${automaticLabel} auto automatic ${autoCity}`.toLowerCase(),
      },
    ];
    for (const id of getSupportedTimezones()) {
      const slash = id.indexOf("/");
      const region = slash === -1 ? "" : id.slice(0, slash);
      const city = formatTimezoneCityLocalized(id, locale, now);
      const offsetLabel = formatOffsetLabel(getTimezoneOffsetMinutes(id, now));
      const abbrevs = getTimezoneNameVariants(id, now, "en-US")
        .filter((n) => /^[A-Za-z]{2,5}$/.test(n))
        .slice(0, 3);
      const abbrevSuffix = abbrevs.length > 0 ? ` · ${abbrevs.join("/")}` : "";
      const description = region
        ? `${formatTimezoneRegionLocalized(region, t)} · ${offsetLabel}${abbrevSuffix}`
        : `${offsetLabel}${abbrevSuffix}`;
      zones.push({
        value: id,
        label: city,
        description,
        searchText: buildTimezoneSearchText(id, now, locale),
      });
    }
    return zones;
  }, [t, autoCity, locale]);

  const displayValue = useMemo(() => {
    if (value === AUTO_TIMEZONE) {
      return t("apps.control-panels.timezoneAutomaticCity", { city: autoCity });
    }
    const city = formatTimezoneCityLocalized(value, locale);
    const offset = formatOffsetLabel(getTimezoneOffsetMinutes(value));
    return `${city} (${offset})`;
  }, [value, t, autoCity, locale]);

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      displayValue={displayValue}
      searchPlaceholder={t("apps.control-panels.timezoneSearchPlaceholder")}
      searchAriaLabel={t("apps.control-panels.timeZone")}
      emptyMessage={t("apps.control-panels.timezoneNoResults")}
      className={className ?? "w-[180px] flex-shrink-0"}
    />
  );
}

export const TimezoneCombobox = memo(TimezoneComboboxImpl);
