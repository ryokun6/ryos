import { useState } from "react";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { PcMenuBar } from "./PcMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "../metadata";
import { getTranslatedAppName } from "@/utils/i18n";
import { motion } from "framer-motion";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { SquaresFour } from "@phosphor-icons/react";
import { usePcLogic } from "../hooks/usePcLogic";
import type { Game } from "@/stores/usePcStore";
import { GAME_AVERAGE_COLORS } from "../gameAverageColors.generated";

const FALLBACK_RGB = "169,175,190";

function GameGridCard({
  game,
  onSelect,
}: {
  game: Game;
  onSelect: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);
  const showThumb = !thumbError;
  const textShadow = "0 2px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.8)";
  const rgb = GAME_AVERAGE_COLORS[game.id] ?? FALLBACK_RGB;
  const bgColor = `rgb(${rgb})`;
  const overlayColor = `rgba(${rgb},0.5)`;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 w-full flex flex-col min-h-[100px] @md:min-h-0 [box-shadow:0_4px_12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] hover:[box-shadow:0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]"
      whileTap={{
        scale: 0.97,
        y: 0,
        transition: { type: "spring", duration: 0.15 },
      }}
    >
      <div
        className="w-full flex-1 min-h-0 relative shrink-0 overflow-hidden"
        style={{
          aspectRatio: "16/9",
          backgroundColor: bgColor,
        }}
      >
        {showThumb ? (
          <img
            src={game.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-[800ms] ease-out group-hover:scale-105"
            onError={() => setThumbError(true)}
          />
        ) : null}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-20"
          style={{ backgroundColor: overlayColor }}
          aria-hidden
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `linear-gradient(to top, ${bgColor} 0%, transparent 55%)`,
        }}
        aria-hidden
      />
      <div className="absolute bottom-0 left-2 right-2 pt-2 pb-2 flex flex-col items-start gap-0.5 @md:flex-row @md:justify-between @md:items-baseline z-10 pointer-events-none">
        <span
          className="text-white font-apple-garamond !text-[18px] leading-tight truncate max-w-full"
          style={{ textShadow }}
        >
          {game.name}
        </span>
        <span
          className="text-neutral-300 text-[10px] shrink-0 opacity-100 @md:opacity-0 transition-opacity duration-200 @md:group-hover:opacity-100"
          style={{ textShadow }}
        >
          {game.year}
        </span>
      </div>
    </motion.button>
  );
}

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

                <div className="flex-1 min-h-0 overflow-y-auto flex justify-start @md:justify-center w-full p-4 @container">
                  <div
                    className={`games-grid grid grid-cols-1 @md:grid-cols-3 gap-2 w-full max-w-4xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0 transition-opacity duration-300 ${
                      !isScriptLoaded
                        ? "opacity-50 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    {games.map((game) => (
                      <GameGridCard
                        key={game.id}
                        game={game}
                        onSelect={() => handleLoadGame(game)}
                      />
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
