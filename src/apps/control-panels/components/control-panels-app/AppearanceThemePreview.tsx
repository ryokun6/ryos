import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { getOsMacChrome, themeSupportsDarkMode } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import {
  getAccentCssVars,
  type AccentChrome,
  type AccentId,
} from "@/themes/accents";
import { AppearanceMacosxPreviewScene } from "./AppearanceMacosxPreviewScene";

function subscribeSystemDark(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSystemDarkSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemDarkServerSnapshot() {
  return false;
}

export function resolvePreviewDarkMode(
  theme: OsThemeId,
  darkModePreference: "system" | "light" | "dark",
  systemPrefersDark: boolean
): boolean {
  if (!themeSupportsDarkMode(theme)) return false;
  if (darkModePreference === "dark") return true;
  if (darkModePreference === "light") return false;
  return systemPrefersDark;
}

export type AppearanceThemePreviewProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  currentTheme: OsThemeId;
  aquaMaterial: "classic" | "glass";
  darkModePreference: "system" | "light" | "dark";
  accent: AccentId;
  accentChrome: AccentChrome | null;
  wallpaperAccentColor: string | null;
};

export function AppearanceThemePreview({
  t,
  currentTheme,
  aquaMaterial,
  darkModePreference,
  accent,
  accentChrome,
  wallpaperAccentColor,
}: AppearanceThemePreviewProps) {
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getSystemDarkServerSnapshot
  );

  const isPreviewDark = useMemo(
    () =>
      resolvePreviewDarkMode(
        currentTheme,
        darkModePreference,
        systemPrefersDark
      ),
    [currentTheme, darkModePreference, systemPrefersDark]
  );

  const chrome = accentChrome ?? getOsMacChrome(currentTheme);

  const accentStyle = useMemo(() => {
    if (!chrome) return undefined;
    return getAccentCssVars(
      chrome,
      accent,
      isPreviewDark,
      wallpaperAccentColor
    ) as CSSProperties;
  }, [chrome, accent, isPreviewDark, wallpaperAccentColor]);

  const previewAquaMaterial =
    currentTheme === "macosx" ? aquaMaterial : undefined;

  return (
    <div
      className="control-panels-pref-theme-preview"
      data-preview-theme={currentTheme}
      data-preview-dark={isPreviewDark ? "true" : "false"}
      data-preview-aqua-material={previewAquaMaterial}
      style={accentStyle}
      aria-label={t("apps.control-panels.themePreview")}
      aria-live="polite"
    >
      {currentTheme === "macosx" ? (
        <AppearanceMacosxPreviewScene t={t} aquaMaterial={aquaMaterial} />
      ) : currentTheme === "system7" ? (
        <System7ThemePreview t={t} />
      ) : currentTheme === "xp" ? (
        <XpThemePreview t={t} />
      ) : (
        <Win98ThemePreview t={t} />
      )}
    </div>
  );
}

function System7ThemePreview({ t }: { t: AppearanceThemePreviewProps["t"] }) {
  return (
    <div className="control-panels-theme-preview-scene">
      <div className="control-panels-theme-preview-menubar">
        <span className="control-panels-theme-preview-apple" aria-hidden="true">
          &#63743;
        </span>
        <span className="control-panels-theme-preview-menu-item control-panels-theme-preview-menu-item-active">
          {t("apps.control-panels.themePreviewMenus.finder")}
        </span>
        <span className="control-panels-theme-preview-menu-item">
          {t("apps.control-panels.themePreviewMenus.file")}
        </span>
      </div>
      <div className="control-panels-theme-preview-window">
        <div className="control-panels-theme-preview-titlebar">
          <span className="control-panels-theme-preview-s7-close" aria-hidden="true" />
          <span className="control-panels-theme-preview-window-title">
            {t("apps.control-panels.themePreviewWindowTitle")}
          </span>
        </div>
        <div className="control-panels-theme-preview-window-body">
          <div className="control-panels-theme-preview-list">
            <div className="control-panels-theme-preview-list-row control-panels-theme-preview-list-row-selected">
              {t("apps.control-panels.themePreviewSelectedItem")}
            </div>
            <div className="control-panels-theme-preview-list-row">
              {t("apps.control-panels.themePreviewOtherItem")}
            </div>
          </div>
          <button type="button" className="control-panels-theme-preview-s7-button" tabIndex={-1}>
            {t("apps.control-panels.themePreviewButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

function XpThemePreview({ t }: { t: AppearanceThemePreviewProps["t"] }) {
  return (
    <div className="control-panels-theme-preview-scene">
      <div className="control-panels-theme-preview-window">
        <div className="control-panels-theme-preview-titlebar">
          <span className="control-panels-theme-preview-window-title">
            {t("apps.control-panels.themePreviewWindowTitle")}
          </span>
          <div className="control-panels-theme-preview-win-controls" aria-hidden="true">
            <span className="minimize" />
            <span className="maximize" />
            <span className="close" />
          </div>
        </div>
        <div className="control-panels-theme-preview-window-body">
          <div className="control-panels-theme-preview-list">
            <div className="control-panels-theme-preview-list-row control-panels-theme-preview-list-row-selected">
              {t("apps.control-panels.themePreviewSelectedItem")}
            </div>
            <div className="control-panels-theme-preview-list-row">
              {t("apps.control-panels.themePreviewOtherItem")}
            </div>
          </div>
          <button type="button" className="control-panels-theme-preview-xp-button" tabIndex={-1}>
            {t("apps.control-panels.themePreviewButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Win98ThemePreview({ t }: { t: AppearanceThemePreviewProps["t"] }) {
  return (
    <div className="control-panels-theme-preview-scene">
      <div className="control-panels-theme-preview-window">
        <div className="control-panels-theme-preview-titlebar">
          <span className="control-panels-theme-preview-window-title">
            {t("apps.control-panels.themePreviewWindowTitle")}
          </span>
          <div className="control-panels-theme-preview-win-controls" aria-hidden="true">
            <span className="minimize" />
            <span className="maximize" />
            <span className="close" />
          </div>
        </div>
        <div className="control-panels-theme-preview-window-body">
          <div className="control-panels-theme-preview-list">
            <div className="control-panels-theme-preview-list-row control-panels-theme-preview-list-row-selected">
              {t("apps.control-panels.themePreviewSelectedItem")}
            </div>
            <div className="control-panels-theme-preview-list-row">
              {t("apps.control-panels.themePreviewOtherItem")}
            </div>
          </div>
          <button type="button" className="control-panels-theme-preview-98-button" tabIndex={-1}>
            {t("apps.control-panels.themePreviewButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
