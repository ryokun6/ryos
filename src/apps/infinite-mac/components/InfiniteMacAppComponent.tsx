import { useMemo } from "react";
import { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { appMetadata } from "../metadata";
import { useInfiniteMacLogic } from "../hooks/useInfiniteMacLogic";
import { InfiniteMacMenuBar } from "./InfiniteMacMenuBar";
import { MAC_PRESETS } from "../hooks/useInfiniteMacLogic";
import { PRESET_AVERAGE_COLORS } from "../presetAverageColors.generated";
import { EmulatorPresetGrid } from "@/apps/shared-emulator/EmulatorPresetGrid";
import { SquaresFour } from "@phosphor-icons/react";

const FALLBACK_RGB = "169,175,190";

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
    currentScale,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handlePause,
    handleUnpause,
    handleSetScale,
    handleCaptureScreenshot,
    handleIframeLoad,
  } = useInfiniteMacLogic({ isWindowOpen, instanceId });

  const presetCards = useMemo(
    () =>
      MAC_PRESETS.map((preset) => ({
        id: preset.id,
        name: preset.name,
        year: preset.year,
        image: preset.image,
        rgb: PRESET_AVERAGE_COLORS[preset.id] ?? FALLBACK_RGB,
        screenSize: preset.screenSize,
      })),
    []
  );

  const menuBar = (
    <InfiniteMacMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onBackToPresets={handleBackToPresets}
      onPause={handlePause}
      onUnpause={handleUnpause}
      onSetScale={handleSetScale}
      onCaptureScreenshot={handleCaptureScreenshot}
      hasEmulator={!!selectedPreset}
      isPaused={isPaused}
      currentScale={currentScale}
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
            : "text-neutral-600 hover:text-neutral-800 cursor-pointer"
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
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "infinite-mac",
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
                {!isEmulatorLoaded && selectedPreset && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="px-4 py-2 rounded bg-black/50 backdrop-blur-sm">
                      <div className="font-geneva-12 text-sm shimmer">
                        {t("apps.infinite-mac.loadingSystem", {
                          name: selectedPreset.name,
                          defaultValue: `Loading ${selectedPreset.name}...`,
                        })}
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
                    <div className="font-geneva-12 text-neutral-400 text-[12px]">
                      {t("apps.infinite-mac.systemsAvailable", {
                        count: MAC_PRESETS.length,
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto flex justify-start @md:justify-center w-full p-4 @container">
                  <EmulatorPresetGrid
                    presets={presetCards}
                    layout="aspect-ratio"
                    onSelectPreset={(presetId) => {
                      const preset = MAC_PRESETS.find((p) => p.id === presetId);
                      if (preset) handleSelectPreset(preset);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <AppHelpAboutDialogs
          appId="infinite-mac"
          helpItems={translatedHelpItems}
          metadata={appMetadata}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
    </AppWindowShell>
  );
}
