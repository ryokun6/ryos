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
          ? "h-4 w-4 rounded-full border-0"
          : "h-3.5 w-3.5 rounded-none border border-black shadow-none"
      )}
      style={{
        background: color,
        ...(isAqua
          ? {
              boxShadow:
                "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(255,255,255,0.22)",
            }
          : {}),
      }}
    >
      {isAqua && (
        <>
          <span
            className="pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2"
            style={{
              top: "2px",
              height: "26%",
              width: "calc(100% - 7.5px)",
              borderRadius: "9999px 9999px 3px 3px",
              background:
                "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.3))",
              filter: "blur(0.2px)",
            }}
          />
          <span
            className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2"
            style={{
              bottom: "1px",
              height: "38%",
              width: "calc(100% - 4px)",
              borderRadius: "4px 4px 9999px 9999px",
              background:
                "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
              filter: "blur(0.3px)",
            }}
          />
        </>
      )}
    </span>
  );
}

export type AppearanceTabContentProps = {
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
  currentLanguage,
  setLanguage,
  tabStyles,
}: AppearanceTabContentProps) {
  // "Aqua Glass" is a surface material variant of the macosx (Aqua) chrome, not
  // a separate OsThemeId. Surface it as its own picker entry using a synthetic
  // value so it sits right below classic "Aqua".
  const GLASS_VALUE = "macosx:glass";
  const themeOptions: { value: string; label: string }[] = [];
  for (const [id, theme] of Object.entries(themes)) {
    themeOptions.push({ value: id, label: theme.name });
    if (id === "macosx") {
      themeOptions.push({ value: GLASS_VALUE, label: `${theme.name} Glass` });
    }
  }
  const selectedThemeValue =
    currentTheme === "macosx" && aquaMaterial === "glass"
      ? GLASS_VALUE
      : currentTheme;
  const selectedThemeLabel =
    themeOptions.find((option) => option.value === selectedThemeValue)?.label ??
    themes[currentTheme]?.name;
  const handleThemeChange = (value: string) => {
    if (value === GLASS_VALUE) {
      setTheme("macosx");
      setAquaMaterial("glass");
    } else {
      setTheme(value as OsThemeId);
      setAquaMaterial("classic");
    }
  };
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
        <Select value={selectedThemeValue} onValueChange={handleThemeChange}>
          <SelectTrigger className="w-[120px] flex-shrink-0">
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
