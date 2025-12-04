import { useState } from "react";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AppProps } from "../../base/types";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  Favorite,
  HistoryEntry,
  LanguageOption,
  LocationOption,
} from "@/stores/useInternetExplorerStore";
import { cn } from "@/lib/utils";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface InternetExplorerMenuBarProps extends Omit<AppProps, "onClose"> {
  onRefresh?: () => void;
  onStop?: () => void;
  onGoToUrl?: () => void;
  onHome?: () => void;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
  isLoading?: boolean;
  favorites?: Favorite[];
  history?: HistoryEntry[];
  onAddFavorite?: () => void;
  onClearFavorites?: () => void;
  onResetFavorites?: () => void;
  onNavigateToFavorite?: (url: string, year?: string) => void;
  onNavigateToHistory?: (url: string, year?: string) => void;
  onFocusUrlInput?: () => void;
  onClose?: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onClearHistory?: () => void;
  onOpenTimeMachine?: () => void;
  onEditFuture?: () => void;
  language?: LanguageOption;
  location?: LocationOption;
  onLanguageChange?: (language: LanguageOption) => void;
  onLocationChange?: (location: LocationOption) => void;
  year?: string;
  onYearChange?: (year: string) => void;
  onSharePage?: () => void;
}

// Recursive function to render favorite items or submenus
const renderFavoriteItem = (
  favorite: Favorite,
  onNavigate: (url: string, year?: string) => void
) => {
  if (favorite.children && favorite.children.length > 0) {
    // Render as a submenu (folder)
    return (
      <MenubarSub key={favorite.title}>
        <MenubarSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2">
          <ThemedIcon
            name="directory.png"
            alt="Folder"
            className="w-4 h-4 [image-rendering:pixelated]"
          />
          {favorite.title}
        </MenubarSubTrigger>
        <MenubarSubContent className="max-w-xs">
          {favorite.children.map((child) =>
            renderFavoriteItem(child, onNavigate)
          )}
        </MenubarSubContent>
      </MenubarSub>
    );
  } else if (favorite.url) {
    // Render as a regular favorite item
    return (
      <MenubarItem
        key={favorite.url}
        onClick={() => onNavigate(favorite.url!, favorite.year)}
        className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
      >
        {favorite.favicon && typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine ? (
          <img
            src={favorite.favicon}
            alt=""
            className="w-4 h-4"
            onError={(e) => {
              e.currentTarget.src = "/icons/default/ie-site.png";
            }}
          />
        ) : (
          <ThemedIcon
            name="ie-site.png"
            alt=""
            className="w-4 h-4 [image-rendering:pixelated]"
          />
        )}
        {favorite.title}
        {favorite.year && favorite.year !== "current" && (
          <span className="text-xs text-gray-500 ml-1">({favorite.year})</span>
        )}
      </MenubarItem>
    );
  } else {
    // Should not happen for valid data, but return null as fallback
    return null;
  }
};

export function InternetExplorerMenuBar({
  onRefresh,
  onStop,
  onHome,
  onShowHelp,
  onShowAbout,
  isLoading,
  favorites = [],
  history = [],
  onAddFavorite,
  onClearFavorites,
  onResetFavorites,
  onNavigateToFavorite,
  onNavigateToHistory,
  onFocusUrlInput,
  onClose,
  onGoBack,
  onGoForward,
  canGoBack,
  canGoForward,
  onClearHistory,
  onOpenTimeMachine,
  onEditFuture,
  language = "auto",
  location = "auto",
  onLanguageChange,
  onLocationChange,
  year = "current",
  onYearChange,
  onSharePage,
}: InternetExplorerMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "internet-explorer";
  // Get current year for generating year lists
  const currentYear = new Date().getFullYear();

  // Generate lists of future and past years
  const futureYears = [
    ...Array.from({ length: 8 }, (_, i) => (2030 + i * 10).toString()).filter(
      (yr) => parseInt(yr) !== currentYear
    ),
    "2150",
    "2200",
    "2250",
    "2300",
    "2400",
    "2500",
    "2750",
    "3000",
  ].sort((a, b) => parseInt(b) - parseInt(a));

  const pastYears = [
    "1000 BC",
    "1 CE",
    "500",
    "800",
    "1000",
    "1200",
    "1400",
    "1600",
    "1700",
    "1800",
    "1900",
    "1910",
    "1920",
    "1930",
    "1940",
    "1950",
    "1960",
    "1970",
    "1980",
    "1985",
    "1990",
    ...Array.from({ length: currentYear - 1991 + 1 }, (_, i) =>
      (1991 + i).toString()
    ).filter((yr) => parseInt(yr) !== currentYear),
  ].reverse();

  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onFocusUrlInput}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.goToUrl")}
          </MenubarItem>
          <MenubarItem
            onClick={onSharePage}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.sharePage")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onOpenTimeMachine}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.openTimeMachine")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onRefresh}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.refresh")}
          </MenubarItem>
          <MenubarItem
            onClick={onStop}
            disabled={!isLoading}
            className={
              !isLoading
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            {t("apps.internet-explorer.menu.stop")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Year Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.internet-explorer.menu.year")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[120px] max-h-[400px] overflow-y-auto">
              {/* Future Years */}
              {futureYears.map((yearOption) => (
                <MenubarItem
                  key={yearOption}
                  onClick={() => onYearChange?.(yearOption)}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white text-blue-600"
                >
                  <span className={cn(year !== yearOption && "pl-4")}>
                    {year === yearOption ? `✓ ${yearOption}` : yearOption}
                  </span>
                </MenubarItem>
              ))}

              {/* Current Year */}
              <MenubarItem
                onClick={() => onYearChange?.("current")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(year !== "current" && "pl-4")}>
                  {year === "current" ? `✓ ${t("apps.internet-explorer.menu.now")}` : t("apps.internet-explorer.menu.now")}
                </span>
              </MenubarItem>

              {/* Past Years */}
              {pastYears.map((yearOption) => (
                <MenubarItem
                  key={yearOption}
                  onClick={() => onYearChange?.(yearOption)}
                  className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                    parseInt(yearOption) <= 1995 ? "text-blue-600" : ""
                  }`}
                >
                  <span className={cn(year !== yearOption && "pl-4")}>
                    {year === yearOption ? `✓ ${yearOption}` : yearOption}
                  </span>
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>

          {/* Language Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.internet-explorer.menu.language")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[160px]">
              <MenubarItem
                onClick={() => onLanguageChange?.("auto")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "auto" && "pl-4")}>
                  {language === "auto" ? `✓ ${t("apps.internet-explorer.menu.auto")}` : t("apps.internet-explorer.menu.auto")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("english")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "english" && "pl-4")}>
                  {language === "english" ? `✓ ${t("apps.internet-explorer.menu.english")}` : t("apps.internet-explorer.menu.english")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("chinese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "chinese" && "pl-4")}>
                  {language === "chinese" ? `✓ ${t("apps.internet-explorer.menu.chinese")}` : t("apps.internet-explorer.menu.chinese")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("japanese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "japanese" && "pl-4")}>
                  {language === "japanese" ? `✓ ${t("apps.internet-explorer.menu.japanese")}` : t("apps.internet-explorer.menu.japanese")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("korean")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "korean" && "pl-4")}>
                  {language === "korean" ? `✓ ${t("apps.internet-explorer.menu.korean")}` : t("apps.internet-explorer.menu.korean")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("french")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "french" && "pl-4")}>
                  {language === "french" ? `✓ ${t("apps.internet-explorer.menu.french")}` : t("apps.internet-explorer.menu.french")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("spanish")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "spanish" && "pl-4")}>
                  {language === "spanish" ? `✓ ${t("apps.internet-explorer.menu.spanish")}` : t("apps.internet-explorer.menu.spanish")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("portuguese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "portuguese" && "pl-4")}>
                  {language === "portuguese" ? `✓ ${t("apps.internet-explorer.menu.portuguese")}` : t("apps.internet-explorer.menu.portuguese")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("german")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "german" && "pl-4")}>
                  {language === "german" ? `✓ ${t("apps.internet-explorer.menu.german")}` : t("apps.internet-explorer.menu.german")}
                </span>
              </MenubarItem>

              <MenubarItem
                onClick={() => onLanguageChange?.("welsh")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "welsh" && "pl-4")}>
                  {language === "welsh" ? `✓ ${t("apps.internet-explorer.menu.welsh")}` : t("apps.internet-explorer.menu.welsh")}
                </span>
              </MenubarItem>

              {/* Ancient Languages */}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={() => onLanguageChange?.("latin")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "latin" && "pl-4")}>
                  {language === "latin" ? `✓ ${t("apps.internet-explorer.menu.latin")}` : t("apps.internet-explorer.menu.latin")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("sanskrit")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "sanskrit" && "pl-4")}>
                  {language === "sanskrit" ? `✓ ${t("apps.internet-explorer.menu.sanskrit")}` : t("apps.internet-explorer.menu.sanskrit")}
                </span>
              </MenubarItem>

              {/* Futuristic/Non-human Languages */}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={() => onLanguageChange?.("alien")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "alien" && "pl-4")}>
                  {language === "alien" ? `✓ ${t("apps.internet-explorer.menu.alien")}` : t("apps.internet-explorer.menu.alien")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("ai_language")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "ai_language" && "pl-4")}>
                  {language === "ai_language" ? `✓ ${t("apps.internet-explorer.menu.aiLanguage")}` : t("apps.internet-explorer.menu.aiLanguage")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLanguageChange?.("digital_being")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "digital_being" && "pl-4")}>
                  {language === "digital_being"
                    ? `✓ ${t("apps.internet-explorer.menu.digitalBeing")}`
                    : t("apps.internet-explorer.menu.digitalBeing")}
                </span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Location Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.internet-explorer.menu.location")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[160px]">
              <MenubarItem
                onClick={() => onLocationChange?.("auto")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "auto" && "pl-4")}>
                  {location === "auto" ? `✓ ${t("apps.internet-explorer.menu.auto")}` : t("apps.internet-explorer.menu.auto")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("united_states")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "united_states" && "pl-4")}>
                  {location === "united_states"
                    ? `✓ ${t("apps.internet-explorer.menu.unitedStates")}`
                    : t("apps.internet-explorer.menu.unitedStates")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("china")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "china" && "pl-4")}>
                  {location === "china" ? `✓ ${t("apps.internet-explorer.menu.china")}` : t("apps.internet-explorer.menu.china")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("japan")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "japan" && "pl-4")}>
                  {location === "japan" ? `✓ ${t("apps.internet-explorer.menu.japan")}` : t("apps.internet-explorer.menu.japan")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("korea")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "korea" && "pl-4")}>
                  {location === "korea" ? `✓ ${t("apps.internet-explorer.menu.korea")}` : t("apps.internet-explorer.menu.korea")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("canada")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "canada" && "pl-4")}>
                  {location === "canada" ? `✓ ${t("apps.internet-explorer.menu.canada")}` : t("apps.internet-explorer.menu.canada")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("uk")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "uk" && "pl-4")}>
                  {location === "uk" ? `✓ ${t("apps.internet-explorer.menu.unitedKingdom")}` : t("apps.internet-explorer.menu.unitedKingdom")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("france")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "france" && "pl-4")}>
                  {location === "france" ? `✓ ${t("apps.internet-explorer.menu.france")}` : t("apps.internet-explorer.menu.france")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("germany")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "germany" && "pl-4")}>
                  {location === "germany" ? `✓ ${t("apps.internet-explorer.menu.germany")}` : t("apps.internet-explorer.menu.germany")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("spain")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "spain" && "pl-4")}>
                  {location === "spain" ? `✓ ${t("apps.internet-explorer.menu.spain")}` : t("apps.internet-explorer.menu.spain")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("portugal")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "portugal" && "pl-4")}>
                  {location === "portugal" ? `✓ ${t("apps.internet-explorer.menu.portugal")}` : t("apps.internet-explorer.menu.portugal")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("india")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "india" && "pl-4")}>
                  {location === "india" ? `✓ ${t("apps.internet-explorer.menu.india")}` : t("apps.internet-explorer.menu.india")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("brazil")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "brazil" && "pl-4")}>
                  {location === "brazil" ? `✓ ${t("apps.internet-explorer.menu.brazil")}` : t("apps.internet-explorer.menu.brazil")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("australia")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "australia" && "pl-4")}>
                  {location === "australia" ? `✓ ${t("apps.internet-explorer.menu.australia")}` : t("apps.internet-explorer.menu.australia")}
                </span>
              </MenubarItem>
              <MenubarItem
                onClick={() => onLocationChange?.("russia")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "russia" && "pl-4")}>
                  {location === "russia" ? `✓ ${t("apps.internet-explorer.menu.russia")}` : t("apps.internet-explorer.menu.russia")}
                </span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onEditFuture}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.editFuture")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Favorites Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white">
          {t("apps.internet-explorer.menu.favorites")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-xs"
        >
          <MenubarItem
            onClick={onHome}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.goHome")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onAddFavorite}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.addToFavorites")}
          </MenubarItem>
          {favorites.length > 0 && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              {favorites.map((favorite) =>
                renderFavoriteItem(favorite, (url, year) =>
                  onNavigateToFavorite?.(url, year)
                )
              )}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onClearFavorites}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.internet-explorer.menu.clearFavorites")}
              </MenubarItem>
            </>
          )}
          <MenubarItem
            onClick={onResetFavorites}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.resetFavorites")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* History Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white">
          {t("apps.internet-explorer.menu.history")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-h-[400px] overflow-y-auto max-w-xs"
        >
          <MenubarItem
            onClick={onGoBack}
            disabled={!canGoBack}
            className={
              !canGoBack
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            {t("apps.internet-explorer.menu.back")}
          </MenubarItem>
          <MenubarItem
            onClick={onGoForward}
            disabled={!canGoForward}
            className={
              !canGoForward
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            {t("apps.internet-explorer.menu.forward")}
          </MenubarItem>

          {history.length > 0 && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              {history.slice(0, 10).map((entry) => (
                <MenubarItem
                  key={entry.url + entry.timestamp}
                  onClick={() =>
                    onNavigateToHistory?.(entry.url, entry.year || "current")
                  }
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
                >
                  {entry.favicon && typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine ? (
                    <img
                      src={entry.favicon}
                      alt=""
                      className="w-4 h-4"
                      onError={(e) => {
                        e.currentTarget.src = "/icons/default/ie-site.png";
                      }}
                    />
                  ) : (
                    <ThemedIcon
                      name="ie-site.png"
                      alt=""
                      className="w-4 h-4 [image-rendering:pixelated]"
                    />
                  )}
                  <span className="truncate">
                    {entry.title}
                    {entry.year && entry.year !== "current" && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({entry.year})
                      </span>
                    )}
                  </span>
                </MenubarItem>
              ))}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onClearHistory}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.internet-explorer.menu.clearHistory")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.internetExplorerHelp")}
          </MenubarItem>
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.shareApp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.internet-explorer.menu.aboutInternetExplorer")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appRegistry[appId as keyof typeof appRegistry]?.name || appId}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
