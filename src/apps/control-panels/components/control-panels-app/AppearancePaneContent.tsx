import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OsThemeId } from "@/themes/types";
import {
  getAccentOptions,
  type AccentChrome,
  type AccentId,
} from "@/themes/accents";
import type { TabStyleConfig } from "@/utils/tabStyles";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import { AccentSwatch, buildThemeSelectOptions, getSelectedThemeSelectValue, getThemeSelectLabel, MACOSX_GLASS_THEME_VALUE } from "./appearancePaneShared";
import { AppearanceThemePreview } from "./AppearanceThemePreview";

export type AppearancePaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  currentTheme: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  aquaMaterial: "classic" | "glass";
  setAquaMaterial: (material: "classic" | "glass") => void;
  supportsDarkMode: boolean;
  darkModePreference: "system" | "light" | "dark";
  setDarkMode: (mode: "system" | "light" | "dark") => void;
  supportsAccent: boolean;
  accent: AccentId;
  accentChrome: AccentChrome | null;
  setAccent: (accent: AccentId) => void;
  wallpaperAccentColor: string | null;
  tabStyles: TabStyleConfig;
};

export function AppearancePaneContent({
  t,
  currentTheme,
  setTheme,
  aquaMaterial,
  setAquaMaterial,
  supportsDarkMode,
  darkModePreference,
  setDarkMode,
  supportsAccent,
  accent,
  accentChrome,
  setAccent,
  wallpaperAccentColor,
}: AppearancePaneContentProps) {
  const themeOptions = useMemo(() => buildThemeSelectOptions(t), [t]);
  const selectedThemeValue = getSelectedThemeSelectValue(currentTheme, aquaMaterial);
  const selectedThemeLabel = getThemeSelectLabel(
    t,
    currentTheme,
    aquaMaterial,
    themeOptions
  );
  const handleThemeChange = (value: string) => {
    if (value === MACOSX_GLASS_THEME_VALUE) {
      setTheme("macosx");
      setAquaMaterial("glass");
    } else {
      setTheme(value as OsThemeId);
      setAquaMaterial("classic");
    }
  };

  const accentOptions =
    supportsAccent && accentChrome
      ? getAccentOptions(accentChrome, wallpaperAccentColor)
      : [];
  const selectedSwatch =
    accentOptions.find((option) => option.id === accent)?.swatch ??
    accentOptions[0]?.swatch;

  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.theme")}
          description={t("apps.control-panels.themeDescription")}
        >
          <Select value={selectedThemeValue} onValueChange={handleThemeChange}>
            <SelectTrigger className="w-[140px] flex-shrink-0">
              <SelectValue placeholder={t("apps.control-panels.select")}>
                {selectedThemeLabel || t("apps.control-panels.select")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {themeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlPanelsPrefFormRow>

        {supportsDarkMode && (
          <ControlPanelsPrefFormRow
            label={t("apps.control-panels.darkMode")}
            description={t("apps.control-panels.darkModeDescription")}
          >
            <Select
              value={darkModePreference}
              onValueChange={(value) =>
                setDarkMode(value as "system" | "light" | "dark")
              }
            >
              <SelectTrigger className="w-[140px] flex-shrink-0">
                <SelectValue placeholder={t("apps.control-panels.select")}>
                  {darkModePreference === "system"
                    ? t("apps.control-panels.darkModeSystem")
                    : darkModePreference === "dark"
                      ? t("apps.control-panels.darkModeDark")
                      : t("apps.control-panels.darkModeLight")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">
                  {t("apps.control-panels.darkModeSystem")}
                </SelectItem>
                <SelectItem value="light">
                  {t("apps.control-panels.darkModeLight")}
                </SelectItem>
                <SelectItem value="dark">
                  {t("apps.control-panels.darkModeDark")}
                </SelectItem>
              </SelectContent>
            </Select>
          </ControlPanelsPrefFormRow>
        )}

        {supportsAccent && accentChrome && selectedSwatch && (
          <ControlPanelsPrefFormRow
            label={t("apps.control-panels.accent")}
            description={t("apps.control-panels.accentDescription")}
          >
            <Select
              value={accent}
              onValueChange={(value) => setAccent(value as AccentId)}
            >
              <SelectTrigger className="w-[140px] flex-shrink-0">
                <SelectValue placeholder={t("apps.control-panels.select")}>
                  <span className="flex items-center gap-2 min-w-0">
                    <AccentSwatch chrome={accentChrome} color={selectedSwatch} />
                    <span className="truncate">
                      {t(`apps.control-panels.accentColors.${accent}`)}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      <AccentSwatch chrome={accentChrome} color={option.swatch} />
                      <span>
                        {t(`apps.control-panels.accentColors.${option.id}`)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ControlPanelsPrefFormRow>
        )}

        <AppearanceThemePreview
          t={t}
          currentTheme={currentTheme}
          aquaMaterial={aquaMaterial}
          darkModePreference={darkModePreference}
          accent={accent}
          accentChrome={accentChrome}
          wallpaperAccentColor={wallpaperAccentColor}
        />
      </div>
    </div>
  );
}
