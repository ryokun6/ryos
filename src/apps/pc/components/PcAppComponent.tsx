import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { PcMenuBar } from "./PcMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { getTranslatedAppName } from "@/utils/i18n";
import { motion } from "framer-motion";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { SquaresFour } from "@phosphor-icons/react";
import { usePcLogic } from "../hooks/usePcLogic";

export function PcAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isResetDialogOpen,
    setIsResetDialogOpen,
    isLoading,
    isScriptLoaded,
    games,
    selectedGame,
    isGameRunning,
    isMouseCaptured,
    isFullScreen,
    currentRenderAspect,
    mouseSensitivity,
    containerRef,
    handleLoadGame,
    handleSaveState,
    handleLoadState,
    handleReset,
    handleSetMouseCapture,
    handleSetFullScreen,
    handleSetRenderAspect,
    handleSetMouseSensitivity,
    handleBackToGames,
  } = usePcLogic({ isWindowOpen, instanceId });

  const menuBar = (
    <PcMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onSaveState={handleSaveState}
      onLoadState={handleLoadState}
      onReset={() => setIsResetDialogOpen(true)}
      onLoadGame={handleLoadGame}
      selectedGame={selectedGame}
      onSetMouseCapture={handleSetMouseCapture}
      onSetFullScreen={handleSetFullScreen}
      onSetRenderAspect={handleSetRenderAspect}
      onSetMouseSensitivity={handleSetMouseSensitivity}
      isMouseCaptured={isMouseCaptured}
      isFullScreen={isFullScreen}
      currentRenderAspect={currentRenderAspect}
      mouseSensitivity={mouseSensitivity}
    />
  );

  if (!isWindowOpen) return null;

  const windowTitle = isGameRunning && selectedGame
    ? selectedGame.name
    : getTranslatedAppName("pc");

  // Grid button for titlebar (back to games). macOS X notitlebar: light icon + shadow. System 7/XP/98: dark icon, no shadow, fixed height.
  const isDarkTitlebar = currentTheme === "macosx";
  const backButton = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (isGameRunning) handleBackToGames();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`shrink-0 w-5 h-5 min-h-5 max-h-5 flex items-center justify-center transition-colors ${
        !isGameRunning
          ? "text-transparent cursor-default"
          : isDarkTitlebar
            ? "text-white/80 hover:text-white cursor-pointer"
            : "text-gray-600 hover:text-gray-800 cursor-pointer"
      }`}
      style={{
        filter: isGameRunning && isDarkTitlebar
          ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
          : undefined,
      }}
      disabled={!isGameRunning}
    >
      <SquaresFour size={14} weight="bold" />
    </button>
  );

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="pc"
        material="notitlebar"
        disableTitlebarAutoHide={true}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        titleBarRightContent={backButton}
      >
        <div className="flex flex-col h-full w-full bg-black">
          {currentTheme === "macosx" && <div className="h-6 shrink-0 bg-black" />}

          <div className="flex-1 relative h-full bg-[#1a1a1a]">
            <div
              id="dosbox"
              ref={containerRef}
              className={`w-full h-full ${isGameRunning ? "block" : "hidden"}`}
              style={{ minHeight: "400px", position: "relative" }}
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="px-4 py-2 rounded bg-black/50 backdrop-blur-sm">
                  <div className="font-geneva-12 text-sm shimmer">
                    {t("apps.pc.loadingGame", { gameName: selectedGame.name })}
                  </div>
                </div>
              </div>
            )}
            {!isGameRunning && (
              <div className="flex flex-col h-full">
                <div className="bg-black px-4 py-2 border-b border-[#3a3a3a]">
                  <div className="flex items-center justify-between">
                    <div className="font-apple-garamond text-white text-lg">
                      {t("apps.pc.virtualPc")}
                    </div>
                    <div className="font-geneva-12 text-gray-400 text-[12px] flex items-center gap-2">
                      {isScriptLoaded ? (
                        t("apps.pc.programsAvailable", { count: games.length })
                      ) : (
                        <>
                          <ActivityIndicator size="xs" className="text-gray-400" />
                          {t("apps.pc.loadingEmulator")}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto flex justify-start md:justify-center w-full">
                  <div
                    className={`games-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 transition-opacity duration-300 w-full ${
                      !isScriptLoaded
                        ? "opacity-50 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    {games.map((game) => (
                      <motion.button
                        key={game.id}
                        onClick={() => handleLoadGame(game)}
                        className="group relative aspect-video rounded overflow-hidden bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.7)] border border-[#3a3a3a] hover:border-[#4a4a4a] w-full h-full"
                        style={{ aspectRatio: "16/9" }}
                        whileTap={{
                          scale: 0.95,
                          y: 0,
                          transition: {
                            type: "spring",
                            duration: 0.15,
                          },
                        }}
                      >
                        <div className="relative w-full h-full">
                          <img
                            src={game.image}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            width={320}
                            height={180}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <span className="text-white font-geneva-12 text-[12px]">
                              {game.name}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="pc"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="pc"
        />
        <ConfirmDialog
          isOpen={isResetDialogOpen}
          onOpenChange={setIsResetDialogOpen}
          onConfirm={handleReset}
          title={t("apps.pc.dialogs.resetVirtualPcTitle")}
          description={t("apps.pc.dialogs.resetVirtualPcDescription")}
        />
      </WindowFrame>
    </>
  );
}
