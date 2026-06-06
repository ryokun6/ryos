import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WallpaperPicker } from "../WallpaperPicker";
import { ScreenSaverPicker } from "../ScreenSaverPicker";
import type { LanguageCode } from "@/stores/useLanguageStore";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { cn } from "@/lib/utils";
import {
  getAccentOptions,
  type AccentChrome,
  type AccentId,
} from "@/themes/accents";
import type { TabStyleConfig } from "@/utils/tabStyles";

/** Small color chip shown in the accent Select trigger + menu items. */
function AccentSwatch({
  chrome,
  color,
}: {
  chrome: AccentChrome;
  color: string;
}) {
  const isAqua = chrome === "aqua";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block flex-shrink-0 overflow-hidden",
        isAqua
          ? "h-4 w-4 rounded-[5px] border border-black/25 shadow-[0_1px_1px_rgba(0,0,0,0.2),inset_0_0_0_1px_rgba(255,255,255,0.45)]"
          : "h-3.5 w-3.5 rounded-none border border-black shadow-none"
      )}
      style={{ background: color }}
    >
      {isAqua && (
        <span className="absolute inset-x-[2px] top-[2px] h-[6px] rounded-[3px] bg-gradient-to-b from-white/85 to-white/15" />
      )}
    </span>
  );
}

export type AppearanceTabContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  currentTheme: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  supportsDarkMode: boolean;
  darkModePreference: "system" | "light" | "dark";
  setDarkMode: (mode: "system" | "light" | "dark") => void;
  supportsAccent: boolean;
  accent: AccentId;
  accentChrome: AccentChrome | null;
  setAccent: (accent: AccentId) => void;
  /** Live color sampled from the wallpaper, for the "wallpaper" accent swatch. */
  wallpaperAccentColor: string | null;
  currentLanguage: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  tabStyles: TabStyleConfig;
};

export function AppearanceTabContent({
  t,
  currentTheme,
  setTheme,
  supportsDarkMode,
  darkModePreference,
  setDarkMode,
  supportsAccent,
  accent,
  accentChrome,
  setAccent,
  wallpaperAccentColor,
  currentLanguage,
  setLanguage,
  tabStyles,
}: AppearanceTabContentProps) {
  return (
    <div className="space-y-4 h-full overflow-y-auto p-4 pt-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Label>{t("settings.language.title")}</Label>
          <Label className="text-[11px] text-neutral-600 font-geneva-12">
            {t("settings.language.description")}
          </Label>
        </div>
        <Select
          value={currentLanguage}
          onValueChange={(value) => setLanguage(value as LanguageCode)}
        >
          <SelectTrigger className="w-[120px] flex-shrink-0">
            <SelectValue>
              {t(`settings.language.${
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
              }`)}
            </SelectValue>
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
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Label>{t("apps.control-panels.theme")}</Label>
          <Label className="text-[11px] text-neutral-600 font-geneva-12">
            {t("apps.control-panels.themeDescription")}
          </Label>
        </div>
        <Select
          value={currentTheme}
          onValueChange={(value) => setTheme(value as OsThemeId)}
        >
          <SelectTrigger className="w-[120px] flex-shrink-0">
            <SelectValue placeholder={t("apps.control-panels.select")}>
              {themes[currentTheme]?.name || t("apps.control-panels.select")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(themes).map(([id, theme]) => (
              <SelectItem key={id} value={id}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {supportsDarkMode && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <Label>{t("apps.control-panels.darkMode")}</Label>
            <Label className="text-[11px] text-neutral-600 font-geneva-12">
              {t("apps.control-panels.darkModeDescription")}
            </Label>
          </div>
          <Select
            value={darkModePreference}
            onValueChange={(value) =>
              setDarkMode(value as "system" | "light" | "dark")
            }
          >
            <SelectTrigger className="w-[120px] flex-shrink-0">
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
        </div>
      )}

      {supportsAccent &&
        accentChrome &&
        (() => {
          const accentOptions = getAccentOptions(
            accentChrome,
            wallpaperAccentColor
          );
          const selectedSwatch =
            accentOptions.find((option) => option.id === accent)?.swatch ??
            accentOptions[0].swatch;
          return (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <Label>{t("apps.control-panels.accent")}</Label>
                <Label className="text-[11px] text-neutral-600 font-geneva-12">
                  {t("apps.control-panels.accentDescription")}
                </Label>
              </div>
              <Select
                value={accent}
                onValueChange={(value) => setAccent(value as AccentId)}
              >
                <SelectTrigger className="w-[120px] flex-shrink-0">
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
            </div>
          );
        })()}

      <ScreenSaverPicker />

      <div className="border-t my-4" style={tabStyles.separatorStyle} />

      <WallpaperPicker />
    </div>
  );
}
