import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { OfflineEmptyState } from "@/components/shared/OfflineEmptyState";
import { useOffline } from "@/hooks/useOffline";
import { getTranslatedAppName } from "@/utils/i18n";
import { appMetadata } from "../metadata";
import { motion } from "motion/react";
import { useInfinitePcLogic } from "../hooks/useInfinitePcLogic";
import type {
  PcPreset,
  PcLoadProgress,
} from "../hooks/useInfinitePcLogic";
import { PC_PRESETS } from "../hooks/useInfinitePcLogic";
import { usePcLogic } from "@/apps/pc/hooks/usePcLogic";
import type { Game } from "@/stores/usePcStore";
import { InfinitePcMenuBar } from "./InfinitePcMenuBar";
import {
  InfinitePcBrowseHeader,
  type InfinitePcBrowseTab,
} from "./InfinitePcBrowseHeader";
import { InfinitePcGameGridCard } from "./InfinitePcGameGridCard";
import { INFINITE_PC_PRESET_AVERAGE_COLORS } from "../presetAverageColors.generated";
import { getPcPresetName, getPcPresetYear } from "../presetI18n";
import { SquaresFour } from "@phosphor-icons/react";
import { formatBytes } from "@/utils/formatBytes";

function PcLoadingOverlay({
  presetName,
  progress,
  error,
}: {
  presetName: string;
  progress: PcLoadProgress;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { phase, loaded, total } = progress;
  const pct =
    total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
  const indeterminate = total <= 0 || phase === "starting";

  let statusLine: React.ReactNode;
  if (error) {
    statusLine = <span className="text-red-300">{error}</span>;
  } else if (phase === "starting") {
    statusLine = <span className="shimmer">{t("apps.pc.status.connecting")}</span>;
  } else if (phase === "booting") {
    statusLine = <span className="shimmer">{t("apps.pc.status.booting")}</span>;
  } else if (total > 0) {
    statusLine = (
      <span className="text-neutral-300 tabular-nums">
        {formatBytes(loaded)} / {formatBytes(total)} · {pct}%
      </span>
    );
  } else {
    statusLine = <span className="shimmer">{t("apps.pc.status.loading")}</span>;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-2.5 w-[min(280px,70%)] text-center">
        <div className="font-geneva-12 text-[12px] text-white">
          {presetName}
        </div>
        <div className="w-full h-[2px] rounded-full bg-white/10 overflow-hidden relative">
          {indeterminate ? (
            <div className="h-full animate-progress-indeterminate-white" />
          ) : (
            <div
              className="h-full bg-white/80 transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className="font-geneva-12 text-[10px] text-neutral-400 min-h-[12px]">
          {statusLine}
        </div>
      </div>
    </div>
  );
}

const FALLBACK_RGB = "169,175,190";

function PresetGridCard({
  preset,
  onSelect,
}: {
  preset: PcPreset;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const [thumbError, setThumbError] = useState(false);
  const showThumb = !!preset.image && !thumbError;
  const textShadow = "0 1px 3px rgba(0,0,0,0.95)";
  const rgb =
    INFINITE_PC_PRESET_AVERAGE_COLORS[preset.id] ?? preset.rgb ?? FALLBACK_RGB;
  const bgColor = `rgb(${rgb})`;
  const overlayColor = `rgba(${rgb},0.5)`;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 w-full flex flex-col shrink-0 h-[100px] [box-shadow:0_4px_12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] hover:[box-shadow:0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]"
      whileTap={{
        scale: 0.97,
        y: 0,
        transition: { type: "spring", duration: 0.15 },
      }}
    >
      {/*
        Card has a fixed height; the image fills the full card via
        `flex-1` + `object-cover`, cropping the thumbnail rather than
        constraining the card to the OS's native aspect ratio.
      */}
      <div
        className="w-full flex-1 min-h-0 relative shrink-0 overflow-hidden"
        style={{ backgroundColor: bgColor }}
      >
        {showThumb ? (
          <img
            src={preset.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top opacity-80 transition-all duration-[800ms] ease-out group-hover:scale-105 group-hover:opacity-100"
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
          {getPcPresetName(preset, t)}
        </span>
        <span
          className="text-neutral-300 text-[10px] shrink-0 opacity-100 @md:opacity-0 transition-opacity duration-200 @md:group-hover:opacity-100"
          style={{ textShadow }}
        >
          {getPcPresetYear(preset, t)}
        </span>
      </div>
    </motion.button>
  );
}

export function InfinitePcAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const [browseTab, setBrowseTab] = useState<InfinitePcBrowseTab>("os");

  const {
    t,
    translatedHelpItems,
    currentTheme,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedPreset,
    isEmulatorLoaded,
    loadProgress,
    loadError,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handleIframeLoad,
    handleFullScreen,
    handleCaptureScreenshot,
  } = useInfinitePcLogic({ isWindowOpen, instanceId });

  const {
    isResetDialogOpen,
    setIsResetDialogOpen,
    isLoading: isGameLoading,
    isScriptLoaded,
    games,
    selectedGame,
    isGameRunning,
    isMouseCaptured,
    isFullScreen: isDosFullScreen,
    currentRenderAspect,
    mouseSensitivity,
    containerRef,
    handleLoadGame,
    handleSaveState,
    handleLoadState,
    handleReset,
    handleSetMouseCapture,
    handleSetFullScreen: handleSetDosFullScreen,
    handleSetRenderAspect,
    handleSetMouseSensitivity,
    handleBackToGames,
  } = usePcLogic({ isWindowOpen, instanceId });

  const inSession = !!selectedPreset || isGameRunning;
  const isOffline = useOffline();

  const handleBackToBrowse = useCallback(() => {
    if (selectedPreset) handleBackToPresets();
    if (isGameRunning) void handleBackToGames();
  }, [handleBackToGames, handleBackToPresets, isGameRunning, selectedPreset]);

  const onPickPreset = useCallback(
    (preset: PcPreset) => {
      if (isGameRunning) void handleBackToGames();
      handleSelectPreset(preset);
    },
    [handleBackToGames, handleSelectPreset, isGameRunning]
  );

  const onPickGame = useCallback(
    (game: Game) => {
      if (selectedPreset) handleBackToPresets();
      void handleLoadGame(game);
    },
    [handleBackToPresets, handleLoadGame, selectedPreset]
  );

  const menuBar = (
    <InfinitePcMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onBackToBrowse={handleBackToBrowse}
      onFullScreen={handleFullScreen}
      onCaptureScreenshot={handleCaptureScreenshot}
      hasV86Session={!!selectedPreset}
      isGameRunning={isGameRunning}
      onSaveState={handleSaveState}
      onLoadState={handleLoadState}
      onReset={() => setIsResetDialogOpen(true)}
      onLoadGame={onPickGame}
      selectedGame={selectedGame}
      onSetMouseCapture={handleSetMouseCapture}
      onSetDosFullScreen={handleSetDosFullScreen}
      onSetRenderAspect={handleSetRenderAspect}
      onSetMouseSensitivity={handleSetMouseSensitivity}
      isMouseCaptured={isMouseCaptured}
      isDosFullScreen={isDosFullScreen}
      currentRenderAspect={currentRenderAspect}
      mouseSensitivity={mouseSensitivity}
    />
  );

  if (!isWindowOpen) return null;

  // Browse grid has its own header, so the window titlebar shows nothing there;
  // only the running OS preset / game name appears in the titlebar in-session.
  const windowTitle = selectedPreset
    ? getPcPresetName(selectedPreset, t)
    : isGameRunning && selectedGame
      ? selectedGame.name
      : "";

  const isDarkTitlebar = currentTheme === "macosx";
  const backButton = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (inSession) handleBackToBrowse();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`shrink-0 w-5 h-5 min-h-5 max-h-5 flex items-center justify-center transition-colors ${
        !inSession
          ? "text-transparent cursor-default"
          : isDarkTitlebar
            ? "text-white/80 hover:text-white cursor-pointer"
            : "text-neutral-600 hover:text-neutral-800 cursor-pointer"
      }`}
      style={{
        filter: inSession && isDarkTitlebar
          ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
          : undefined,
      }}
      disabled={!inSession}
    >
      <SquaresFour size={14} weight="bold" />
    </button>
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "pc",
        material: "notitlebar",
        disableTitlebarAutoHide: true,
        skipInitialSound,
        instanceId,
        titleBarRightContent: backButton,
      }}
    >
        <div className="flex flex-col flex-1 min-h-0 w-full bg-black">
          {currentTheme === "macosx" && <div className="h-6 shrink-0 bg-black" />}
          <div className="flex flex-col flex-1 min-h-0 relative bg-[#1a1a1a]">
            <div
              id="pc-dosbox"
              ref={containerRef}
              className={`w-full h-full absolute inset-0 z-[2] ${
                isGameRunning ? "block" : "hidden"
              }`}
              style={{ minHeight: "400px" }}
            />
            {isGameRunning && isGameLoading && (
              <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/50">
                <div className="px-4 py-2 rounded bg-black/50 backdrop-blur-sm">
                  <div className="font-geneva-12 text-sm shimmer">
                    {t("apps.pc.loadingGame", { gameName: selectedGame.name })}
                  </div>
                </div>
              </div>
            )}

            {selectedPreset && embedUrl ? (
              <>
                <iframe
                  ref={iframeRef}
                  src={embedUrl}
                  allow="cross-origin-isolated; fullscreen; gamepad; geolocation; clipboard-read; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allowfullscreen"
                  className="border-0 block absolute inset-0 z-[1]"
                  style={{
                    width: "calc(100% + 1px)",
                    height: "calc(100% + 1px)",
                    margin: 0,
                    padding: 0,
                  }}
                  onLoad={handleIframeLoad}
                />
                {/* A running emulator keeps working from cached data, so
                    only surface the offline state while it hasn't loaded. */}
                {!isEmulatorLoaded && selectedPreset && isOffline && (
                  <div className="absolute inset-0 z-[3] bg-black">
                    <OfflineEmptyState
                      appName={getTranslatedAppName("pc")}
                      appearance="dark"
                    />
                  </div>
                )}
                {!isEmulatorLoaded && selectedPreset && !isOffline && (
                  <PcLoadingOverlay
                    presetName={getPcPresetName(selectedPreset, t)}
                    progress={loadProgress}
                    error={loadError}
                  />
                )}
              </>
            ) : !isGameRunning && isOffline ? (
              <OfflineEmptyState
                appName={getTranslatedAppName("pc")}
                appearance="dark"
              />
            ) : !isGameRunning ? (
              <div className="flex flex-col flex-1 min-h-0 relative z-0">
                <InfinitePcBrowseHeader
                  tab={browseTab}
                  onTabChange={setBrowseTab}
                  osCount={PC_PRESETS.length}
                  gamesCount={games.length}
                  gamesReady={isScriptLoaded}
                />

                <div className="flex-1 min-h-0 overflow-y-auto flex justify-start @md:justify-center items-start w-full p-4 @container">
                  {browseTab === "os" ? (
                    <div className="preset-grid grid grid-cols-1 @md:grid-cols-3 gap-2 content-start w-full max-w-md @md:max-w-none self-start pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0">
                      {PC_PRESETS.map((preset) => (
                        <PresetGridCard
                          key={preset.id}
                          preset={preset}
                          onSelect={() => onPickPreset(preset)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`games-grid grid grid-cols-1 @md:grid-cols-3 gap-2 content-start w-full max-w-4xl self-start pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0 transition-opacity duration-300 ${
                        !isScriptLoaded
                          ? "opacity-50 pointer-events-none"
                          : "opacity-100"
                      }`}
                    >
                      {games.map((game) => (
                        <InfinitePcGameGridCard
                          key={game.id}
                          game={game}
                          onSelect={() => onPickGame(game)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <AppHelpAboutDialogs
          appId="pc"
          helpItems={translatedHelpItems}
          metadata={appMetadata}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
        <ConfirmDialog
          isOpen={isResetDialogOpen}
          onOpenChange={setIsResetDialogOpen}
          onConfirm={handleReset}
          title={t("apps.pc.dialogs.resetVirtualPcTitle")}
          description={t("apps.pc.dialogs.resetVirtualPcDescription")}
        />
    </AppWindowShell>
  );
}
