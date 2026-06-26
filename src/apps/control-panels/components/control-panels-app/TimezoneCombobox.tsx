import { memo, useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  AUTO_TIMEZONE,
  formatOffsetLabel,
  formatTimezoneCity,
  getSupportedTimezones,
  getTimezoneOffsetMinutes,
  resolveEffectiveTimezone,
  type TimezonePreference,
} from "@/lib/timezoneConfig";

export type TimezoneComboboxProps = {
  value: TimezonePreference;
  onChange: (value: TimezonePreference) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  className?: string;
};

function TimezoneComboboxImpl({
  value,
  onChange,
  t,
  className,
}: TimezoneComboboxProps) {
  // Computing offsets for every zone is non-trivial; do it once per mount.
  const autoCity = useMemo(
    () => formatTimezoneCity(resolveEffectiveTimezone(AUTO_TIMEZONE)),
    []
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
      const region = slash === -1 ? "" : id.slice(0, slash).replace(/_/g, " ");
      const city = formatTimezoneCity(id);
      const offsetLabel = formatOffsetLabel(getTimezoneOffsetMinutes(id, now));
      const description = region ? `${region} · ${offsetLabel}` : offsetLabel;
      zones.push({
        value: id,
        label: city,
        description,
        searchText: `${id} ${city} ${region} ${offsetLabel}`.toLowerCase(),
      });
    }
    return zones;
  }, [t, autoCity]);

  const displayValue = useMemo(() => {
    if (value === AUTO_TIMEZONE) {
      return t("apps.control-panels.timezoneAutomaticCity", { city: autoCity });
    }
    const city = formatTimezoneCity(value);
    const offset = formatOffsetLabel(getTimezoneOffsetMinutes(value));
    return `${city} (${offset})`;
  }, [value, t, autoCity]);

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
