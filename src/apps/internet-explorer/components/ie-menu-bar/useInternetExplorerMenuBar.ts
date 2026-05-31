import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { appRegistry } from "@/config/appRegistry";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "internet-explorer";
  const currentYear = new Date().getFullYear();
  const futureYears = getFutureYears(currentYear);
  const pastYears = getPastYears(currentYear);
  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();
  const appName =
    appRegistry[appId as keyof typeof appRegistry]?.name || appId;

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
