import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import { PhotoBoothMenuBar } from "./PhotoBoothMenuBar";
import { AppProps } from "../../base/types";
import { Camera, Images, Timer } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { Webcam } from "@/components/Webcam";
import { cn } from "@/lib/utils";
import { usePhotoBoothLogic } from "../hooks/usePhotoBoothLogic";

// Aqua-style shine overlay for macOS X theme (dark glass style)
function AquaShineOverlay() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        top: "2px",
        height: "35%",
        width: "calc(100% - 16px)",
        borderRadius: "100px",
        background:
          "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
        filter: "blur(0.5px)",
        zIndex: 2,
      }}
    />
  );
}

export function PhotoBoothComponent({
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
    showHelp,
    setShowHelp,
    showAbout,
    setShowAbout,
    showEffects,
    setShowEffects,
    showPhotoStrip,
    currentEffectsPage,
    cssFilters,
    distortionFilters,
    effects,
    selectedEffect,
    setSelectedEffect,
    availableCameras,
    selectedCameraId,
    isBackCamera,
    stream,
    cameraError,
    isLoadingCamera,
    isMultiPhotoMode,
    multiPhotoCount,
    isFlashing,
    lastPhoto,
    showThumbnail,
    newPhotoIndex,
    validPhotos,
    getPhotoPreviewSrc,
    isInitialLoad,
    isXpTheme,
    isMacTheme,
    windowTitle,
    handleClearPhotos,
    handleExportPhotos,
    handleCameraSelect,
    handlePhoto,
    startMultiPhotoSequence,
    toggleEffects,
    togglePhotoStrip,
    toggleEffectsPage,
    swipeHandlers,
    triggerCapture,
  } = usePhotoBoothLogic({ isWindowOpen, isForeground });

  const menuBar = (
    <PhotoBoothMenuBar
      onClose={onClose}
      onShowHelp={() => setShowHelp(true)}
      onShowAbout={() => setShowAbout(true)}
      onClearPhotos={handleClearPhotos}
      onExportPhotos={handleExportPhotos}
      effects={effects}
      selectedEffect={selectedEffect}
      onEffectSelect={setSelectedEffect}
      availableCameras={availableCameras}
      selectedCameraId={selectedCameraId}
      onCameraSelect={handleCameraSelect}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="photo-booth"
        material="notitlebar"
        disableTitlebarAutoHide
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col w-full h-full bg-neutral-500 max-h-full overflow-hidden">
          {/* Camera view area - takes available space but doesn't overflow */}
          <div
            className={`flex-1 min-h-0 relative ${
              !stream || isLoadingCamera || cameraError
                ? "pointer-events-none opacity-50"
                : ""
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Webcam
                onPhoto={(photoDataUrl) => {
                  // Only process if not in preview
                  if (photoDataUrl) {
                    handlePhoto(photoDataUrl);
                  }
                }}
                className="w-full h-full"
                filter={selectedEffect.filter}
                selectedCameraId={selectedCameraId}
                stream={stream}
                autoStart={false}
                isBackCamera={isBackCamera}
              />

              {/* Camera flash effect */}
              <AnimatePresence>
                {isFlashing && (
                  <motion.div
                    className="absolute inset-0 bg-white"
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                  />
                )}
              </AnimatePresence>

              {/* Multi-photo countdown overlay */}
              <AnimatePresence>
                {isMultiPhotoMode && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="text-8xl font-bold text-white drop-shadow-lg">
                      {multiPhotoCount < 4 ? 4 - multiPhotoCount : ""}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Effects overlay */}
              <AnimatePresence>
                {showEffects && (
                  <motion.div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...swipeHandlers}
                  >
                    <motion.div
                      className="grid grid-cols-3 gap-4 p-4 w-full max-w-4xl max-h-[calc(100%-40px)] overflow-auto"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                      }}
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      {(currentEffectsPage === 0
                        ? cssFilters
                        : distortionFilters
                      ).map((effect) => (
                        <motion.div
                          key={effect.name}
                          className={`relative aspect-video overflow-hidden rounded-lg cursor-pointer border-2 ${
                            selectedEffect.name === effect.name
                              ? "border-white"
                              : "border-transparent"
                          }`}
                          whileHover={{
                            scale: 1.05,
                            transition: { duration: 0.15 },
                          }}
                          whileTap={{
                            scale: 0.95,
                            transition: { duration: 0.1 },
                          }}
                          onClick={() => {
                            setSelectedEffect(effect);
                            setShowEffects(false);
                          }}
                        >
                          <Webcam
                            isPreview
                            filter={effect.filter}
                            className="w-full h-full"
                            sharedStream={stream}
                            autoStart={false}
                            isBackCamera={isBackCamera}
                          />
                          <div
                            className="absolute bottom-0 left-0 right-0 text-center py-1.5 text-white font-geneva-12 text-[12px]"
                            style={{
                              textShadow:
                                "0px 0px 2px black, 0px 0px 2px black, 0px 0px 2px black",
                            }}
                          >
                            {t(
                              `apps.photo-booth.effects.${effect.translationKey}`
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Pagination dots - smaller with less space */}
                    <div className="flex items-center justify-center mt-2 space-x-2">
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(0)}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            currentEffectsPage === 0
                              ? "bg-white"
                              : "bg-white/40"
                          }`}
                        />
                      </button>
                      <button
                        className="text-white rounded-full p-0.5 hover:bg-white/10"
                        onClick={() => toggleEffectsPage(1)}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            currentEffectsPage === 1
                              ? "bg-white"
                              : "bg-white/40"
                          }`}
                        />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Photo strip preview - positioned in camera view area, but above bottom controls */}
              <AnimatePresence mode="wait">
                {showPhotoStrip && validPhotos.length > 0 && !isInitialLoad && (
                  <motion.div
                    className="absolute bottom-0 inset-x-0 w-full bg-white/40 backdrop-blur-sm p-1 overflow-x-auto"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 50, opacity: 0 }}
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: 0.2,
                    }}
                  >
                    <div className="flex flex-row space-x-1 h-20 w-max">
                      {[...validPhotos].reverse().map((photo, index) => {
                        // Calculate the original index (before reversing)
                        const originalIndex = validPhotos.length - 1 - index;
                        // Check if this is the new photo that was just added
                        const isNewPhoto = originalIndex === newPhotoIndex;

                        const previewSrc = getPhotoPreviewSrc(photo);
                        if (!previewSrc) return null;

                        return (
                          <motion.div
                            key={`photo-${photo.filename}`}
                            className="h-full flex-shrink-0"
                            initial={
                              isNewPhoto
                                ? { scale: 0.5, opacity: 0 }
                                : { opacity: 1, scale: 1 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            layout
                            transition={{
                              type: "spring",
                              damping: 25,
                              stiffness: 400,
                              duration: isNewPhoto ? 0.4 : 0,
                            }}
                          >
                            <img
                              src={previewSrc}
                              alt={t("apps.photo-booth.ariaLabels.photo", {
                                index: originalIndex,
                              })}
                              className="h-full w-auto object-contain cursor-pointer transition-opacity hover:opacity-80"
                              onClick={() => {
                                // Create an anchor element to download the image
                                const link = document.createElement("a");
                                link.href = previewSrc;
                                link.download = photo.filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Fixed bottom control bar that always takes full width without overflowing */}
          <div className="flex-shrink-0 w-full bg-black/70 backdrop-blur-md px-6 py-4 flex justify-between items-center z-[60]">
            {/* Left buttons wrapper - contains thumbnail animation and button segment */}
            <div className="relative">
              {/* Thumbnail animation - outside the overflow-hidden segment */}
              <AnimatePresence>
                {showThumbnail && lastPhoto && !showPhotoStrip && (
                  <motion.div
                    className="absolute -top-24 left-0 pointer-events-none z-[100]"
                    initial={{ opacity: 0, y: 10, scale: 0.3 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      y: 60,
                      scale: 0.2,
                      x: -16,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                    }}
                    style={{
                      originX: "0",
                      originY: "1",
                    }}
                  >
                    <motion.img
                      src={lastPhoto}
                      alt="Last photo thumbnail"
                      className="h-20 w-auto object-cover rounded-md shadow-md border-2 border-white"
                      initial={{ rotateZ: 0 }}
                      animate={{ rotateZ: 0 }}
                      exit={{ rotateZ: 5 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 10,
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Button segment */}
              <div
                className={cn(
                  "flex relative",
                  isMacTheme
                    ? "overflow-hidden rounded-full shadow-lg px-1 py-1 gap-1"
                    : "space-x-3"
                )}
                style={
                  isMacTheme
                    ? {
                        background:
                          "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                        boxShadow:
                          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                      }
                    : undefined
                }
              >
                {isMacTheme && <AquaShineOverlay />}
                <button
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-white relative overflow-hidden transition-colors focus:outline-none",
                    isMacTheme ? "z-10" : "bg-white/10 hover:bg-white/20",
                    validPhotos.length === 0 && "opacity-50 cursor-not-allowed"
                  )}
                  style={{
                    background: isXpTheme
                      ? "rgba(255, 255, 255, 0.1)"
                      : undefined,
                    border: isXpTheme ? "none" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (isXpTheme) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isXpTheme) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.1)";
                    }
                  }}
                  onClick={togglePhotoStrip}
                  disabled={validPhotos.length === 0}
                >
                  <Images
                    size={18}
                    weight="fill"
                    className={
                      isMacTheme
                        ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                        : ""
                    }
                  />
                </button>
                <button
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-white transition-colors focus:outline-none",
                    isMacTheme ? "z-10" : "bg-white/10 hover:bg-white/20"
                  )}
                  style={{
                    background: isXpTheme
                      ? "rgba(255, 255, 255, 0.1)"
                      : undefined,
                    border: isXpTheme ? "none" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (isXpTheme) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isXpTheme) {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.1)";
                    }
                  }}
                  onClick={startMultiPhotoSequence}
                  disabled={isMultiPhotoMode}
                >
                  <Timer
                    size={18}
                    weight="fill"
                    className={
                      isMacTheme
                        ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                        : ""
                    }
                  />
                </button>
              </div>
            </div>

            {/* Camera capture button */}
            <Button
              onClick={isMultiPhotoMode ? () => {} : triggerCapture}
              className={cn(
                "rounded-full h-14 w-14 [&_svg]:size-6 transition-colors focus:outline-none relative overflow-hidden",
                isMacTheme
                  ? "transition-transform hover:scale-105"
                  : isMultiPhotoMode
                  ? "bg-gray-500 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600"
              )}
              style={
                isMacTheme
                  ? {
                      background: isMultiPhotoMode
                        ? "linear-gradient(rgba(156, 163, 175, 0.9), rgba(107, 114, 128, 0.9))"
                        : "linear-gradient(rgba(254, 150, 150, 0.95), rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))",
                      boxShadow: isMultiPhotoMode
                        ? "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(156, 163, 175, 0.5)"
                        : "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(254, 150, 150, 0.5)",
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
                  : isXpTheme
                  ? {
                      background: isMultiPhotoMode ? "#6b7280" : "#dc2626",
                      border: "none",
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
                  : {
                      cursor: isMultiPhotoMode ? "not-allowed" : "pointer",
                    }
              }
              onMouseEnter={(e) => {
                if (isXpTheme && !isMultiPhotoMode) {
                  e.currentTarget.style.background = "#b91c1c";
                }
              }}
              onMouseLeave={(e) => {
                if (isXpTheme && !isMultiPhotoMode) {
                  e.currentTarget.style.background = "#dc2626";
                }
              }}
              disabled={isMultiPhotoMode}
            >
              {isMacTheme && (
                <>
                  {/* Top shine */}
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: "2px",
                      height: "30%",
                      width: "calc(100% - 28px)",
                      borderRadius: "12px 12px 6px 6px",
                      background:
                        "linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.15))",
                      filter: "blur(0.2px)",
                      zIndex: 2,
                    }}
                  />
                  {/* Bottom glow */}
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                    style={{
                      bottom: "0px",
                      height: "38%",
                      width: "calc(100% - 6px)",
                      borderRadius: "6px 6px 100% 100%",
                      background:
                        "linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0.35))",
                      filter: "blur(0.3px)",
                      zIndex: 1,
                    }}
                  />
                </>
              )}
              <Camera
                weight="fill"
                color="white"
                className={isMacTheme ? "relative z-10" : ""}
              />
            </Button>

            {/* Effects button segment */}
            <div
              className={cn(
                "relative",
                isMacTheme && "overflow-hidden rounded-full shadow-lg px-1 py-1"
              )}
              style={
                isMacTheme
                  ? {
                      background:
                        "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                      boxShadow:
                        "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                    }
                  : undefined
              }
            >
              {isMacTheme && <AquaShineOverlay />}
              <Button
                onClick={toggleEffects}
                className={cn(
                  "h-10 px-5 py-1.5 rounded-full text-white text-[16px] transition-colors focus:outline-none",
                  isMacTheme
                    ? "z-10 relative bg-transparent hover:bg-transparent"
                    : "bg-white/10 hover:bg-white/20"
                )}
                style={{
                  background: isXpTheme
                    ? "rgba(255, 255, 255, 0.1)"
                    : undefined,
                  border: isXpTheme ? "none" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isXpTheme) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.1)";
                  }
                }}
              >
                <span
                  className={
                    isMacTheme
                      ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                      : ""
                  }
                >
                  {t("apps.photo-booth.buttons.effects")}
                </span>
              </Button>
            </div>
          </div>

          <HelpDialog
            isOpen={showHelp}
            onOpenChange={setShowHelp}
            helpItems={translatedHelpItems}
            appId="photo-booth"
          />
          <AboutDialog
            isOpen={showAbout}
            onOpenChange={setShowAbout}
            metadata={appMetadata}
            appId="photo-booth"
          />
        </div>
      </WindowFrame>
    </>
  );
}
