import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { cn } from "@/lib/utils";
import type { AccentChrome } from "@/themes/accents";

export const MACOSX_GLASS_THEME_VALUE = "macosx:glass";

const THEME_NAME_KEYS: Record<OsThemeId, string> = {
  system7: "apps.control-panels.themeNames.system7",
  macosx: "apps.control-panels.themeNames.aqua",
  xp: "apps.control-panels.themeNames.xp",
  win98: "apps.control-panels.themeNames.win98",
};

export function buildThemeSelectOptions(
  t: (key: string, opts?: Record<string, unknown>) => string
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const id of Object.keys(themes) as OsThemeId[]) {
    options.push({ value: id, label: t(THEME_NAME_KEYS[id]) });
    if (id === "macosx") {
      options.push({
        value: MACOSX_GLASS_THEME_VALUE,
        label: t("apps.control-panels.themeNames.aquaGlass"),
      });
    }
  }
  return options;
}

export function getSelectedThemeSelectValue(
  currentTheme: OsThemeId,
  aquaMaterial: "classic" | "glass"
): string {
  return currentTheme === "macosx" && aquaMaterial === "glass"
    ? MACOSX_GLASS_THEME_VALUE
    : currentTheme;
}

export function getThemeSelectLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  currentTheme: OsThemeId,
  aquaMaterial: "classic" | "glass",
  themeOptions: { value: string; label: string }[]
): string {
  const selectedValue = getSelectedThemeSelectValue(currentTheme, aquaMaterial);
  return (
    themeOptions.find((option) => option.value === selectedValue)?.label ??
    t(THEME_NAME_KEYS[currentTheme])
  );
}

/** Small color chip shown in accent Select menus. */
export function AccentSwatch({
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
