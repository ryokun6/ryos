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
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppProps } from "../../base/types";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  Favorite,
  HistoryEntry,
  LanguageOption,
  LocationOption,
} from "@/stores/useInternetExplorerStore";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface InternetExplorerMenuBarProps extends Omit<AppProps, "onClose" | "instanceId"> {
  instanceId?: string;
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
        <MenubarSubTrigger className="text-md h-6 px-3 flex items-center gap-2">
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
        className="text-md h-6 px-3 flex items-center gap-2"
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
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onFocusUrlInput}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.goToUrl")}
          </MenubarItem>
          <MenubarItem
            onClick={onSharePage}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.sharePage")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onOpenTimeMachine}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.openTimeMachine")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onRefresh}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.refresh")}
          </MenubarItem>
          <MenubarItem
            onClick={onStop}
            disabled={!isLoading}
            className={
              !isLoading
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3"
            }
          >
            {t("apps.internet-explorer.menu.stop")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Year Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.year")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[120px] max-h-[400px] overflow-y-auto">
              {/* Future Years */}
              {futureYears.map((yearOption) => (
                <MenubarCheckboxItem
                  key={yearOption}
                  checked={year === yearOption}
                  onCheckedChange={(checked) => {
                    if (checked) onYearChange?.(yearOption);
                  }}
                  className="text-md h-6 px-3 text-blue-600"
                >
                  {yearOption}
                </MenubarCheckboxItem>
              ))}

              {/* Current Year */}
              <MenubarCheckboxItem
                checked={year === "current"}
                onCheckedChange={(checked) => {
                  if (checked) onYearChange?.("current");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.now")}
              </MenubarCheckboxItem>

              {/* Past Years */}
              {pastYears.map((yearOption) => (
                <MenubarCheckboxItem
                  key={yearOption}
                  checked={year === yearOption}
                  onCheckedChange={(checked) => {
                    if (checked) onYearChange?.(yearOption);
                  }}
                  className={`text-md h-6 px-3 ${
                    parseInt(yearOption) <= 1995 ? "text-blue-600" : ""
                  }`}
                >
                  {yearOption}
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>

          {/* Language Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.language")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[160px]">
              <MenubarCheckboxItem
                checked={language === "auto"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("auto");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.auto")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "english"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("english");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.english")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "chinese"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("chinese");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.chinese")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "japanese"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("japanese");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.japanese")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "korean"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("korean");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.korean")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "french"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("french");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.french")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "spanish"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("spanish");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.spanish")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "portuguese"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("portuguese");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.portuguese")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "german"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("german");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.german")}
              </MenubarCheckboxItem>

              <MenubarCheckboxItem
                checked={language === "welsh"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("welsh");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.welsh")}
              </MenubarCheckboxItem>

              {/* Ancient Languages */}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={language === "latin"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("latin");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.latin")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "sanskrit"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("sanskrit");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.sanskrit")}
              </MenubarCheckboxItem>

              {/* Futuristic/Non-human Languages */}
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarCheckboxItem
                checked={language === "alien"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("alien");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.alien")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "ai_language"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("ai_language");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.aiLanguage")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={language === "digital_being"}
                onCheckedChange={(checked) => {
                  if (checked) onLanguageChange?.("digital_being");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.digitalBeing")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          {/* Location Submenu */}
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.location")}
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-[160px]">
              <MenubarCheckboxItem
                checked={location === "auto"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("auto");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.auto")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "united_states"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("united_states");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.unitedStates")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "china"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("china");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.china")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "japan"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("japan");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.japan")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "korea"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("korea");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.korea")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "canada"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("canada");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.canada")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "uk"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("uk");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.unitedKingdom")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "france"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("france");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.france")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "germany"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("germany");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.germany")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "spain"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("spain");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.spain")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "portugal"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("portugal");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.portugal")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "india"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("india");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.india")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "brazil"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("brazil");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.brazil")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "australia"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("australia");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.australia")}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={location === "russia"}
                onCheckedChange={(checked) => {
                  if (checked) onLocationChange?.("russia");
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.russia")}
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onEditFuture}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.editFuture")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Favorites Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.internet-explorer.menu.favorites")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-xs"
        >
          <MenubarItem
            onClick={onHome}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.goHome")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onAddFavorite}
            className="text-md h-6 px-3"
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
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.clearFavorites")}
              </MenubarItem>
            </>
          )}
          <MenubarItem
            onClick={onResetFavorites}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.resetFavorites")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* History Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
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
                : "text-md h-6 px-3"
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
                : "text-md h-6 px-3"
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
                  className="text-md h-6 px-3 flex items-center gap-2"
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
                className="text-md h-6 px-3"
              >
                {t("apps.internet-explorer.menu.clearHistory")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.internet-explorer.menu.internetExplorerHelp")}
          </MenubarItem>
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.menu.shareApp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onShowAbout}
            className="text-md h-6 px-3"
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
