import { AppProps, InternetExplorerInitialData } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { InternetExplorerMenuBar } from "../InternetExplorerMenuBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { useInternetExplorerLogic } from "../../hooks/useInternetExplorerLogic";
import { InternetExplorerToolbar } from "./InternetExplorerToolbar";
import { InternetExplorerContentPane } from "./InternetExplorerContentPane";
import { InternetExplorerAppDialogs } from "./InternetExplorerAppDialogs";

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
  const logic = useInternetExplorerLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
    helpItems,
  });

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
    getDebugStatusMessage,
  } = logic;

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
      language={logic.language}
      location={logic.location}
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
          <div className="flex flex-col size-full relative">
            <InternetExplorerToolbar
              isXpTheme={isXpTheme}
              currentTheme={currentTheme}
              isOffline={isOffline}
              historyIndex={historyIndex}
              historyLength={history.length}
              url={url}
              year={year}
              pastYears={pastYears}
              futureYears={futureYears}
              favorites={favorites}
              hasMoreToScroll={hasMoreToScroll}
              urlInputRef={urlInputRef}
              favoritesContainerRef={favoritesContainerRef}
              localUrl={localUrl}
              isUrlDropdownOpen={isUrlDropdownOpen}
              filteredSuggestions={filteredSuggestions}
              selectedSuggestionIndex={selectedSuggestionIndex}
              dropdownStyle={dropdownStyle}
              cachedYears={cachedYears}
              isFetchingCachedYears={isFetchingCachedYears}
              isSelectingText={isSelectingText}
              t={t}
              setLocalUrl={setLocalUrl}
              setUrl={setUrl}
              setIsUrlDropdownOpen={setIsUrlDropdownOpen}
              setIsSelectingText={setIsSelectingText}
              setSelectedSuggestionIndex={setSelectedSuggestionIndex}
              setTimeMachineViewOpen={setTimeMachineViewOpen}
              stripProtocol={stripProtocol}
              isValidUrl={isValidUrl}
              normalizeUrlInline={normalizeUrlInline}
              normalizeUrlForHistory={normalizeUrlForHistory}
              handleFilterSuggestions={handleFilterSuggestions}
              handleNavigate={handleNavigate}
              handleNavigateWithHistory={handleNavigateWithHistory}
              handleGoBack={handleGoBack}
              handleGoForward={handleGoForward}
              handleSharePage={handleSharePage}
            />

            <InternetExplorerContentPane
              errorDetails={errorDetails}
              url={url}
              year={year}
              mode={mode}
              finalUrl={finalUrl}
              isFutureYear={isFutureYear}
              isAiLoading={isAiLoading}
              aiGeneratedHtml={aiGeneratedHtml}
              generatedHtml={generatedHtml}
              status={status}
              isFetchingWebsiteContent={isFetchingWebsiteContent}
              isForeground={!!isForeground}
              currentTheme={currentTheme}
              iframeRef={iframeRef}
              loadingBarVariants={loadingBarVariants}
              playElevatorMusic={playElevatorMusic}
              stopElevatorMusic={stopElevatorMusic}
              playDingSound={playDingSound}
              getDebugStatusMessage={getDebugStatusMessage}
              handleGoBack={handleGoBack}
              handleNavigate={handleNavigate}
              handleIframeLoad={handleIframeLoad}
              handleIframeError={handleIframeError}
              bringInstanceToForeground={bringInstanceToForeground}
              instanceId={instanceId}
            />
          </div>

          <InternetExplorerAppDialogs
            isTitleDialogOpen={isTitleDialogOpen}
            newFavoriteTitle={newFavoriteTitle}
            isHelpDialogOpen={isHelpDialogOpen}
            isAboutDialogOpen={isAboutDialogOpen}
            isClearFavoritesDialogOpen={isClearFavoritesDialogOpen}
            isClearHistoryDialogOpen={isClearHistoryDialogOpen}
            isResetFavoritesDialogOpen={isResetFavoritesDialogOpen}
            isFutureSettingsDialogOpen={isFutureSettingsDialogOpen}
            isTimeMachineViewOpen={isTimeMachineViewOpen}
            translatedHelpItems={translatedHelpItems}
            url={url}
            year={year}
            chronologicallySortedYears={chronologicallySortedYears}
            setTitleDialogOpen={setTitleDialogOpen}
            setNewFavoriteTitle={setNewFavoriteTitle}
            setHelpDialogOpen={setHelpDialogOpen}
            setAboutDialogOpen={setAboutDialogOpen}
            setClearFavoritesDialogOpen={setClearFavoritesDialogOpen}
            setClearHistoryDialogOpen={setClearHistoryDialogOpen}
            setResetFavoritesDialogOpen={setResetFavoritesDialogOpen}
            setFutureSettingsDialogOpen={setFutureSettingsDialogOpen}
            setTimeMachineViewOpen={setTimeMachineViewOpen}
            handleTitleSubmit={handleTitleSubmit}
            handleClearFavorites={handleClearFavorites}
            handleResetFavorites={handleResetFavorites}
            clearHistory={clearHistory}
            handleNavigate={handleNavigate}
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
