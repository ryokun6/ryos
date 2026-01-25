import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { motion } from "framer-motion";
import { useInfiniteMacLogic } from "../hooks/useInfiniteMacLogic";
import { InfiniteMacMenuBar } from "./InfiniteMacMenuBar";
import { MAC_PRESETS } from "../hooks/useInfiniteMacLogic";
import { SquaresFour } from "@phosphor-icons/react";

export function InfiniteMacAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
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
    selectedPreset,
    isEmulatorLoaded,
    isPaused,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handlePause,
    handleUnpause,
    handleIframeLoad,
  } = useInfiniteMacLogic({ isWindowOpen, instanceId });

  const menuBar = (
    <InfiniteMacMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onBackToPresets={handleBackToPresets}
      onPause={handlePause}
      onUnpause={handleUnpause}
      hasEmulator={!!selectedPreset}
      isPaused={isPaused}
    />
  );

  if (!isWindowOpen) return null;

  // Dynamic title based on selected preset
  const windowTitle = selectedPreset
    ? selectedPreset.name
    : t("apps.infinite-mac.title");

  // Grid button for titlebar (back to systems). macOS X notitlebar: light icon + shadow. System 7/XP/98: dark icon, no shadow, fixed height.
  const isDarkTitlebar = currentTheme === "macosx";
  const backButton = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (selectedPreset) handleBackToPresets();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`shrink-0 w-5 h-5 min-h-5 max-h-5 flex items-center justify-center transition-colors ${
        !selectedPreset
          ? "text-transparent cursor-default"
          : isDarkTitlebar
            ? "text-white/80 hover:text-white cursor-pointer"
            : "text-gray-600 hover:text-gray-800 cursor-pointer"
      }`}
      style={{
        filter: selectedPreset && isDarkTitlebar
          ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
          : undefined,
      }}
      disabled={!selectedPreset}
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
        appId="infinite-mac"
        material="notitlebar"
        disableTitlebarAutoHide={true}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        titleBarRightContent={backButton}
      >
        <div className="flex flex-col h-full w-full bg-black">
          {currentTheme === "macosx" && <div className="h-6 shrink-0 bg-black" />}
          <div className="flex-1 relative h-full bg-[#1a1a1a]">
            {selectedPreset && embedUrl ? (
              <>
                <iframe
                  ref={iframeRef}
                  src={embedUrl}
                  allow="cross-origin-isolated"
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                  className="border-0 block absolute inset-0"
                  style={{
                    width: "calc(100% + 1px)",
                    height: "calc(100% + 1px)",
                    margin: 0,
                    padding: 0,
                  }}
                  onLoad={handleIframeLoad}
                />
                {!isEmulatorLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="px-4 py-2 rounded bg-black/50 backdrop-blur-sm">
                      <div className="font-geneva-12 text-sm text-white">
                        {t("apps.infinite-mac.loadingEmulator")}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col h-full">
                <div className="bg-black px-4 py-2 border-b border-[#3a3a3a] shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="font-apple-garamond text-white text-lg">
                      {t("apps.infinite-mac.title")}
                    </div>
                    <div className="font-geneva-12 text-gray-400 text-[12px]">
                      {t("apps.infinite-mac.systemsAvailable", {
                        count: MAC_PRESETS.length,
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto flex justify-start md:justify-center w-full">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 w-full max-w-4xl">
                    {MAC_PRESETS.map((preset) => (
                      <motion.button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className="group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.7)] border border-neutral-700 hover:border-neutral-600 w-full p-3"
                        whileTap={{
                          scale: 0.97,
                          y: 0,
                          transition: {
                            type: "spring",
                            duration: 0.15,
                          },
                        }}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="text-white font-apple-garamond text-base">
                            {preset.name}
                          </span>
                          <span className="text-neutral-500 text-[10px]">
                            {preset.year}
                          </span>
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
          appId="infinite-mac"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="infinite-mac"
        />
      </WindowFrame>
    </>
  );
}
