import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Blend, Share } from "lucide-react";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { Button } from "@/components/ui/button";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import GalaxyBackground, {
  ShaderType,
} from "@/components/shared/GalaxyBackground";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Import useAppStore for shader selection
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
// Import sound hook and paths
import { useSound, Sounds } from "@/hooks/useSound";
// Import ShareLinkDialog
// import { ShareLinkDialog } from "./ShareLinkDialog"; // Old import, to be removed
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog"; // New import
// Import the new navigation controls
import TimeNavigationControls from "./TimeNavigationControls";

// Define type for preview content source
type PreviewSource = "html" | "url";

interface TimeMachineViewProps {
  isOpen: boolean;
  onClose: () => void;
  cachedYears: string[]; // Years should be sorted, newest first
  currentUrl: string;
  onSelectYear: (year: string) => void;
  currentSelectedYear: string; // Add prop for the initially selected year
}

const TimeMachineView: React.FC<TimeMachineViewProps> = ({
  isOpen,
  onClose,
  cachedYears,
  currentUrl,
  onSelectYear,
  currentSelectedYear, // Destructure the new prop
}) => {
  // Index of the year currently in focus (0 is the newest/frontmost)
  const [activeYearIndex, setActiveYearIndex] = useState<number>(0);
  const [scrollState, setScrollState] = useState({
    isTop: true,
    isBottom: false,
    canScroll: false,
  });
  // State to track navigation direction for animations
  const [navigationDirection, setNavigationDirection] = useState<
    "forward" | "backward" | "none"
  >("none");

  // --- Time Machine Local Preview State ---
  const [previewYear, setPreviewYear] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewSourceType, setPreviewSourceType] =
    useState<PreviewSource | null>(null);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isIframeLoaded, setIsIframeLoaded] = useState<boolean>(false); // State for iframe load status
  // --- End Local Preview State ---

  const timelineRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Get main app state for comparison
  const storeUrl = useInternetExplorerStore((state) => state.url);
  const storeYear = useInternetExplorerStore((state) => state.year);
  // Get shader support status
  const shaderEffectEnabled = useAppStore((state) => state.shaderEffectEnabled);
  const setShaderEffectEnabled = useAppStore(
    (state) => state.setShaderEffectEnabled
  );

  // Determine the currently focused year in the timeline
  const activeYear = cachedYears[activeYearIndex] ?? null;

  // --- Sound Effects ---
  const { play: playOpen } = useSound(Sounds.WINDOW_OPEN, 0.5);
  const { play: playClose } = useSound(Sounds.WINDOW_CLOSE, 0.5);
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.4);
  // --- End Sound Effects ---

  // --- Add state for Share Dialog ---
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  // --- End Share Dialog State ---

  // Determine if the Go button should be disabled
  const isGoButtonDisabled =
    !activeYear || (storeUrl === currentUrl && storeYear === activeYear);

  // Add shader selection state from app store
  const selectedShaderType = useAppStore((state) => state.selectedShaderType);
  const setSelectedShaderType = useAppStore(
    (state) => state.setSelectedShaderType
  );

  // Define shader names including Off option
  const shaderNames: Record<ShaderType | "off", string> = {
    [ShaderType.GALAXY]: "Galaxy",
    [ShaderType.AURORA]: "Aurora",
    [ShaderType.NEBULA]: "Nebula",
    off: "Off",
  };

  // Define type for shader menu options
  type ShaderOption = ShaderType | "off";

  // Updated mask function to handle horizontal mobile mask
  const getMaskStyle = (canScroll: boolean) => {
    const isMobile = window.innerWidth < 640;

    if (!canScroll) return "none"; // No mask if no scrolling is possible

    if (isMobile) {
      // Mobile: Horizontal mask (always show at both ends if scrollable)
      return `linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)`;
    } else {
      // Desktop: Vertical mask (always show at both ends if scrollable)
      return `linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)`;
    }
  };

  const handleScroll = useCallback(() => {
    const element = timelineRef.current;
    if (!element) return;

    const isMobile = window.innerWidth < 640;
    let canScroll = false;

    if (isMobile) {
      // Check horizontal scroll on mobile
      const scrollWidth = element.scrollWidth;
      const clientWidth = element.clientWidth;
      const threshold = 1; // Minimal tolerance needed for horizontal
      canScroll = scrollWidth > clientWidth + threshold;
    } else {
      // Check vertical scroll on desktop
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      const threshold = 5;
      canScroll = scrollHeight > clientHeight + threshold;
    }

    // Update scroll state only if scrollability changed
    setScrollState((prevState) => {
      if (prevState.canScroll !== canScroll) {
        // Reset isTop/isBottom as they are not used in simplified mask
        return { isTop: false, isBottom: false, canScroll };
      }
      return prevState;
    });
  }, []); // Empty dependency array, relies on timelineRef.current

  // Effect to setup scroll listeners and initial check
  useEffect(() => {
    const element = timelineRef.current;
    if (isOpen && element) {
      // Delay slightly to ensure layout is stable after opening animation/resize
      const timer = setTimeout(() => {
        handleScroll(); // Initial check
        element.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll);
      }, 100); // Increased delay slightly

      return () => {
        clearTimeout(timer);
        element.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleScroll);
      };
    }
  }, [isOpen, handleScroll, cachedYears]); // Re-run if cachedYears changes height or component opens/closes
  // --- End Scroll Mask Logic ---

  // Initialize index and preview year when opening
  useEffect(() => {
    if (isOpen) {
      playOpen(); // Play open sound
      const initialIndex = cachedYears.findIndex(
        (y) => y === currentSelectedYear
      );
      const validIndex = initialIndex !== -1 ? initialIndex : 0;
      setActiveYearIndex(validIndex);
      // Initialize previewYear based on the starting index
      if (cachedYears[validIndex]) {
        setPreviewYear(cachedYears[validIndex]);
      } else {
        setPreviewYear(null);
      }
      setPreviewStatus("idle"); // Reset status on open
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state on open
    } else {
      // Reset preview state when closed
      setPreviewYear(null);
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state on close
    }
  }, [cachedYears, isOpen, currentSelectedYear]);

  // Update previewYear when activeYearIndex changes (due to user interaction)
  useEffect(() => {
    // Ensure this runs only after initial setup and when index actually changes while open
    if (isOpen && previewStatus !== "idle") {
      const newYear = cachedYears[activeYearIndex];
      if (newYear && newYear !== previewYear) {
        setPreviewYear(newYear);
      }
    }
    // We only want this effect to react to index changes triggered by user interaction,
    // not the initial setting from the isOpen effect.
  }, [activeYearIndex, isOpen, cachedYears]);

  // Scroll timeline to active item
  useEffect(() => {
    if (isOpen && timelineRef.current && cachedYears.length > 0) {
      // Use activeYearIndex directly since timeline is no longer reversed

      // Ensure index is valid
      if (
        activeYearIndex >= 0 &&
        activeYearIndex < timelineRef.current.children.length
      ) {
        const activeElement = timelineRef.current.children[
          activeYearIndex
        ] as HTMLElement;

        if (activeElement) {
          // Check screen width to apply correct scroll behavior
          const isMobile = window.innerWidth < 640; // Tailwind 'sm' breakpoint

          if (isMobile) {
            // Mobile: Center horizontally
            activeElement.scrollIntoView({
              behavior: "smooth",
              block: "nearest", // Avoid unnecessary vertical scroll if possible
              inline: "center", // Center horizontally
            });
          } else {
            // Desktop: Center vertically
            activeElement.scrollIntoView({
              behavior: "smooth",
              block: "center", // Center vertically
              inline: "nearest", // Avoid unnecessary horizontal scroll
            });
          }
        }
      }
    }
  }, [activeYearIndex, isOpen, cachedYears.length]);

  const handleClose = useCallback(() => {
    playClose(); // Play close sound
    onClose();
  }, [onClose, playClose]);

  // --- Helper to set Active Index and Direction ---
  const changeActiveYearIndex = useCallback(
    (newIndexOrCallback: number | ((prevIndex: number) => number)) => {
      setActiveYearIndex((prevIndex) => {
        let newIndex: number;
        if (typeof newIndexOrCallback === "function") {
          newIndex = newIndexOrCallback(prevIndex);
        } else {
          newIndex = newIndexOrCallback;
        }

        // Clamp index to valid range
        newIndex = Math.max(0, Math.min(cachedYears.length - 1, newIndex));

        // Determine direction
        if (newIndex > prevIndex) {
          setNavigationDirection("forward"); // Moving to older year (past)
        } else if (newIndex < prevIndex) {
          setNavigationDirection("backward"); // Moving to newer year (future)
        } else {
          setNavigationDirection("none"); // No change
        }
        return newIndex;
      });
    },
    [cachedYears.length]
  ); // Dependency on cachedYears.length to ensure clamping is correct
  // --- End Helper ---

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        // Use helper function to set direction
        changeActiveYearIndex((prevIndex) => prevIndex + 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        // Use helper function to set direction
        changeActiveYearIndex((prevIndex) => prevIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (cachedYears[activeYearIndex]) {
          onSelectYear(cachedYears[activeYearIndex]);
          // Keep view open after selection
          // onClose();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [
      isOpen,
      cachedYears,
      activeYearIndex,
      onSelectYear,
      handleClose,
      changeActiveYearIndex,
    ]
  ); // Add changeActiveYearIndex to dependencies

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // --- Concurrency handling for preview fetches ---
  // Each time we start resolving a preview source we increment this counter.
  // Only the most-recent async chain is allowed to commit state updates.
  const previewRequestIdRef = useRef(0);
  // Keep an AbortController so that previous network requests are cancelled
  const previewAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !previewYear || !currentUrl) {
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state
      return;
    }

    // Abort any previous in-flight request
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    previewAbortControllerRef.current = abortController;

    // Generate an id so that we can ignore stale async completions
    const myRequestId = ++previewRequestIdRef.current;

    console.log(
      `[TimeMachine] Determining content source for year: ${previewYear}`
    );
    setPreviewStatus("loading");
    setPreviewContent(null);
    setPreviewSourceType(null);
    setPreviewError(null);
    setIsIframeLoaded(false); // Reset iframe state on new preview

    const determineSource = async () => {
      try {
        // Local caching removed to save localStorage space
        console.log(
          `[TimeMachine] Determining API source for ${currentUrl} (${previewYear})...`
        );

        // Determine API source based on year
        if (previewYear === "current") {
          // 2a. 'current' uses direct proxy URL
          console.log(`[TimeMachine] Source: current -> URL`);
          const proxyUrl = `/api/iframe-check?url=${encodeURIComponent(
            currentUrl
          )}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`;
          if (
            abortController.signal.aborted ||
            previewRequestIdRef.current !== myRequestId
          )
            return;
          setPreviewContent(proxyUrl);
          setPreviewSourceType("url");
          setPreviewStatus("success"); // Status is success, iframe handles actual load
          // isIframeLoaded remains false until iframe onLoad fires
        } else {
          const yearString = previewYear.replace(" BC", "");
          const yearInt = parseInt(yearString);
          const currentYear = new Date().getFullYear();
          const isBC = previewYear.includes(" BC");

          if (!isBC && yearInt >= 1996 && yearInt <= currentYear) {
            // 2b. Year >= 1996 uses Wayback proxy URL
            console.log(
              `[TimeMachine] Source: ${previewYear} >= 1996 -> URL (Wayback Proxy)`
            );
            const currentMonth = (new Date().getMonth() + 1)
              .toString()
              .padStart(2, "0");
            const proxyUrl = `/api/iframe-check?mode=proxy&url=${encodeURIComponent(
              currentUrl
            )}&year=${yearString}&month=${currentMonth}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`;
            if (
              abortController.signal.aborted ||
              previewRequestIdRef.current !== myRequestId
            )
              return;
            setPreviewContent(proxyUrl);
            setPreviewSourceType("url");
            setPreviewStatus("success"); // Status is success, iframe handles actual load
            // isIframeLoaded remains false until iframe onLoad fires
          } else {
            // 2c. Year < 1996 or BC uses AI cache (fetches HTML)
            console.log(
              `[TimeMachine] Source: ${previewYear} < 1996 or BC -> HTML (AI Fetch)`
            );
            const aiResponse = await fetch(
              `/api/iframe-check?mode=ai&url=${encodeURIComponent(
                currentUrl
              )}&year=${previewYear}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`,
              {
                signal: abortController.signal,
              }
            );

            if (
              abortController.signal.aborted ||
              previewRequestIdRef.current !== myRequestId
            )
              return;

            if (aiResponse.ok) {
              console.log(
                `[TimeMachine] AI Fetch SUCCESS for ${currentUrl} (${previewYear})`
              );
              const html = await aiResponse.text();
              const cleanHtml = html.replace(/^<!--\s*TITLE:.*?-->\s*\n?/, "");

              if (
                abortController.signal.aborted ||
                previewRequestIdRef.current !== myRequestId
              )
                return;
              setPreviewContent(cleanHtml);
              setPreviewSourceType("html");
              setPreviewStatus("success");
              // No iframe involved
              setIsIframeLoaded(true);
              // Local caching removed to save localStorage space
            } else if (aiResponse.status === 404) {
              console.log(
                `[TimeMachine] AI Fetch MISS (404) for ${currentUrl} (${previewYear}).`
              );
              throw new Error(
                `No AI-generated version available for ${previewYear}.`
              );
            } else {
              // Handle non-404 errors from AI fetch
              console.error(
                `[TimeMachine] AI Fetch FAILED for ${currentUrl} (${previewYear}). Status: ${aiResponse.status}`
              );
              const errorText = await aiResponse.text();
              let errorMessage = `API Error (${aiResponse.status})`;
              try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) errorMessage = errorJson.message;
              } catch {
                /* Ignore */
              }
              throw new Error(errorMessage);
            }
          }
        }
      } catch (error) {
        if (
          abortController.signal.aborted ||
          previewRequestIdRef.current !== myRequestId
        )
          return;
        console.error(
          "[TimeMachine] Error determining preview content:",
          error
        );
        setPreviewError(
          error instanceof Error ? error.message : "Failed to load preview."
        );
        setPreviewStatus("error");
        setPreviewContent(null);
        setPreviewSourceType(null);
        setIsIframeLoaded(false);
      }
    };

    determineSource();

    // Cleanup – abort fetches when previewYear changes or component unmounts
    return () => {
      abortController.abort();
    };
  }, [previewYear, isOpen, currentUrl]); // Dependencies

  const getHostname = (targetUrl: string): string => {
    try {
      return new URL(
        targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`
      ).hostname;
    } catch {
      return targetUrl;
    }
  };

  const MAX_VISIBLE_PREVIEWS = 4; // How many previews to show behind the active one
  const PREVIEW_Z_SPACING = -80; // Spacing between previews on Z-axis
  const PREVIEW_SCALE_FACTOR = 0.05; // How much smaller each preview gets
  const PREVIEW_Y_SPACING = -28; // Vertical spacing between previews

  const maskStyle = getMaskStyle(scrollState.canScroll);

  // --- Animation Variants (defined inside component to access constants) ---
  const exitVariants = {
    // Define a single 'exit' variant as a function accepting the custom prop
    exit: (direction: "forward" | "backward" | "none") => {
      if (direction === "backward") {
        // Changed from 'forward' to 'backward'
        // Backward exit (going to future): Exiting card moves smoothly back to the distance=1 position
        return {
          opacity: 0, // Fade out smoothly
          z: PREVIEW_Z_SPACING, // Target z for distance = 1
          scale: 1 - PREVIEW_SCALE_FACTOR, // Target scale for distance = 1
          y: PREVIEW_Y_SPACING, // Target y for distance = 1
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      } else {
        // direction === 'forward' or 'none'
        // Forward exit (going to past): Exiting card scales *out* (up and forward)
        return {
          opacity: 0,
          z: 50, // Bring slightly forward
          scale: 1.05, // Scale up a bit
          y: -PREVIEW_Y_SPACING, // Subtle upward shift
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      }
    },
    /* Original approach - keeping for reference if needed
       opacity: 0,
       z: (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_Z_SPACING,
       scale: 1 - (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_SCALE_FACTOR,
       y: (MAX_VISIBLE_PREVIEWS + 1) * PREVIEW_Y_SPACING,
       transition: { type: 'spring', stiffness: 150, damping: 25 } // Smoothed damping
     },
     scaleUp: { // New exit: card moves towards user/scales up when navigating forward (older)
       opacity: 0,
       z: 50, // Bring slightly forward
       scale: 1.05, // Scale up a bit
       y: 0,
       transition: { type: 'spring', stiffness: 150, damping: 25 } // Smoothed damping
     }
    */
  };
  // --- End Animation Variants ---

  // Calculate tooltip labels
  const olderYearLabel =
    activeYearIndex < cachedYears.length - 1
      ? cachedYears[activeYearIndex + 1]
      : "Oldest";
  const newerYearLabel =
    activeYearIndex > 0 ? cachedYears[activeYearIndex - 1] : "Newest";

  // --- Calculate the slice of years to actually render ---
  const startIndex = Math.max(0, activeYearIndex); // The active card is the first one we want
  // +1 because slice end is exclusive, +1 again because MAX_VISIBLE_PREVIEWS is *behind* active
  const endIndexExclusive = Math.min(
    cachedYears.length,
    activeYearIndex + MAX_VISIBLE_PREVIEWS + 1
  );
  const visibleYears = cachedYears.slice(startIndex, endIndexExclusive);
  // --- End Slice Calculation ---

  // Loading bar animation variants
  const loadingBarVariants = {
    hidden: {
      height: 0,
      opacity: 0,
      transition: { duration: 0.3 },
    },
    visible: {
      height: "0.25rem",
      opacity: 1,
      transition: { duration: 0.3 },
    },
  };

  // Pulsing animation variants for loading content
  const pulsingAnimationVariants = {
    loading: {
      opacity: [0.4, 0.7, 0.4],
      transition: {
        duration: 2.5,
        ease: "easeInOut" as const,
        repeat: Infinity,
      },
    },
    loaded: {
      opacity: 1,
      transition: { duration: 0.5 },
    },
  };

  // --- Add handler for Share button ---
  const handleSharePage = useCallback(() => {
    if (activeYear) {
      setIsShareDialogOpen(true);
      // No toast needed here, dialog handles its own flow
    }
  }, [activeYear]);
  // --- End Share handler ---

  const timeMachineGenerateShareUrl = (
    identifier: string,
    secondary?: string
  ): string => {
    // Simple encoding function (client-side)
    const encodeData = (urlToEncode: string, yearToEncode: string): string => {
      const combined = `${urlToEncode}|${yearToEncode}`;
      return btoa(combined)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };
    const code = encodeData(identifier, secondary || "current");
    return `${window.location.origin}/internet-explorer/${code}`;
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && createPortal(
          <motion.div
            className={`fixed inset-0 z-[10000] ${
              shaderEffectEnabled
                ? "bg-black/90"
                : "bg-black/70 backdrop-blur-xl"
            } flex flex-col items-center font-geneva-12 min-h-[100dvh] max-h-[100dvh]`}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {/* Galaxy Background */}
            <GalaxyBackground shaderType={selectedShaderType} />

            {/* Top Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 z-20"
              aria-label="Close Time Machine"
            >
              <X size={24} />
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
                ref={previewContainerRef}
                className="relative w-full flex-grow flex items-center justify-center preserve-3d order-1
                                                        sm:order-none sm:h-[80%]"
              >
                <AnimatePresence initial={false} custom={navigationDirection}>
                  {/* Map over the SLICED array */}
                  {visibleYears.map((year, indexInSlicedArray) => {
                    // Calculate the ORIGINAL index in the full cachedYears array
                    const originalIndex = startIndex + indexInSlicedArray;
                    // Calculate distance from the currently active card (will always be >= 0)
                    const distance = originalIndex - activeYearIndex;
                    // Opacity based on distance (1 / (distance + 1))
                    const opacity = 1 / (distance + 1);
                    // zIndex needs to be based on the original position for correct stacking
                    const zIndex = cachedYears.length - originalIndex;

                    return (
                      <motion.div
                        key={year} // Use year from the sliced array as key
                        className="absolute w-[100%] h-full rounded-[12px] border border-white/10 shadow-2xl overflow-hidden preserve-3d bg-neutral-800/50" // Changed h-[80%] to h-full
                        initial={(() => {
                          // Default starting transform based on distance in the stack
                          const base = {
                            z: distance * PREVIEW_Z_SPACING,
                            scale: 1 - distance * PREVIEW_SCALE_FACTOR,
                            y: distance * PREVIEW_Y_SPACING,
                            opacity: 0,
                          } as const;

                          // If this card will become the new *active* card **and** we're
                          // navigating *backward* (i.e. to a newer year), give it the
                          // reversed scale-up entrance so it appears to push towards the
                          // user before settling into place.
                          if (
                            distance === 0 &&
                            navigationDirection === "forward"
                          ) {
                            return {
                              z: 50, // bring slightly forward
                              scale: 1.05, // small scale-up
                              y: -PREVIEW_Y_SPACING, // subtle upward shift (matches exit)
                              opacity: 0, // fade-in from 0
                            } as const;
                          }

                          return base;
                        })()}
                        animate={{
                          z: distance * PREVIEW_Z_SPACING,
                          y: distance * PREVIEW_Y_SPACING,
                          scale: 1 - distance * PREVIEW_SCALE_FACTOR, // distance >= 0
                          opacity: opacity, // Opacity based on distance
                          pointerEvents: distance === 0 ? "auto" : "none",
                          // Keep background subtle, maybe slightly lighter when active
                          backgroundColor:
                            distance === 0
                              ? "rgba(38, 38, 38, 0.7)"
                              : "rgba(20, 20, 20, 0.5)",
                        }}
                        variants={exitVariants} // Define variants for the component
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
                        <div className="w-full h-full">
                          {/* Only render content for the active pane */}
                          {distance === 0 && (
                            <div className="w-full h-full flex items-center justify-center">
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={previewStatus} // Animate based on status change
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="w-full h-full"
                                >
                                  {previewStatus === "loading" && (
                                    <motion.div
                                      className="w-full h-full flex items-center justify-center bg-transparent"
                                      variants={pulsingAnimationVariants}
                                      animate="loading"
                                    >
                                      <p className="text-neutral-400 shimmer">
                                        Loading...
                                      </p>
                                    </motion.div>
                                  )}
                                  {previewStatus === "error" && (
                                    <div className="w-full h-full flex items-center justify-center p-4">
                                      <p className="text-red-400 text-center">
                                        {previewError ||
                                          "Error loading preview."}
                                      </p>
                                    </div>
                                  )}
                                  {previewStatus === "success" &&
                                    previewContent && (
                                      <motion.div // Outer container for content fade-in
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }} // This fades in the container after loading/error
                                        transition={{
                                          duration: 0.5,
                                          delay: 0.1,
                                        }}
                                        className="w-full h-full overflow-hidden"
                                      >
                                        {previewSourceType === "url" && (
                                          <motion.div // Animate iframe opacity based on load state
                                            initial={{ opacity: 0 }} // Start fully transparent
                                            variants={pulsingAnimationVariants}
                                            animate={
                                              isIframeLoaded
                                                ? "loaded"
                                                : "loading"
                                            } // Use pulsing when loading, solid when loaded
                                            className="w-full h-full relative"
                                          >
                                            <AnimatePresence>
                                              {!isIframeLoaded && (
                                                <motion.div
                                                  className="absolute top-0 left-0 right-0 bg-white/75 backdrop-blur-sm overflow-hidden z-50"
                                                  variants={loadingBarVariants}
                                                  initial="hidden"
                                                  animate="visible"
                                                  exit="hidden"
                                                >
                                                  {/* Removed the inner div with animation */}
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                            <iframe
                                              src={previewContent}
                                              className="w-full h-full border-none bg-white"
                                              sandbox="allow-scripts allow-same-origin"
                                              title={`Preview for ${previewYear}`}
                                              onLoad={() => {
                                                console.log(
                                                  `[TimeMachine] iframe for ${previewYear} loaded.`
                                                );
                                                setIsIframeLoaded(true);
                                              }}
                                              onError={() => {
                                                console.warn(
                                                  `[TimeMachine] iframe for ${previewYear} failed to load.`
                                                );
                                                setPreviewError(
                                                  "Unable to load preview."
                                                );
                                                setPreviewStatus("error");
                                                setIsIframeLoaded(false);
                                              }}
                                            />
                                          </motion.div>
                                        )}
                                        {previewSourceType === "html" && (
                                          <motion.div // Keep consistent structure, though opacity is handled by parent
                                            initial={{ opacity: 0 }} // Start transparent
                                            animate={{ opacity: 1 }} // Always fade in fully for HTML content
                                            transition={{ duration: 0.5 }} // Match iframe fade duration
                                            className="w-full h-full"
                                          >
                                            <HtmlPreview
                                              htmlContent={previewContent}
                                              isInternetExplorer={true}
                                              maxHeight="100%"
                                              minHeight="100%"
                                              className="border-none rounded-none"
                                            />
                                          </motion.div>
                                        )}
                                      </motion.div>
                                    )}
                                  {/* Handle idle state or success with no content (shouldn't normally happen) */}
                                  {(previewStatus === "idle" ||
                                    (previewStatus === "success" &&
                                      !previewContent)) && (
                                    <div className="w-full h-full flex items-center justify-center">
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
                            <div className="w-full h-full bg-neutral-900/30"></div> // Simple background
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
                  onOlder={() => changeActiveYearIndex((prev) => prev + 1)}
                  onNewer={() => changeActiveYearIndex((prev) => prev - 1)}
                  onNow={() => {
                    const nowIndex = cachedYears.findIndex(
                      (year) => year === "current"
                    );
                    if (nowIndex !== -1) {
                      changeActiveYearIndex(nowIndex);
                    }
                  }}
                  isOlderDisabled={activeYearIndex === cachedYears.length - 1}
                  isNewerDisabled={activeYearIndex === 0}
                  isNowDisabled={cachedYears[activeYearIndex] === "current"}
                  olderLabel={olderYearLabel}
                  newerLabel={newerYearLabel}
                  playClickSound={playClick}
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
                    ref={timelineRef}
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
                      maskImage: maskStyle,
                      WebkitMaskImage: maskStyle, // For Safari
                    }}
                  >
                    {cachedYears.map((year, index) => {
                      const isActive = activeYearIndex === index;
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
                            playClick(); // Play click sound
                            // Determine direction before updating index
                            if (index > activeYearIndex) {
                              setNavigationDirection("forward"); // Moving to older year (past)
                            } else if (index < activeYearIndex) {
                              setNavigationDirection("backward"); // Moving to newer year (future)
                            } else {
                              setNavigationDirection("none"); // No change
                            }
                            setActiveYearIndex(index); // Update index directly
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
                            {isNow ? "Now" : year}
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
                    onOlder={() => changeActiveYearIndex((prev) => prev + 1)}
                    onNewer={() => changeActiveYearIndex((prev) => prev - 1)}
                    onNow={() => {
                      const nowIndex = cachedYears.findIndex(
                        (year) => year === "current"
                      );
                      if (nowIndex !== -1) {
                        changeActiveYearIndex(nowIndex);
                      }
                    }}
                    isOlderDisabled={activeYearIndex === cachedYears.length - 1}
                    isNewerDisabled={activeYearIndex === 0}
                    isNowDisabled={cachedYears[activeYearIndex] === "current"}
                    olderLabel="Older"
                    newerLabel="Newer"
                    playClickSound={playClick}
                  />
                </div>
              </div>
            </motion.div>

            {/* Footer Bar - Remove absolute positioning, place at end of flex column */}
            <div
              className={`relative w-full flex-shrink-0 ${
                shaderEffectEnabled
                  ? "bg-neutral-900/80"
                  : "bg-neutral-900/60 backdrop-blur-sm"
              } border-t border-white/10 flex items-center justify-between px-4 z-20 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]
                           sm:h-10 sm:pt-0 sm:pb-0`}
            >
              {/* Add Share button to the far left */}
              <div className="w-8 flex items-center justify-start">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
                  onClick={handleSharePage}
                  aria-label="Share this page and time"
                >
                  <Share size={16} className="text-neutral-300" />
                </Button>
              </div>
              {/* Removed outer left spacer */}

              {/* Center URL and Travel button group */}
              <div className="flex items-center justify-center gap-3 flex-grow">
                <p className="text-sm text-neutral-300 truncate text-center">
                  {/* Show URL and conditionally year */}
                  {getHostname(currentUrl)}
                  {activeYear !== "current" && (
                    <span className="text-neutral-400 ml-1">
                      in {activeYear}
                    </span>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 h-6"
                  disabled={isGoButtonDisabled}
                  onClick={() => {
                    if (activeYear) {
                      playClick(); // Play click sound
                      onSelectYear(activeYear);
                      handleClose(); // Use handleClose to play sound
                    }
                  }}
                >
                  Travel
                </Button>
              </div>

              {/* Right shader menu - Always shown */}
              <div className="w-8 flex items-center justify-end">
                {/* Shader selector dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <Blend size={16} className="text-neutral-300" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-black border-[#3a3a3a] text-white"
                  >
                    {[...Object.values(ShaderType), "off"].map((type) => {
                      const isSelected =
                        type === "off"
                          ? !shaderEffectEnabled
                          : shaderEffectEnabled && selectedShaderType === type;
                      return (
                        <DropdownMenuItem
                          key={type}
                          className={cn(
                            "font-geneva-12 text-[12px] flex items-center justify-between",
                            isSelected && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => {
                            if (type === "off") {
                              setShaderEffectEnabled(false);
                            } else {
                              setShaderEffectEnabled(true);
                              setSelectedShaderType(type as ShaderType);
                            }
                            playClick(); // Play click sound on shader change
                          }}
                        >
                          {shaderNames[type as ShaderOption]}
                          {isSelected && <span className="ml-2">✓</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </motion.div>, document.body)
        }
      </AnimatePresence>

      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="Page"
        itemIdentifier={currentUrl}
        secondaryIdentifier={activeYear || currentSelectedYear}
        title={getHostname(currentUrl)} // Using hostname as title
        generateShareUrl={timeMachineGenerateShareUrl}
      />
    </>
  );
};

export default TimeMachineView;
