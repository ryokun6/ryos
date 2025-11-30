import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
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
      <DropdownMenuSub key={favorite.title}>
        <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2">
          <ThemedIcon
            name="directory.png"
            alt="Folder"
            className="w-4 h-4 [image-rendering:pixelated]"
          />
          {favorite.title}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-w-xs">
          {favorite.children.map((child) =>
            renderFavoriteItem(child, onNavigate)
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  } else if (favorite.url) {
    // Render as a regular favorite item
    return (
      <DropdownMenuItem
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
      </DropdownMenuItem>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onFocusUrlInput}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Go to URL
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSharePage}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share Page...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onOpenTimeMachine}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Open Time Machine
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onRefresh}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onStop}
            disabled={!isLoading}
            className={
              !isLoading
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            Stop
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />

          {/* Year Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              Year
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[120px] max-h-[400px] overflow-y-auto">
              {/* Future Years */}
              {futureYears.map((yearOption) => (
                <DropdownMenuItem
                  key={yearOption}
                  onClick={() => onYearChange?.(yearOption)}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white text-blue-600"
                >
                  <span className={cn(year !== yearOption && "pl-4")}>
                    {year === yearOption ? `✓ ${yearOption}` : yearOption}
                  </span>
                </DropdownMenuItem>
              ))}

              {/* Current Year */}
              <DropdownMenuItem
                onClick={() => onYearChange?.("current")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(year !== "current" && "pl-4")}>
                  {year === "current" ? "✓ Now" : "Now"}
                </span>
              </DropdownMenuItem>

              {/* Past Years */}
              {pastYears.map((yearOption) => (
                <DropdownMenuItem
                  key={yearOption}
                  onClick={() => onYearChange?.(yearOption)}
                  className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                    parseInt(yearOption) <= 1995 ? "text-blue-600" : ""
                  }`}
                >
                  <span className={cn(year !== yearOption && "pl-4")}>
                    {year === yearOption ? `✓ ${yearOption}` : yearOption}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Language Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              Language
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("auto")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "auto" && "pl-4")}>
                  {language === "auto" ? "✓ Auto" : "Auto"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("english")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "english" && "pl-4")}>
                  {language === "english" ? "✓ English" : "English"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("chinese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "chinese" && "pl-4")}>
                  {language === "chinese" ? "✓ Chinese" : "Chinese"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("japanese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "japanese" && "pl-4")}>
                  {language === "japanese" ? "✓ Japanese" : "Japanese"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("korean")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "korean" && "pl-4")}>
                  {language === "korean" ? "✓ Korean" : "Korean"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("french")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "french" && "pl-4")}>
                  {language === "french" ? "✓ French" : "French"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("spanish")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "spanish" && "pl-4")}>
                  {language === "spanish" ? "✓ Spanish" : "Spanish"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("portuguese")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "portuguese" && "pl-4")}>
                  {language === "portuguese" ? "✓ Portuguese" : "Portuguese"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("german")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "german" && "pl-4")}>
                  {language === "german" ? "✓ German" : "German"}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onLanguageChange?.("welsh")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "welsh" && "pl-4")}>
                  {language === "welsh" ? "✓ Welsh" : "Welsh"}
                </span>
              </DropdownMenuItem>

              {/* Ancient Languages */}
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("latin")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "latin" && "pl-4")}>
                  {language === "latin" ? "✓ Latin" : "Latin"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("sanskrit")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "sanskrit" && "pl-4")}>
                  {language === "sanskrit" ? "✓ Sanskrit" : "Sanskrit"}
                </span>
              </DropdownMenuItem>

              {/* Futuristic/Non-human Languages */}
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("alien")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "alien" && "pl-4")}>
                  {language === "alien" ? "✓ Alien" : "Alien"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("ai_language")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "ai_language" && "pl-4")}>
                  {language === "ai_language" ? "✓ AI Language" : "AI Language"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLanguageChange?.("digital_being")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(language !== "digital_being" && "pl-4")}>
                  {language === "digital_being"
                    ? "✓ Digital Being"
                    : "Digital Being"}
                </span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Location Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              Location
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => onLocationChange?.("auto")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "auto" && "pl-4")}>
                  {location === "auto" ? "✓ Auto" : "Auto"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("united_states")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "united_states" && "pl-4")}>
                  {location === "united_states"
                    ? "✓ United States"
                    : "United States"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("china")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "china" && "pl-4")}>
                  {location === "china" ? "✓ China" : "China"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("japan")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "japan" && "pl-4")}>
                  {location === "japan" ? "✓ Japan" : "Japan"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("korea")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "korea" && "pl-4")}>
                  {location === "korea" ? "✓ Korea" : "Korea"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("canada")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "canada" && "pl-4")}>
                  {location === "canada" ? "✓ Canada" : "Canada"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("uk")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "uk" && "pl-4")}>
                  {location === "uk" ? "✓ United Kingdom" : "United Kingdom"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("france")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "france" && "pl-4")}>
                  {location === "france" ? "✓ France" : "France"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("germany")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "germany" && "pl-4")}>
                  {location === "germany" ? "✓ Germany" : "Germany"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("spain")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "spain" && "pl-4")}>
                  {location === "spain" ? "✓ Spain" : "Spain"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("portugal")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "portugal" && "pl-4")}>
                  {location === "portugal" ? "✓ Portugal" : "Portugal"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("india")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "india" && "pl-4")}>
                  {location === "india" ? "✓ India" : "India"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("brazil")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "brazil" && "pl-4")}>
                  {location === "brazil" ? "✓ Brazil" : "Brazil"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("australia")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "australia" && "pl-4")}>
                  {location === "australia" ? "✓ Australia" : "Australia"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLocationChange?.("russia")}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(location !== "russia" && "pl-4")}>
                  {location === "russia" ? "✓ Russia" : "Russia"}
                </span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onEditFuture}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Edit Future...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Favorites Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Favorites
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-xs"
        >
          <DropdownMenuItem
            onClick={onHome}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Go Home
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onAddFavorite}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Add to Favorites...
          </DropdownMenuItem>
          {favorites.length > 0 && (
            <>
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              {favorites.map((favorite) =>
                renderFavoriteItem(favorite, (url, year) =>
                  onNavigateToFavorite?.(url, year)
                )
              )}
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              <DropdownMenuItem
                onClick={onClearFavorites}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Clear Favorites...
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onClick={onResetFavorites}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Reset Favorites...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* History Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            History
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={1}
          className="px-0 max-h-[400px] overflow-y-auto max-w-xs"
        >
          <DropdownMenuItem
            onClick={onGoBack}
            disabled={!canGoBack}
            className={
              !canGoBack
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            Back
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onGoForward}
            disabled={!canGoForward}
            className={
              !canGoForward
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            Forward
          </DropdownMenuItem>

          {history.length > 0 && (
            <>
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              {history.slice(0, 10).map((entry) => (
                <DropdownMenuItem
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
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              <DropdownMenuItem
                onClick={onClearHistory}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Clear History...
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Internet Explorer Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share App...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About Internet Explorer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
