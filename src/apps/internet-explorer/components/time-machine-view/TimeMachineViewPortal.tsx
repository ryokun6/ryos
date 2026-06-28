import { AnimatePresence, motion } from "motion/react";
import { X, Sparkle, Export } from "@phosphor-icons/react";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { Button } from "@/components/ui/button";
import GalaxyBackground, { ShaderType } from "@/components/shared/GalaxyBackground";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import TimeNavigationControls from "../TimeNavigationControls";
import type { ShaderOption } from "./types";
import type { useTimeMachineView } from "./useTimeMachineView";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("TimeMachine");

export type TimeMachineViewVm = ReturnType<typeof useTimeMachineView>;

export function TimeMachineViewPortal({ vm, isOpen }: { vm: TimeMachineViewVm; isOpen: boolean }) {
  return (
    <AnimatePresence>
              {isOpen && (
                <motion.div
                  className={`fixed inset-0 z-[10000] ${
                    vm.shaderEffectEnabled
                      ? "bg-black/90"
                      : "bg-black/70 backdrop-blur-xl"
                  } flex flex-col items-center font-geneva-12 min-h-[100dvh] max-h-[100dvh]`}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
            {/* Galaxy Background */}
            <GalaxyBackground shaderType={vm.selectedShaderType} />

            {/* Top Close Button */}
            <button
              onClick={vm.handleClose}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 z-20"
              aria-label={vm.t("apps.internet-explorer.closeTimeMachine")}
            >
              <X size={24} weight="bold" />
            </button>

            {/* Main Content Area - Make this grow and handle overflow */}
            <motion.div
              className="relative w-full flex-grow overflow-auto flex flex-col items-center justify-start perspective-[1000px] px-2 gap-2 pt-16 overflow-hidden
                           sm:flex-row sm:items-center sm:pt-0 sm:pb-0 sm:px-4 sm:gap-4 sm:pr-0"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.4, delay: 0.1, ease: "easeInOut" }}
            >
              {/* Left spacer - Only visible on desktop */}
              <div className="w-20 flex-shrink-0 hidden sm:block"></div>

              {/* Stacked Previews Area - Let it grow within the row on desktop */}
              <div
                ref={vm.previewContainerRef}
                className="relative w-full flex-grow flex items-center justify-center preserve-3d order-1
                                                        sm:order-none sm:h-[80%]"
              >
                <AnimatePresence initial={false} custom={vm.navigationDirection}>
                  {/* Map over the SLICED array */}
                  {vm.visibleYears.map((year, indexInSlicedArray) => {
                    // Calculate the ORIGINAL index in the full vm.cachedYears array
                    const originalIndex = vm.startIndex + indexInSlicedArray;
                    // Calculate distance from the currently active card (will always be >= 0)
                    const distance = originalIndex - vm.activeYearIndex;
                    // Opacity based on distance (1 / (distance + 1))
                    const opacity = 1 / (distance + 1);
                    // zIndex needs to be based on the original position for correct stacking
                    const zIndex = vm.cachedYears.length - originalIndex;

                    return (
                      <motion.div
                        key={year} // Use year from the sliced array as key
                        className="absolute w-[100%] h-full rounded-[12px] border border-white/10 shadow-2xl overflow-hidden preserve-3d bg-neutral-800/50" // Changed h-[80%] to h-full
                        initial={(() => {
                          // Default starting transform based on distance in the stack
                          const base = {
                            z: distance * vm.PREVIEW_Z_SPACING,
                            scale: 1 - distance * vm.PREVIEW_SCALE_FACTOR,
                            y: distance * vm.PREVIEW_Y_SPACING,
                            opacity: 0,
                          } as const;

                          // If this card will become the new *active* card **and** we're
                          // navigating *backward* (i.e. to a newer year), give it the
                          // reversed scale-up entrance so it appears to push towards the
                          // user before settling into place.
                          if (
                            distance === 0 &&
                            vm.navigationDirection === "forward"
                          ) {
                            return {
                              z: 50, // bring slightly forward
                              scale: 1.05, // small scale-up
                              y: -vm.PREVIEW_Y_SPACING, // subtle upward shift (matches exit)
                              opacity: 0, // fade-in from 0
                            } as const;
                          }

                          return base;
                        })()}
                        animate={{
                          z: distance * vm.PREVIEW_Z_SPACING,
                          y: distance * vm.PREVIEW_Y_SPACING,
                          scale: 1 - distance * vm.PREVIEW_SCALE_FACTOR, // distance >= 0
                          opacity: opacity, // Opacity based on distance
                          pointerEvents: distance === 0 ? "auto" : "none",
                          // Keep background subtle, maybe slightly lighter when active
                          backgroundColor:
                            distance === 0
                              ? "rgba(38, 38, 38, 0.7)"
                              : "rgba(20, 20, 20, 0.5)",
                        }}
                        variants={vm.exitVariants} // Define variants for the component
                        exit="exit" // Use the single 'exit' variant name
                        // Apply base transition - variants can override or add to this
                        transition={{
                          type: "spring",
                          stiffness: 150,
                          damping: 25,
                        }} // Smoothed damping
                        style={{
                          zIndex: zIndex,
                          transformOrigin: "center center",
                          // Add a slight tilt for perspective (only non-active cards)
                          rotateX: distance !== 0 ? -5 : 0, // distance >= 0, so only negative tilt
                        }}
                      >
                        {/* Placeholder Content / HtmlPreview container */}
                        <div className="size-full">
                          {/* Only render content for the active pane */}
                          {distance === 0 && (
                            <div className="size-full flex items-center justify-center">
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={vm.previewStatus} // Animate based on status change
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="size-full"
                                >
                                  {vm.previewStatus === "loading" && (
                                    <motion.div
                                      className="size-full flex items-center justify-center bg-transparent"
                                      variants={vm.pulsingAnimationVariants}
                                      animate="loading"
                                    >
                                      <p className="text-neutral-400 shimmer">
                                        {vm.t("apps.internet-explorer.loadingEllipsis")}
                                      </p>
                                    </motion.div>
                                  )}
                                  {vm.previewStatus === "error" && (
                                    <div className="size-full flex items-center justify-center p-4">
                                      <p className="text-red-400 text-center">
                                        {vm.previewError ||
                                          vm.t("apps.internet-explorer.errorLoadingPreview")}
                                      </p>
                                    </div>
                                  )}
                                  {vm.previewStatus === "success" &&
                                    vm.previewContent && (
                                      <motion.div // Outer container for content fade-in
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }} // This fades in the container after loading/error
                                        transition={{
                                          duration: 0.5,
                                          delay: 0.1,
                                        }}
                                        className="size-full overflow-hidden"
                                      >
                                        {vm.previewSourceType === "url" && (
                                          <motion.div // Animate iframe opacity based on load state
                                            initial={{ opacity: 0 }} // Start fully transparent
                                            variants={vm.pulsingAnimationVariants}
                                            animate={
                                              vm.isIframeLoaded
                                                ? "loaded"
                                                : "loading"
                                            } // Use pulsing when loading, solid when loaded
                                            className="size-full relative"
                                          >
                                            <AnimatePresence>
                                              {!vm.isIframeLoaded && (
                                                <motion.div
                                                  className="absolute top-0 left-0 right-0 bg-white/75 backdrop-blur-sm overflow-hidden z-50"
                                                  variants={vm.loadingBarVariants}
                                                  initial="hidden"
                                                  animate="visible"
                                                  exit="hidden"
                                                >
                                                  {/* Removed the inner div with animation */}
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                            <iframe
                                              src={vm.previewContent}
                                              className="size-full border-none bg-white"
                                              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
                                              title={`Preview for ${vm.previewYear}`}
                                              onLoad={() => {
                                                log.debug("Preview iframe loaded", {
                                                  year: vm.previewYear,
                                                });
                                                vm.setIsIframeLoaded(true);
                                              }}
                                              onError={() => {
                                                console.warn(
                                                  `[TimeMachine] iframe for ${vm.previewYear} failed to load.`
                                                );
                                                vm.setPreviewError(
                                                  vm.t("apps.internet-explorer.unableToLoadPreview")
                                                );
                                                vm.setPreviewStatus("error");
                                                vm.setIsIframeLoaded(false);
                                              }}
                                            />
                                          </motion.div>
                                        )}
                                        {vm.previewSourceType === "html" && (
                                          <motion.div // Keep consistent structure, though opacity is handled by parent
                                            initial={{ opacity: 0 }} // Start transparent
                                            animate={{ opacity: 1 }} // Always fade in fully for HTML content
                                            transition={{ duration: 0.5 }} // Match iframe fade duration
                                            className="size-full"
                                          >
                                            <HtmlPreview
                                              htmlContent={vm.previewContent}
                                              isInternetExplorer={true}
                                              maxHeight="100%"
                                              minHeight="100%"
                                              className="border-none rounded-none"
                                              // AI-generated archive preview;
                                              // trusted "ryo" authorship.
                                              appletCreatedBy="ryo"
                                            />
                                          </motion.div>
                                        )}
                                      </motion.div>
                                    )}
                                  {/* Handle idle state or success with no content (shouldn'vm.t normally happen) */}
                                  {(vm.previewStatus === "idle" ||
                                    (vm.previewStatus === "success" &&
                                      !vm.previewContent)) && (
                                    <div className="size-full flex items-center justify-center">
                                      {" "}
                                      {/* Placeholder/Idle */}{" "}
                                    </div>
                                  )}
                                </motion.div>
                              </AnimatePresence>
                            </div>
                          )}
                          {/* Add a subtle background or placeholder for non-active cards */}
                          {distance !== 0 && (
                            <div className="size-full bg-neutral-900/30"></div> // Simple background
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Up/Now/Down Controls Area - Only visible on desktop - Same Size Buttons */}
              <div className="hidden h-full flex-col items-center justify-center w-auto flex-shrink-0 z-10 py-8 gap-2 sm:flex">
                <TimeNavigationControls
                  layout="vertical"
                  onOlder={() => vm.changeActiveYearIndex((prev) => prev + 1)}
                  onNewer={() => vm.changeActiveYearIndex((prev) => prev - 1)}
                  onNow={() => {
                    const nowIndex = vm.cachedYears.findIndex(
                      (year) => year === "current"
                    );
                    if (nowIndex !== -1) {
                      vm.changeActiveYearIndex(nowIndex);
                    }
                  }}
                    isOlderDisabled={vm.activeYearIndex === vm.cachedYears.length - 1}
                    isNewerDisabled={vm.activeYearIndex === 0}
                    isNowDisabled={vm.cachedYears[vm.activeYearIndex] === "current"}
                    olderLabel={vm.olderYearLabel}
                    newerLabel={vm.newerYearLabel}
                    nowLabel={vm.t("apps.internet-explorer.now")}
                    playClickSound={vm.playClick}
                  />
              </div>

              {/* Timeline Area - Adjust height/max-height */}
              <div
                className="w-full flex flex-col justify-center order-2 px-2 z-10 flex-shrink-0 gap-0
                           sm:h-[80dvh] sm:flex-col sm:items-center sm:justify-center sm:w-48 sm:flex-shrink-0 sm:order-none sm:gap-2"
              >
                {/* Container for the timeline bars - Adjust height/max-height */}
                <div
                  className="relative w-full flex-grow flex flex-row items-center justify-center overflow-hidden px-2
                                   sm:flex-col sm:px-4 sm:py-2 sm:h-auto sm:max-h-full"
                >
                  {/* Timeline Bars Container - APPLY MASK STYLE HERE */}
                  <div
                    ref={vm.timelineRef}
                    className="w-auto max-w-full overflow-x-auto flex flex-row items-center space-x-4 space-y-0 justify-start py-2 flex-shrink-0
                                      sm:w-full sm:overflow-y-auto sm:flex-col-reverse sm:hover:flex-col-reverse sm:items-center sm:space-y-1 sm:space-x-0 sm:py-4 sm:h-auto sm:max-h-full sm:max-w-none
                                      sm:justify-start sm:min-h-full
                                      [&::-webkit-scrollbar]:hidden
                                      [&::-webkit-scrollbar]:sm:w-1
                                      [&::-webkit-scrollbar]:sm:hover:block
                                      [&::-webkit-scrollbar]:sm:translate-x-1
                                      [&::-webkit-scrollbar-thumb]:rounded-full
                                      [&::-webkit-scrollbar-thumb]:bg-white/20
                                      [&::-webkit-scrollbar-track]:bg-transparent
                                      sm:pr-2"
                    style={{
                      maskImage: vm.maskStyle,
                      WebkitMaskImage: vm.maskStyle, // For Safari
                    }}
                  >
                    {vm.cachedYears.map((year, index) => {
                      const isActive = vm.activeYearIndex === index;
                      const isNow = year === "current";

                      // Define base, size, and color classes
                      const barBaseClasses =
                        "rounded-sm transition-all duration-200 ease-out";
                      // Default: mobile sizes, sm: desktop sizes
                      const barSizeClasses = isActive
                        ? "h-1.5 w-12 sm:w-14 sm:h-1" // Active bar (mobile / desktop)
                        : "h-1 w-8 group-hover:w-10 sm:w-8 sm:h-0.5 "; // Inactive bar (mobile / desktop)
                      const barColorClasses = isActive
                        ? isNow
                          ? "bg-red-500"
                          : "bg-white"
                        : "bg-white/30 group-hover:bg-white"; // Inactive color, white on hover (previously bg-neutral-600/70)

                      return (
                        // Default: mobile layout (vertical stack), sm: desktop layout (horizontal)
                        <div
                          key={year}
                          className="w-auto flex flex-col items-center justify-center h-full py-1 cursor-pointer group
                                                   sm:w-full sm:flex-row sm:items-center sm:justify-end sm:h-6 sm:py-0 sm:my-0.5"
                          onClick={() => {
                            vm.playClick(); // Play click sound
                            // Determine direction before updating index
                            if (index > vm.activeYearIndex) {
                              vm.setNavigationDirection("forward"); // Moving to older year (past)
                            } else if (index < vm.activeYearIndex) {
                              vm.setNavigationDirection("backward"); // Moving to newer year (future)
                            } else {
                              vm.setNavigationDirection("none"); // No change
                            }
                            vm.setActiveYearIndex(index); // Update index directly
                          }}
                        >
                          {/* Year Label - Default: mobile (always visible, dimmed inactive), sm: desktop (opacity change) */}
                          <span
                            className={`text-xs font-medium transition-colors duration-150 mb-1 whitespace-nowrap sm:mr-2 sm:mb-0 sm:transition-opacity ${
                              isActive
                                ? isNow
                                  ? "text-red-400"
                                  : "text-white"
                                : "text-neutral-500 group-hover:text-neutral-300 sm:text-neutral-400"
                            } ${
                              isActive
                                ? "sm:opacity-100" // Active opacity
                                : isNow
                                ? "sm:opacity-100"
                                : "sm:opacity-0 sm:group-hover:opacity-100" // Inactive opacity (Now always visible, others on hover)
                            }`}
                          >
                            {isNow ? vm.t("apps.internet-explorer.now") : year}
                          </span>
                          {/* Timeline Bar - Hidden on mobile, visible on desktop */}
                          <div
                            className={`${barBaseClasses} ${barSizeClasses} ${barColorClasses} hidden sm:block`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Prev/Next Buttons - Only visible on mobile - Same Size Buttons */}
                <div className="w-full flex items-center justify-center gap-4 pt-2 pb-4 sm:!hidden">
                  <TimeNavigationControls
                    layout="horizontal"
                    onOlder={() => vm.changeActiveYearIndex((prev) => prev + 1)}
                    onNewer={() => vm.changeActiveYearIndex((prev) => prev - 1)}
                    onNow={() => {
                      const nowIndex = vm.cachedYears.findIndex(
                        (year) => year === "current"
                      );
                      if (nowIndex !== -1) {
                        vm.changeActiveYearIndex(nowIndex);
                      }
                    }}
                    isOlderDisabled={vm.activeYearIndex === vm.cachedYears.length - 1}
                    isNewerDisabled={vm.activeYearIndex === 0}
                    isNowDisabled={vm.cachedYears[vm.activeYearIndex] === "current"}
                    olderLabel={vm.t("apps.internet-explorer.older")}
                    newerLabel={vm.t("apps.internet-explorer.newer")}
                    nowLabel={vm.t("apps.internet-explorer.now")}
                    playClickSound={vm.playClick}
                  />
                </div>
              </div>
            </motion.div>

            {/* Footer Bar - Remove absolute positioning, place at end of flex column */}
            <div
              className={`relative w-full flex-shrink-0 ${
                vm.shaderEffectEnabled
                  ? "bg-neutral-900/80"
                  : "bg-neutral-900/60 backdrop-blur-sm"
              } border-vm.t border-white/10 flex items-center justify-between px-4 z-20 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]
                           sm:h-10 sm:pt-0 sm:pb-0`}
            >
              {/* Add Share button to the far left */}
              <div className="w-8 flex items-center justify-start">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
                  onClick={vm.handleSharePage}
                  aria-label={vm.t("apps.internet-explorer.shareThisPageAndTime")}
                >
                  <Export size={16} className="text-neutral-300" weight="bold" />
                </Button>
              </div>
              {/* Removed outer left spacer */}

              {/* Center URL and Travel button group */}
              <div className="flex items-center justify-center gap-3 flex-grow">
                <p className="text-sm text-neutral-300 truncate text-center">
                  {/* Show URL and conditionally year */}
                  {vm.getHostname(vm.currentUrl)}
                  {vm.activeYear !== "current" && (
                    <span className="text-neutral-400 ml-1">
                      {vm.t("apps.internet-explorer.in")} {vm.activeYear}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  className={cn(
                    "relative overflow-hidden rounded-full px-3 py-1 h-7 text-xs font-medium transition-colors",
                    vm.isMacTheme
                      ? "shadow-lg text-white/70 hover:text-white"
                      : "border border-white/10 backdrop-blur-sm shadow-lg bg-neutral-800/35 text-white/70 hover:text-white hover:bg-white/10",
                    vm.isGoButtonDisabled && "opacity-30 pointer-events-none"
                  )}
                  style={vm.isMacTheme ? {
                    background: "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  } : undefined}
                  disabled={vm.isGoButtonDisabled}
                  onClick={() => {
                    if (vm.activeYear) {
                      vm.playClick(); // Play click sound
                      vm.onSelectYear(vm.activeYear);
                      vm.handleClose(); // Use vm.handleClose to play sound
                    }
                  }}
                >
                  {/* Aqua shine overlay */}
                  {vm.isMacTheme && (
                    <div
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                      style={{
                        top: "2px",
                        height: "35%",
                        width: "calc(100% - 16px)",
                        borderRadius: "100px",
                        background: "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
                        filter: "blur(0.5px)",
                        zIndex: 2,
                      }}
                    />
                  )}
                  <span className="relative z-10">{vm.t("apps.internet-explorer.travel")}</span>
                </button>
              </div>

              {/* Right shader menu - Always shown */}
              <div className="w-8 flex items-center justify-end">
                {/* Shader selector dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <Sparkle size={16} className="text-neutral-300" weight="bold" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="z-[10001]"
                  >
                    {[...Object.values(ShaderType), "off"].map((type) => {
                      const isSelected =
                        type === "off"
                          ? !vm.shaderEffectEnabled
                          : vm.shaderEffectEnabled && vm.selectedShaderType === type;
                      return (
                        <DropdownMenuItem
                          key={type}
                          className={cn(
                            "font-geneva-12 text-[12px] flex items-center justify-between",
                            isSelected && "bg-os-selection-bg text-os-selection-text"
                          )}
                          onClick={() => {
                            if (type === "off") {
                              vm.setShaderEffectEnabled(false);
                            } else {
                              vm.setShaderEffectEnabled(true);
                              vm.setSelectedShaderType(type as ShaderType);
                            }
                            vm.playClick(); // Play click sound on shader change
                          }}
                        >
                          {vm.shaderNames[type as ShaderOption]}
                          {isSelected && <span className="ml-2">✓</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

                  {/* Share Dialog - Uses high z-index to appear above Time Machine overlay */}
                  <ShareItemDialog
                    isOpen={vm.isShareDialogOpen}
                    onClose={() => vm.setIsShareDialogOpen(false)}
                    itemType={vm.t("apps.internet-explorer.page")}
                    itemTypeKey="page"
                    itemIdentifier={vm.currentUrl}
                    secondaryIdentifier={vm.activeYear || vm.currentSelectedYear}
                    title={vm.getHostname(vm.currentUrl)} // Using hostname as title
                    generateShareUrl={vm.timeMachineGenerateShareUrl}
                    contentClassName="z-[10001]"
                    overlayClassName="z-[10001]"
                  />
                </motion.div>
              )}
    </AnimatePresence>
  );
}
