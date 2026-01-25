import { useState } from "react";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { motion } from "framer-motion";
import { useInfiniteMacLogic } from "../hooks/useInfiniteMacLogic";
import type { MacPreset } from "../hooks/useInfiniteMacLogic";
import { InfiniteMacMenuBar } from "./InfiniteMacMenuBar";
import { MAC_PRESETS } from "../hooks/useInfiniteMacLogic";
import { PRESET_AVERAGE_COLORS } from "../presetAverageColors.generated";
import { SquaresFour } from "@phosphor-icons/react";

const FALLBACK_RGB = "169,175,190";

function PresetGridCard({
  preset,
  onSelect,
}: {
  preset: MacPreset;
  onSelect: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);
  const showThumb = !thumbError;
  const textShadow = "0 1px 3px rgba(0,0,0,0.95)";
  const rgb = PRESET_AVERAGE_COLORS[preset.id] ?? FALLBACK_RGB;
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
          aspectRatio: `${preset.screenSize.width} / ${preset.screenSize.height}`,
          backgroundColor: bgColor,
        }}
      >
        {showThumb ? (
          <img
            src={preset.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top origin-top-left opacity-80 transition-[transform_800ms_ease-out,opacity_200ms_ease-out] group-hover:scale-115 group-hover:opacity-100"
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
          {preset.name}
        </span>
        <span
          className="text-neutral-300 text-[10px] shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ textShadow }}
        >
          {preset.year}
        </span>
      </div>
    </motion.button>
  );
}

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
        <div className="flex flex-col flex-1 min-h-0 w-full bg-black">
          {currentTheme === "macosx" && <div className="h-6 shrink-0 bg-black" />}
          <div className="flex flex-col flex-1 min-h-0 relative bg-[#1a1a1a]">
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
              <div className="flex flex-col flex-1 min-h-0">
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

                <div className="flex-1 min-h-0 overflow-y-auto flex justify-start @md:justify-center w-full p-4 @container">
                  <div className="preset-grid grid grid-cols-1 @md:grid-cols-3 gap-2 w-full max-w-4xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0">
                    {MAC_PRESETS.map((preset) => (
                      <PresetGridCard
                        key={preset.id}
                        preset={preset}
                        onSelect={() => handleSelectPreset(preset)}
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
