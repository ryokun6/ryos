import { useTranslation } from "react-i18next";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import type { InternetExplorerMenuBarProps } from "./types";
import { getFutureYears, getPastYears } from "./yearLists";

export type InternetExplorerMenuBarViewModel = ReturnType<
  typeof useInternetExplorerMenuBar
>;

export function useInternetExplorerMenuBar(props: InternetExplorerMenuBarProps) {
  const {
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
  } = props;

  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("internet-explorer");
  const currentYear = new Date().getFullYear();
  const futureYears = getFutureYears(currentYear);
  const pastYears = getPastYears(currentYear);

  return {
    t,
    isShareDialogOpen,
    setIsShareDialogOpen,
    appId,
    appName,
    isXpTheme,
    isMacOsxTheme,
    futureYears,
    pastYears,
    onRefresh,
    onStop,
    onHome,
    onShowHelp,
    onShowAbout,
    isLoading,
    favorites,
    history,
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
    language,
    location,
    onLanguageChange,
    onLocationChange,
    year,
    onYearChange,
    onSharePage,
  };
}
