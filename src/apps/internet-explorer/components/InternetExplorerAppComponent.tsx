import type { ReactNode } from "react";
import { AppProps, InternetExplorerInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { Input } from "@/components/ui/input";
import { InternetExplorerMenuBar } from "./InternetExplorerMenuBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  ClockCounterClockwise,
  MagnifyingGlass,
  Export,
} from "@phosphor-icons/react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { motion, AnimatePresence } from "framer-motion";
import FutureSettingsDialog from "@/components/dialogs/FutureSettingsDialog";
import TimeMachineView from "./TimeMachineView";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useInternetExplorerLogic } from "../hooks/useInternetExplorerLogic";

interface ErrorPageProps {
  title: string;
  primaryMessage: string;
  secondaryMessage?: string;
  suggestions: (string | ReactNode)[];
  details?: string;
  footerText: string;
  showGoBackButtonInSuggestions?: boolean;
  onGoBack: () => void;
  onRetry?: () => void;
}

function ErrorPage({
  title,
  primaryMessage,
  secondaryMessage,
  suggestions,
  details,
  footerText,
  showGoBackButtonInSuggestions = true,
  onGoBack,
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="p-6 font-geneva-12 text-sm h-full overflow-y-auto">
      <h1 className="text-lg mb-4 font-normal flex items-center">{title}</h1>

      <p className="mb-3">{primaryMessage}</p>
      {secondaryMessage && <p className="mb-3">{secondaryMessage}</p>}

      <div className="h-px bg-gray-300 my-5"></div>

      <p className="mb-3">Please try the following:</p>

      <ul className="list-disc pl-6 mb-5 space-y-2">
        {suggestions.map((suggestion, index) => (
          <li key={index}>
            {typeof suggestion === "string" && suggestion.includes("{hostname}")
              ? suggestion.split("{hostname}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href={`https://${details}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 underline"
                      >
                        {details}
                      </a>
                      {part}
                    </>
                  )
                )
              : typeof suggestion === "string" &&
                suggestion.includes("{backButton}") &&
                showGoBackButtonInSuggestions
              ? suggestion.split("{backButton}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href="#"
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onGoBack();
                        }}
                        className="text-red-600 underline"
                      >
                        Back
                      </a>
                      {part}
                    </>
                  )
                )
              : typeof suggestion === "string" &&
                suggestion.includes("{refreshButton}") &&
                onRetry
              ? suggestion.split("{refreshButton}").map((part, i) =>
                  i === 0 ? (
                    part
                  ) : (
                    <>
                      <a
                        href="#"
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onRetry();
                        }}
                        className="text-red-600 underline"
                      >
                        Refresh
                      </a>
                      {part}
                    </>
                  )
                )
              : suggestion}
          </li>
        ))}
      </ul>

      {details && !footerText.includes("HTTP") && (
        <div className="p-3 bg-gray-100 border border-gray-300 rounded mb-5">
          {details}
        </div>
      )}

      <div className="mt-10 text-gray-700 whitespace-pre-wrap">
        {footerText}
      </div>
    </div>
  );
}

export function InternetExplorerAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  helpItems,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<InternetExplorerInitialData>) {
  const {
    url,
    year,
    mode,
    favorites,
    history,
    historyIndex,
    isTitleDialogOpen,
    newFavoriteTitle,
    isHelpDialogOpen,
    isAboutDialogOpen,
    isClearFavoritesDialogOpen,
    isClearHistoryDialogOpen,
    currentPageTitle,
    status,
    finalUrl,
    aiGeneratedHtml,
    errorDetails,
    isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen,
    language,
    location,
    isTimeMachineViewOpen,
    cachedYears,
    isFetchingCachedYears,
    hasMoreToScroll,
    isUrlDropdownOpen,
    setIsUrlDropdownOpen,
    filteredSuggestions,
    localUrl,
    setLocalUrl,
    isSelectingText,
    setIsSelectingText,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    dropdownStyle,
    displayTitle,
    isShareDialogOpen,
    setIsShareDialogOpen,
    urlInputRef,
    iframeRef,
    favoritesContainerRef,
    generatedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
    currentTheme,
    isXpTheme,
    isOffline,
    pastYears,
    futureYears,
    isFutureYear,
    chronologicallySortedYears,
    isLoading,
    loadingBarVariants,
    handleNavigate,
    handleNavigateWithHistory,
    handleFilterSuggestions,
    handleGoBack,
    handleGoForward,
    handleAddFavorite,
    handleTitleSubmit,
    handleResetFavorites,
    handleClearFavorites,
    handleRefresh,
    handleStop,
    handleGoToUrl,
    handleHome,
    handleSharePage,
    handleIframeLoad,
    handleIframeError,
    stripProtocol,
    isValidUrl,
    normalizeUrlInline,
    normalizeUrlForHistory,
    getDebugStatusMessage,
    ieGenerateShareUrl,
    setTitleDialogOpen,
    setNewFavoriteTitle,
    setHelpDialogOpen,
    setAboutDialogOpen,
    setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen,
    clearHistory,
    setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen,
    setTimeMachineViewOpen,
    translatedHelpItems,
    setUrl,
    setLanguage,
    setLocation,
    bringInstanceToForeground,
    t,
  } = useInternetExplorerLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
    helpItems,
  });

  const renderErrorPage = () => {
    if (!errorDetails) return null;

    // Map ErrorResponse to ErrorPageProps
    const title =
      errorDetails.type === "network"
        ? "Cannot find server or DNS Error"
        : "Error";
    const primaryMessage = errorDetails.message || "An error occurred";
    const secondaryMessage = errorDetails.details;
    const suggestions = [
      "Check the web address you typed and try again.",
      "Go back to the previous page.",
      "Try refreshing the page.",
    ];
    const footerText = errorDetails.hostname
      ? `Host: ${errorDetails.hostname}`
      : "";

    return (
      <ErrorPage
        title={title}
        primaryMessage={primaryMessage}
        secondaryMessage={secondaryMessage}
        suggestions={suggestions}
        details={errorDetails.details}
        footerText={footerText}
        onGoBack={handleGoBack}
        onRetry={() => handleNavigate(url, year)}
      />
    );
  };

  const menuBar = (
    <InternetExplorerMenuBar
      isWindowOpen={isWindowOpen}
      isForeground={isForeground}
      onRefresh={handleRefresh}
      onStop={handleStop}
      onFocusUrlInput={handleGoToUrl}
      onHome={handleHome}
      onShowHelp={() => setHelpDialogOpen(true)}
      onShowAbout={() => setAboutDialogOpen(true)}
      isLoading={isLoading}
      favorites={favorites}
      history={history}
      onAddFavorite={handleAddFavorite}
      onClearFavorites={() => setClearFavoritesDialogOpen(true)}
      onResetFavorites={() => setResetFavoritesDialogOpen(true)}
      onNavigateToFavorite={(favUrl, favYear) =>
        handleNavigateWithHistory(favUrl, favYear)
      }
      onNavigateToHistory={handleNavigateWithHistory}
      onGoBack={handleGoBack}
      onGoForward={handleGoForward}
      canGoBack={historyIndex < history.length - 1}
      canGoForward={historyIndex > 0}
      onClearHistory={() => setClearHistoryDialogOpen(true)}
      onOpenTimeMachine={() => setTimeMachineViewOpen(true)}
      onClose={onClose}
      onEditFuture={() => setFutureSettingsDialogOpen(true)}
      language={language}
      location={location}
      year={year}
      onLanguageChange={setLanguage}
      onLocationChange={setLocation}
      onYearChange={(newYear) => handleNavigate(url, newYear)}
      onSharePage={handleSharePage}
      skipInitialSound={skipInitialSound}
      instanceId={instanceId}
      onNavigateNext={onNavigateNext}
      onNavigatePrevious={onNavigatePrevious}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <TooltipProvider>
        <WindowFrame
          title={displayTitle}
          onClose={onClose}
          isForeground={isForeground}
          appId="internet-explorer"
          skipInitialSound={skipInitialSound}
          instanceId={instanceId}
          onNavigateNext={onNavigateNext}
          onNavigatePrevious={onNavigatePrevious}
          menuBar={isXpTheme ? menuBar : undefined}
        >
          <div className="flex flex-col h-full w-full relative">
            <div
              className={`flex flex-col gap-1 p-1 ${
                isXpTheme
                  ? "bg-transparent border-b border-[#919b9c]"
                  : currentTheme === "macosx"
                  ? "bg-transparent"
                  : currentTheme === "system7"
                  ? "bg-gray-100 border-b border-black"
                  : "bg-gray-100 border-b border-gray-300"
              }`}
              style={{
                borderBottom:
                  currentTheme === "macosx"
                    ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
                    : undefined,
              }}
            >
              <div className="flex gap-2 items-center">
                <div className="flex gap-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleGoBack}
                    disabled={isOffline || historyIndex >= history.length - 1}
                    className="h-8 w-8"
                  >
                    <ArrowLeft size={14} weight="bold" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleGoForward}
                    disabled={isOffline || historyIndex <= 0}
                    className="h-8 w-8"
                  >
                    <ArrowRight size={14} weight="bold" />
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSharePage}
                        className="h-8 w-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                        aria-label="Share this page"
                      >
                        <Export size={14} weight="bold" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Share this page</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex-1 relative flex items-center">
                  <Input
                    ref={urlInputRef}
                    value={localUrl}
                    disabled={isOffline}
                    onChange={(e) => {
                      // Strip any https:// prefix on input
                      const strippedValue = stripProtocol(e.target.value);
                      setLocalUrl(strippedValue);
                      handleFilterSuggestions(strippedValue);
                      setIsUrlDropdownOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (isOffline && e.key === "Enter") {
                        checkOfflineAndShowError(
                          "Internet Explorer requires an internet connection to navigate"
                        );
                        return;
                      }
                      if (e.key === "Enter") {
                        setIsUrlDropdownOpen(false);
                        // Use the currently selected suggestion when Enter is pressed
                        if (filteredSuggestions.length > 0) {
                          const firstSuggestion =
                            filteredSuggestions[selectedSuggestionIndex];
                          if (firstSuggestion.type === "search") {
                            const searchQuery =
                              firstSuggestion.url.substring(5); // Remove "bing:"
                            handleNavigateWithHistory(
                              `https://www.bing.com/search?q=${encodeURIComponent(
                                searchQuery
                              )}`,
                              "current"
                            );
                          } else {
                            handleNavigateWithHistory(
                              firstSuggestion.url,
                              firstSuggestion.year
                            );
                          }
                        } else if (isValidUrl(localUrl)) {
                          setUrl(localUrl);
                          handleNavigate(localUrl);
                        } else {
                          // If not valid URL and no suggestions, reset to previously valid URL
                          setLocalUrl(stripProtocol(url));
                        }
                      } else if (e.key === "Escape") {
                        setIsUrlDropdownOpen(false);
                        // Reset input to last valid URL
                        setLocalUrl(stripProtocol(url));
                      } else if (
                        e.key === "ArrowDown" &&
                        filteredSuggestions.length > 0
                      ) {
                        e.preventDefault();
                        // Set the index to 0 if not already navigating, or increment if we are
                        const nextIndex =
                          selectedSuggestionIndex < 0
                            ? 0
                            : selectedSuggestionIndex === 0
                            ? 1 // Move to second item if first is selected
                            : Math.min(
                                selectedSuggestionIndex + 1,
                                filteredSuggestions.length - 1
                              );
                        setSelectedSuggestionIndex(nextIndex);

                        // Find the item at our desired index
                        const dropdown = document.querySelector(
                          "[data-dropdown-content]"
                        );
                        const items = dropdown?.querySelectorAll(
                          "[data-dropdown-item]"
                        );
                        const targetItem = items?.[nextIndex] as HTMLElement;

                        if (targetItem) targetItem.focus();
                        else urlInputRef.current?.focus();
                      }
                    }}
                    onBlur={(e) => {
                      // Don't close dropdown if focus is moving to dropdown items
                      // Only close if clicking outside completely
                      if (
                        !e.relatedTarget ||
                        !e.relatedTarget.hasAttribute("data-dropdown-item")
                      ) {
                        setTimeout(() => setIsUrlDropdownOpen(false), 150);
                      }
                      // Done selecting text
                      setIsSelectingText(false);
                    }}
                    onFocus={() => {
                      // Select all text when focused
                      if (!isSelectingText) {
                        setIsSelectingText(true);
                        setTimeout(() => {
                          try {
                            if (urlInputRef.current) {
                              urlInputRef.current.select();
                            }
                          } catch (e) {
                            // Some mobile browsers throw on programmatic select
                            console.debug(
                              "[IE] Could not select input text:",
                              e
                            );
                          }
                        }, 0);
                      }

                      // Always call handleFilterSuggestions - it will handle empty URL case
                      handleFilterSuggestions(localUrl);
                      setIsUrlDropdownOpen(true);
                    }}
                    className={`flex-1 pl-2 pr-8 ${
                      isXpTheme
                        ? "!text-[11px]"
                        : currentTheme === "macosx"
                        ? "!text-[12px] h-[26px]"
                        : "!text-[16px]"
                    } `}
                    style={
                      currentTheme === "macosx"
                        ? {
                            paddingTop: "2px",
                            paddingBottom: "2px",
                          }
                        : undefined
                    }
                    placeholder="Enter URL"
                    spellCheck="false"
                    autoComplete="off"
                    autoCapitalize="off"
                  />
                  {isUrlDropdownOpen &&
                    filteredSuggestions.length > 0 &&
                    // Show dropdown if we have suggestions and either:
                    // 1. URL is empty (showing our favorites) or
                    // 2. There isn't just one exact match
                    (localUrl.trim() === "" ||
                      !(
                        filteredSuggestions.length === 1 &&
                        normalizeUrlInline(filteredSuggestions[0].url) ===
                          normalizeUrlInline(localUrl)
                      )) && (
                      <div
                        style={dropdownStyle}
                        className="absolute top-full left-0 right-0 mt-[2px] bg-white border border-neutral-300 shadow-md rounded-md z-50 max-h-48 overflow-y-auto font-geneva-12"
                        data-dropdown-content
                      >
                        {filteredSuggestions.map((suggestion, index) => (
                          <div
                            key={`${suggestion.type}-${index}`}
                            className="px-2 py-1.5 hover:bg-gray-100 focus:bg-gray-200 cursor-pointer flex items-center gap-2 text-sm outline-none"
                            onClick={() => {
                              setSelectedSuggestionIndex(index);
                              if (suggestion.type === "search") {
                                const searchQuery =
                                  suggestion.url.substring(5); // Remove "bing:"
                                handleNavigateWithHistory(
                                  `https://www.bing.com/search?q=${encodeURIComponent(
                                    searchQuery
                                  )}`,
                                  "current"
                                );
                              } else {
                                handleNavigateWithHistory(
                                  suggestion.url,
                                  suggestion.year
                                );
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (suggestion.type === "search") {
                                  const searchQuery =
                                    suggestion.url.substring(5); // Remove "bing:"
                                  handleNavigateWithHistory(
                                    `https://www.bing.com/search?q=${encodeURIComponent(
                                      searchQuery
                                    )}`,
                                    "current"
                                  );
                                } else {
                                  handleNavigateWithHistory(
                                    suggestion.url,
                                    suggestion.year
                                  );
                                }
                              } else if (e.key === "ArrowDown") {
                                e.preventDefault();
                                const nextItem = e.currentTarget
                                  .nextElementSibling as HTMLElement;
                                if (nextItem) {
                                  setSelectedSuggestionIndex(index + 1);
                                  nextItem.focus();
                                }
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                const prevItem = e.currentTarget
                                  .previousElementSibling as HTMLElement;
                                if (prevItem) {
                                  setSelectedSuggestionIndex(index - 1);
                                  prevItem.focus();
                                } else urlInputRef.current?.focus();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setIsUrlDropdownOpen(false);
                                urlInputRef.current?.focus();
                              }
                            }}
                            onFocus={() => {
                              // Keep dropdown open when focus moves to dropdown items
                              setIsUrlDropdownOpen(true);
                              setSelectedSuggestionIndex(index);
                            }}
                            tabIndex={0}
                            data-dropdown-item
                          >
                            {suggestion.type === "search" ? (
                              <MagnifyingGlass
                                className="w-4 h-4 text-neutral-400"
                                weight="bold"
                              />
                            ) : suggestion.favicon && !isOffline ? (
                              <img
                                src={suggestion.favicon}
                                alt=""
                                className="w-4 h-4"
                                onError={(e) => {
                                  e.currentTarget.src =
                                    "/icons/default/ie-site.png";
                                }}
                              />
                            ) : (
                              <ThemedIcon
                                name="ie-site.png"
                                alt=""
                                className="w-4 h-4 [image-rendering:pixelated]"
                              />
                            )}
                            <div className="flex-1 truncate">
                              <div className="font-medium font-geneva-12 text-[11px]">
                                {suggestion.title}
                                {suggestion.year &&
                                  suggestion.year !== "current" && (
                                    <span className="font-normal text-gray-500 ml-1">
                                      ({suggestion.year})
                                    </span>
                                  )}
                              </div>
                              <div className="font-geneva-12 text-[10px] text-gray-500 truncate">
                                {suggestion.type === "search"
                                  ? "bing.com"
                                  : stripProtocol(suggestion.url)}
                              </div>
                            </div>
                            <div className="font-geneva-12 text-[10px] ml-2 text-gray-500 whitespace-nowrap hidden sm:block">
                              {suggestion.type === "favorite" && "Favorite"}
                              {suggestion.type === "history" && "History"}
                              {suggestion.type === "search" && "Search"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTimeMachineViewOpen(true)}
                        disabled={
                          isFetchingCachedYears || cachedYears.length <= 1
                        }
                        className={`h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2 focus-visible:ring-0 focus-visible:ring-offset-0 ${
                          cachedYears.length > 1
                            ? ""
                            : "opacity-50 cursor-not-allowed"
                        }`}
                        aria-label="Show cached versions (Time Machine)"
                        style={{
                          pointerEvents:
                            cachedYears.length <= 1 ? "none" : "auto",
                        }}
                      >
                        <ClockCounterClockwise
                          className={`h-4 w-4 ${
                            cachedYears.length > 1
                              ? "text-orange-500"
                              : "text-neutral-400"
                          }`}
                          weight="bold"
                        />
                      </Button>
                    </TooltipTrigger>
                    {cachedYears.length > 1 && (
                      <TooltipContent side="bottom">
                        <p>
                          {cachedYears.length} Time Node
                          {cachedYears.length !== 1 ? "s" : ""}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={year}
                    onValueChange={(newYear) => handleNavigate(url, newYear)}
                  >
                    <SelectTrigger
                      className={
                        isXpTheme
                          ? "!text-[11px]"
                          : currentTheme === "macosx"
                          ? "!text-[12px]"
                          : "!text-[16px]"
                      }
                    >
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="px-0">
                      {futureYears.map((y) => (
                        <SelectItem
                          key={y}
                          value={y}
                          className="text-md h-6 px-3 active:bg-gray-900 active:text-white text-blue-600"
                        >
                          {y}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value="current"
                        className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                      >
                        {t("apps.internet-explorer.now")}
                      </SelectItem>
                      {pastYears.map((y) => (
                        <SelectItem
                          key={y}
                          value={y}
                          className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                            parseInt(y) <= 1995 ? "text-blue-600" : ""
                          }`}
                        >
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="relative flex items-center">
                <div
                  ref={favoritesContainerRef}
                  className="overflow-x-auto scrollbar-none relative flex-1"
                >
                  <div className="flex items-center min-w-full w-max">
                    {favorites.map((favorite, index) => {
                      // Check if the favorite is a folder
                      if (favorite.children && favorite.children.length > 0) {
                        return (
                          <DropdownMenu key={index}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                              >
                                <ThemedIcon
                                  name="directory.png"
                                  alt="Folder"
                                  className="w-4 h-4 mr-1 [image-rendering:pixelated]"
                                />
                                <span className="truncate">
                                  {favorite.title}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              sideOffset={4}
                              className="px-0 max-w-xs"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              {favorite.children.map((child) => (
                                <DropdownMenuItem
                                  key={child.url}
                                  onClick={() =>
                                    handleNavigateWithHistory(
                                      normalizeUrlForHistory(child.url!),
                                      child.year
                                    )
                                  }
                                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
                                >
                                  {child.favicon && !isOffline ? (
                                    <img
                                      src={child.favicon}
                                      alt=""
                                      className="w-4 h-4"
                                      onError={(e) => {
                                        e.currentTarget.src =
                                          "/icons/default/ie-site.png";
                                      }}
                                    />
                                  ) : (
                                    <ThemedIcon
                                      name="ie-site.png"
                                      alt=""
                                      className="w-4 h-4 [image-rendering:pixelated]"
                                    />
                                  )}
                                  {child.title}
                                  {child.year && child.year !== "current" && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({child.year})
                                    </span>
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      } else if (favorite.url) {
                        // Render regular favorite button
                        return (
                          <Button
                            key={index}
                            variant="ghost"
                            size="sm"
                            className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                            onClick={(e) => {
                              const normalizedFavUrl = normalizeUrlForHistory(
                                favorite.url!
                              );
                              handleNavigateWithHistory(
                                normalizedFavUrl,
                                favorite.year
                              );
                              e.currentTarget.scrollIntoView({
                                behavior: "smooth",
                                block: "nearest",
                                inline: "nearest",
                              });
                            }}
                          >
                            {favorite.favicon && !isOffline ? (
                              <img
                                src={favorite.favicon}
                                alt="Site"
                                className="w-4 h-4 mr-1"
                                onError={(e) => {
                                  e.currentTarget.src =
                                    "/icons/default/ie-site.png";
                                }}
                              />
                            ) : (
                              <ThemedIcon
                                name="ie-site.png"
                                alt="Site"
                                className="w-4 h-4 mr-1 [image-rendering:pixelated]"
                              />
                            )}
                            <span className="truncate">{favorite.title}</span>
                          </Button>
                        );
                      } else {
                        return null; // Should not happen
                      }
                    })}
                  </div>
                </div>
                {favorites.length > 0 && hasMoreToScroll && (
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none" />
                )}
              </div>
            </div>

            <div className="flex-1 relative bg-white">
              {errorDetails ? (
                renderErrorPage()
              ) : isFutureYear ||
                (mode === "past" &&
                  (isAiLoading || aiGeneratedHtml !== null)) ? (
                <div className="w-full h-full overflow-hidden absolute inset-0 font-geneva-12">
                  <HtmlPreview
                    htmlContent={
                      isAiLoading ? generatedHtml || "" : aiGeneratedHtml || ""
                    }
                    onInteractionChange={() => {}}
                    className="border-none"
                    maxHeight="none"
                    minHeight="100%"
                    initialFullScreen={false}
                    isInternetExplorer={true}
                    isStreaming={
                      isAiLoading && generatedHtml !== aiGeneratedHtml
                    }
                    playElevatorMusic={playElevatorMusic}
                    stopElevatorMusic={stopElevatorMusic}
                    playDingSound={playDingSound}
                    baseUrlForAiContent={url}
                    mode={mode}
                  />
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  src={finalUrl || ""}
                  className="border-0 block"
                  style={{
                    width: "calc(100% + 1px)",
                    height: "calc(100% + 1px)",
                  }}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              )}

              {!isForeground && (
                <div
                  className="absolute inset-0 bg-transparent z-50"
                  onClick={() => bringInstanceToForeground(instanceId)}
                  onMouseDown={() => bringInstanceToForeground(instanceId)}
                  onTouchStart={() => bringInstanceToForeground(instanceId)}
                  onWheel={() => bringInstanceToForeground(instanceId)}
                  onDragStart={() => bringInstanceToForeground(instanceId)}
                  onKeyDown={() => bringInstanceToForeground(instanceId)}
                />
              )}

              <AnimatePresence>
                {(status === "loading" ||
                  isAiLoading ||
                  isFetchingWebsiteContent) && (
                  <motion.div
                    className="absolute top-0 left-0 right-0 bg-white/75 backdrop-blur-sm overflow-hidden z-40"
                    variants={loadingBarVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                  >
                    <div
                      className={`h-full ${
                        isAiLoading && mode === "past" && parseInt(year) <= 1995
                          ? "animate-progress-indeterminate-orange-reverse"
                          : isAiLoading
                          ? "animate-progress-indeterminate-orange"
                          : isFetchingWebsiteContent && mode === "past"
                          ? "animate-progress-indeterminate-green-reverse"
                          : isFetchingWebsiteContent
                          ? "animate-progress-indeterminate-green"
                          : mode === "past" && !isAiLoading
                          ? "animate-progress-indeterminate-reverse"
                          : "animate-progress-indeterminate"
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {(status === "loading" ||
                (isAiLoading && generatedHtml !== aiGeneratedHtml) ||
                isFetchingWebsiteContent) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.15 }}
                  className={`os-status-bar os-status-bar-text font-geneva-12 absolute bottom-0 left-0 right-0 bg-gray-100 text-[10px] px-2 py-1 flex items-center z-50 ${
                    currentTheme === "system7"
                      ? "border-t border-black"
                      : "border-t border-gray-300"
                  }`}
                >
                  <div className="flex-1 truncate">
                    {getDebugStatusMessage()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <InputDialog
            isOpen={isTitleDialogOpen}
            onOpenChange={setTitleDialogOpen}
            onSubmit={handleTitleSubmit}
            title="Add Favorite"
            description="Enter a title for this favorite"
            value={newFavoriteTitle}
            onChange={setNewFavoriteTitle}
          />
          <HelpDialog
            isOpen={isHelpDialogOpen}
            onOpenChange={setHelpDialogOpen}
            helpItems={translatedHelpItems}
            appId="internet-explorer"
          />
          <AboutDialog
            isOpen={isAboutDialogOpen}
            onOpenChange={setAboutDialogOpen}
            metadata={appMetadata}
            appId="internet-explorer"
          />
          <ConfirmDialog
            isOpen={isClearFavoritesDialogOpen}
            onOpenChange={setClearFavoritesDialogOpen}
            onConfirm={handleClearFavorites}
            title="Clear Favorites"
            description="Are you sure you want to clear all favorites?"
          />
          <ConfirmDialog
            isOpen={isClearHistoryDialogOpen}
            onOpenChange={setClearHistoryDialogOpen}
            onConfirm={() => {
              clearHistory();
              setClearHistoryDialogOpen(false);
            }}
            title="Clear History"
            description="Are you sure you want to clear all history?"
          />
          <ConfirmDialog
            isOpen={isResetFavoritesDialogOpen}
            onOpenChange={setResetFavoritesDialogOpen}
            onConfirm={handleResetFavorites}
            title="Reset Favorites"
            description="Are you sure you want to reset favorites to default?"
          />
          <FutureSettingsDialog
            isOpen={isFutureSettingsDialogOpen}
            onOpenChange={setFutureSettingsDialogOpen}
          />
          <TimeMachineView
            isOpen={isTimeMachineViewOpen}
            onClose={() => setTimeMachineViewOpen(false)}
            cachedYears={chronologicallySortedYears}
            currentUrl={url}
            currentSelectedYear={year}
            onSelectYear={(selectedYear) => {
              handleNavigate(url, selectedYear);
            }}
          />
        </WindowFrame>
      </TooltipProvider>

      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="Page"
        itemIdentifier={url}
        secondaryIdentifier={year}
        title={currentPageTitle || url}
        generateShareUrl={ieGenerateShareUrl}
      />
    </>
  );
}
