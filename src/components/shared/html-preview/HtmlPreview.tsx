import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { ArrowsIn, Copy, Check, DownloadSimple, Code, Export, DotsSixVertical, Plus } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import {
  loadHtmlPreviewSplit,
  saveHtmlPreviewSplit,
} from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { getAppletSandboxAttribute } from "@/utils/appletAuthBridge";
import { useTranslation } from "react-i18next";
import { useEventListener } from "@/hooks/useEventListener";
import type { HtmlPreviewProps } from "./types";
import { APPLET_ICON_STYLES } from "./constants";
import { useAppletAuthMessaging } from "./hooks/useAppletAuthMessaging";
import { useHtmlPreviewSounds } from "./hooks/useHtmlPreviewSounds";
import { useProcessedHtml } from "./hooks/useProcessedHtml";
import { useStreamPreview } from "./hooks/useStreamPreview";
import { useHtmlPreviewSave } from "./hooks/useHtmlPreviewSave";
import { HtmlPreviewLoadingPulse } from "./components/HtmlPreviewLoadingPulse";
import { HtmlPreviewAppletBanner } from "./components/HtmlPreviewAppletBanner";
import { HtmlPreviewCornerToolbar } from "./components/HtmlPreviewCornerToolbar";

export default function HtmlPreview({
  htmlContent,
  appletTitle = "",
  appletIcon = "",
  onInteractionChange,
  isStreaming = false,
  maxHeight = "800px",
  minHeight = "200px",
  minWidth,
  initialFullScreen = false,
  className = "",
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
  maximizeSound: propMaximizeSound,
  minimizeSound: propMinimizeSound,
  isInternetExplorer = false,
  baseUrlForAiContent,
  mode = "now",
  appletCreatedBy = null,
}: HtmlPreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(initialFullScreen);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isSplitView, setIsSplitView] = useState(loadHtmlPreviewSplit());
  const [originalHeight, setOriginalHeight] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const wasDragging = useRef(false);
  const lastDragEndTime = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { t } = useTranslation();

  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const iframeId = useRef(
    `iframe-${Math.random().toString(36).substring(2, 9)}`
  ).current;
  const prevStreamingRef = useRef(isStreaming);
  const dragControls = useDragControls();
  // Ref to store the final processed HTML content after streaming
  const finalProcessedHtmlRef = useRef<string | null>(null);
  const terminalSoundsEnabled = useAudioSettingsStore(
    (state) => state.terminalSoundsEnabled
  );
  const { isMacOSTheme: isMacOsXTheme } = useThemeFlags();

  const normalizedBaseUrl = baseUrlForAiContent
    ? baseUrlForAiContent.startsWith("http")
      ? baseUrlForAiContent
      : `https://${baseUrlForAiContent}`
    : null;

  const { isTrustedApplet, sendAuthPayload } = useAppletAuthMessaging(
    appletCreatedBy,
    iframeRef,
    fullscreenIframeRef
  );
  const sandboxAttribute = getAppletSandboxAttribute(isTrustedApplet);

  const { maximizeSound, minimizeSound } = useHtmlPreviewSounds(
    propMaximizeSound,
    propMinimizeSound
  );

  const { processedHtmlContent, processedHtmlContentForSave } = useProcessedHtml(
    htmlContent,
    normalizedBaseUrl,
    isTrustedApplet
  );

  const streamPreviewHtml = useStreamPreview(htmlContent, isStreaming);

  const {
    isSaveAppletDialogOpen,
    setIsSaveAppletDialogOpen,
    appletFileName,
    setAppletFileName,
    handleSaveAppletSubmit,
    handleSaveAsApplet,
    handleSaveToDisk,
  } = useHtmlPreviewSave(
    appletTitle,
    appletIcon,
    processedHtmlContent,
    processedHtmlContentForSave
  );

  useEffect(() => {
    saveHtmlPreviewSplit(isSplitView);
  }, [isSplitView]);

  useEffect(() => {
    if (isFullScreen && previewRef.current && !originalHeight) {
      const height = `${previewRef.current.offsetHeight}px`;
      setOriginalHeight(height);
    }
  }, [isFullScreen, originalHeight]);

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
  }, [checkMobile]);

  useEventListener("resize", checkMobile);

  // Listen for ESC key to exit fullscreen
  useEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        minimizeSound.play();
        setIsFullScreen(false);
      }
    },
    isFullScreen ? document : null
  );

  // Function to update iframe content (now only called after streaming)
  const updateIframeContent = useCallback(
    (finalContent: string) => {
      requestAnimationFrame(() => {
        // Update inline iframe
        if (iframeRef.current) {
          iframeRef.current.srcdoc = finalContent;
          setTimeout(() => {
            sendAuthPayload(iframeRef.current?.contentWindow || null);
          }, 0);
        }

        // Update fullscreen iframe if it exists
        if (fullscreenIframeRef.current) {
          fullscreenIframeRef.current.srcdoc = finalContent;
          setTimeout(() => {
            sendAuthPayload(fullscreenIframeRef.current?.contentWindow || null);
          }, 0);
        }
      });
    },
    [sendAuthPayload]
  );

  // NEW: Effect to update iframe *after* streaming finishes or when content changes while not streaming
  useEffect(() => {
    if (!isStreaming) {
      // Generate the final content ONLY when needed
      const finalContent = processedHtmlContent;
      finalProcessedHtmlRef.current = finalContent; // Store for fullscreen/code view
      updateIframeContent(finalContent);
    }
    // Dependency: htmlContent ensures update if content changes *after* streaming
    // Dependency: isStreaming ensures update when streaming stops
    }, [isStreaming, htmlContent, processedHtmlContent, updateIframeContent]);

  // Play music and cancel when unmounting for streaming content
  useEffect(() => {
    if (isStreaming && playElevatorMusic && terminalSoundsEnabled) {
      playElevatorMusic(mode);
      return () => {
        if (stopElevatorMusic) {
          stopElevatorMusic();
        }
      };
    }
  }, [
    isStreaming,
    playElevatorMusic,
    stopElevatorMusic,
    mode,
    terminalSoundsEnabled,
  ]);

  // Play a completion sound when streaming ends
  useEffect(() => {
    if (
      prevStreamingRef.current &&
      !isStreaming &&
      playDingSound &&
      stopElevatorMusic &&
      terminalSoundsEnabled
    ) {
      playDingSound();
      stopElevatorMusic();
    }
    prevStreamingRef.current = isStreaming;
    }, [isStreaming, playDingSound, stopElevatorMusic, terminalSoundsEnabled]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopySuccess(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFullScreen) {
      maximizeSound.play();
      // Ensure content is updated when going fullscreen
      const finalContent =
        finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    } else {
      minimizeSound.play();
    }
    setIsFullScreen(!isFullScreen);
  };

  // Add effect to update fullscreen content when it changes
  useEffect(() => {
    if (isFullScreen && !isStreaming) {
      const finalContent =
        finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    }
    }, [isFullScreen, isStreaming, processedHtmlContent, updateIframeContent]);

  // Document-level mouse move handler
  const handleDocumentMouseMove = (e: MouseEvent) => {
    const deltaX = Math.abs(e.clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.clientY - lastDragEndTime.current);

    if (deltaX > 5 || deltaY > 5) {
      setIsDragging(true);
      wasDragging.current = true;
    }
  };

  // Document-level touch move handler
  const handleDocumentTouchMove = (e: TouchEvent) => {
    if (!e.touches[0]) return;

    const deltaX = Math.abs(e.touches[0].clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.touches[0].clientY - lastDragEndTime.current);

    if (deltaX > 5 || deltaY > 5) {
      wasDragging.current = true;
    }
  };

  // Document-level mouse up handler
  const handleDocumentMouseUp = () => {
    cleanup();
  };

  // Document-level touch end handler
  const handleDocumentTouchUp = () => {
    cleanup();
  };

  // Clean up all handlers
  const cleanup = () => {
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("touchmove", handleDocumentTouchMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
    document.removeEventListener("touchend", handleDocumentTouchUp);

    // Reset dragging state after cooldown
    setTimeout(() => {
      setIsDragging(false);
    }, 150);
  };

  // Function to handle toolbar toggle
  const toggleToolbarCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isDragging) {
      setIsToolbarCollapsed(!isToolbarCollapsed);
      if (!isToolbarCollapsed) {
        minimizeSound.play();
      } else {
        maximizeSound.play();
      }
    }
  };

  // Handle direct click on plus icon (when collapsed)
  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToolbarCollapsed(false);
    maximizeSound.play();
  };

  // Normal inline display with optional maximized height
  return (
    <>
      {!isInternetExplorer && (appletTitle || appletIcon) && (
        <style>{APPLET_ICON_STYLES}</style>
      )}
      <motion.div
        ref={previewRef}
        className={`${
          isInternetExplorer ? "" : "rounded"
        } bg-white m-0 relative ${className} ${
          isStreaming ? "loading-pulse" : ""
        } ${
          !isInternetExplorer && (appletTitle || appletIcon) ? "flex flex-col overflow-hidden" : isInternetExplorer ? "overflow-hidden" : "overflow-auto"
        }`}
        style={{
          maxHeight: isInternetExplorer
            ? "100%"
            : isFullScreen
            ? originalHeight || minHeight
            : maxHeight,
          // pointerEvents: isStreaming ? "none" : "auto", // Allow interaction with text stream potentially
          opacity: isFullScreen ? 0 : 1,
          height: isInternetExplorer
            ? "100%"
            : isFullScreen
            ? originalHeight || minHeight
            : "auto",
          boxShadow: isInternetExplorer
            ? "none"
            : isFullScreen
            ? "none"
            : "0 0 0 1px rgba(0, 0, 0, 0.3)",
          visibility: isFullScreen ? "hidden" : "visible",
          minHeight: minHeight, // Ensure minHeight is respected
          minWidth: minWidth, // Apply minWidth if provided
        }}
        animate={{
          opacity: isFullScreen ? 0 : 1,
        }}
        transition={{
          opacity: {
            duration: 0.3,
            ease: "easeInOut",
          },
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => !isStreaming && onInteractionChange?.(true)}
        onMouseLeave={() => !isStreaming && onInteractionChange?.(false)}
        tabIndex={-1}
      >
        {/* Loading PULSE overlay (now breathing effect) */}
        {isStreaming && <HtmlPreviewLoadingPulse />}

        {!isInternetExplorer && (appletTitle || appletIcon) && (
          <HtmlPreviewAppletBanner
            appletIcon={appletIcon}
            appletTitle={appletTitle}
            isStreaming={isStreaming}
            onSave={handleSaveAsApplet}
          />
        )}

        {!isInternetExplorer && !(appletTitle || appletIcon) && (
          <HtmlPreviewCornerToolbar
            isStreaming={isStreaming}
            isFullScreen={isFullScreen}
            copySuccess={copySuccess}
            onSaveAsApplet={handleSaveAsApplet}
            onSaveToDisk={handleSaveToDisk}
            onCopy={handleCopy}
            onToggleFullScreen={toggleFullScreen}
          />
        )}
        {/* Conditional Rendering: Text Stream or Iframe */}
        {isStreaming && htmlContent ? (
          <div
            className={`size-full relative overflow-auto ${
              !isInternetExplorer && (appletTitle || appletIcon) ? "flex-1" : ""
            }`}
            style={{
              maxHeight: isInternetExplorer
                ? "100%"
                : typeof minHeight === "string"
                ? minHeight
                : `${minHeight}px`,
            }}
          >
            {streamPreviewHtml ? (
              <div
                className={`generated-html-stream ${
                  isMacOsXTheme ? "" : "font-geneva-12"
                }`}
                dangerouslySetInnerHTML={{ __html: streamPreviewHtml }}
              />
            ) : (
              <pre
                className={`p-2 text-[12px] ${
                  isMacOsXTheme ? "font-mono" : "font-monaco"
                } antialiased text-neutral-700 whitespace-pre-wrap break-words`}
              >
                {htmlContent.split("\n").slice(-8).join("\n")}
              </pre>
            )}
          </div>
        ) : (
          <motion.iframe
            ref={iframeRef}
            id={iframeId}
            // srcDoc is now set by useEffect after streaming finishes
            // srcDoc={processedHtmlContent()}
            title={t("common.htmlPreview.codePreviewTitle")}
            className={`border-0 block ${
              !isInternetExplorer && (appletTitle || appletIcon) ? "flex-1" : ""
            }`}
            sandbox={sandboxAttribute}
            style={{
              width: isInternetExplorer ? "calc(100% + 1px)" : "100%",
              height: isInternetExplorer
                ? "calc(100% + 1px)"
                : !isInternetExplorer && (appletTitle || appletIcon)
                ? "100%"
                : typeof minHeight === "string"
                ? minHeight
                : `${minHeight}px`,
              display: "block",
              margin: 0,
              padding: 0,
              // pointerEvents: isStreaming ? "none" : "auto", // Already handled by parent div conditional
              position: "relative",
              zIndex: 1,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onLoad={() =>
                sendAuthPayload(iframeRef.current?.contentWindow || null)
              }
          />
        )}
      </motion.div>

      {/* Fullscreen overlay */}
      {createPortal(
        <AnimatePresence mode="wait">
          {isFullScreen && (
            <motion.div
              className="fixed inset-0 z-[9999] flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => {
                minimizeSound.play();
                setIsFullScreen(false);
              }}
            >
              <motion.div
                className="absolute inset-0 flex flex-col"
                initial={{
                  y: "15%",
                  opacity: 0,
                }}
                animate={{
                  y: 0,
                  opacity: 1,
                }}
                exit={{
                  y: "15%",
                  opacity: 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 250,
                  damping: 25,
                }}
              >
                <div
                  ref={fullscreenWrapperRef}
                  className="relative size-full overflow-hidden"
                >
                  {/* Code view layer - always 100% width underneath */}
                  <AnimatePresence>
                    {showCode ? (
                      <motion.div
                        key="code"
                        className="absolute inset-0 bg-[#24292e] overflow-auto p-4 z-10"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <pre className="text-[12px] font-monaco text-neutral-300 whitespace-pre-wrap break-words m-0">
                          {finalProcessedHtmlRef.current || processedHtmlContent}
                        </pre>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* Preview iframe layer - positioned above code OR Text stream */}
                  <motion.div
                    className="absolute z-100 bg-white" // Added bg-white for text stream background
                    initial={false}
                    animate={{
                      width:
                        isSplitView && showCode
                          ? isMobile
                            ? "100%"
                            : "50%"
                          : "100%",
                      height:
                        isSplitView && showCode
                          ? isMobile
                            ? "50%"
                            : "100%"
                          : "100%",
                      right: 0,
                      opacity: showCode && !isSplitView ? 0 : 1,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.25, 0.1, 0.25, 1.0],
                    }}
                    style={{
                      position: "absolute",
                      top: showCode && isSplitView && isMobile ? "50%" : 0,
                      right: 0,
                      overflow: "hidden", // Clip content
                    }}
                  >
                    {/* Fullscreen Conditional Rendering: Text Stream or Iframe */}
                    {isStreaming && htmlContent ? (
                      <motion.div
                        className="size-full overflow-auto"
                        initial={{ opacity: 0.8, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        {streamPreviewHtml ? (
                          <div
                            className={`generated-html-stream ${
                              isMacOsXTheme ? "" : "font-geneva-12"
                            } text-sm p-4`}
                            dangerouslySetInnerHTML={{
                              __html: streamPreviewHtml,
                            }}
                          />
                        ) : (
                          <pre
                            className={`p-4 text-xs ${
                              isMacOsXTheme ? "font-sans" : "font-geneva-12"
                            } text-neutral-700 whitespace-pre-wrap break-words`}
                          >
                            {htmlContent.split("\n").slice(-15).join("\n")}
                          </pre>
                        )}
                      </motion.div>
                    ) : (
                      <iframe
                        ref={fullscreenIframeRef}
                        id={`fullscreen-${iframeId}`}
                        // srcDoc is now set by useEffect after streaming finishes
                        // srcDoc={processedHtmlContent()}
                        title={t("common.htmlPreview.codePreviewTitleFullscreen")}
                        className="border-0 bg-white size-full"
                        sandbox={sandboxAttribute}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onLoad={() =>
                          sendAuthPayload(
                            fullscreenIframeRef.current?.contentWindow || null
                          )
                        }
                        style={{
                          display: "block",
                          margin: 0,
                          padding: 0,
                          pointerEvents: isDragging ? "none" : "auto",
                          ...(isInternetExplorer && {
                            position: "absolute",
                            inset: 0,
                          }),
                        }}
                      />
                    )}

                    {/* Loading PULSE overlay for fullscreen (kept for visual feedback) */}
                    {isStreaming && htmlContent && (
                      <div
                        className="absolute inset-0 bg-neutral-100 z-10 pointer-events-none"
                        style={{ opacity: 0.2 }}
                      >
                        <motion.div
                          className="size-full bg-neutral-400"
                          animate={{
                            opacity: [0.05, 0.2, 0.05],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      </div>
                    )}
                  </motion.div>

                  {/* Toolbar - topmost layer */}
                  <motion.div
                    ref={controlsRef}
                    className="absolute z-200"
                    initial={false}
                    drag
                    dragControls={dragControls}
                    dragConstraints={fullscreenWrapperRef}
                    dragElastic={0.2}
                    dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
                    dragSnapToOrigin={false}
                    whileDrag={{ scale: 1.05 }}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={() => {
                      // Set a short timeout to delay resetting isDragging
                      // This prevents click handlers from firing right after drag
                      if (clickTimerRef.current) {
                        clearTimeout(clickTimerRef.current);
                      }

                      clickTimerRef.current = setTimeout(() => {
                        setIsDragging(false);
                      }, 100);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      top: 0,
                      right: 0,
                      padding: 16,
                      minHeight: "40px",
                      minWidth: "40px",
                    }} // Default position: top-right
                  >
                    <motion.div
                      className="bg-neutral-700/40 backdrop-blur-sm rounded-full overflow-hidden flex items-center justify-center gap-1"
                      layout
                      onClick={(e) => e.stopPropagation()}
                      initial={false}
                      animate={{
                        width: isToolbarCollapsed ? "40px" : "auto",
                        height: isToolbarCollapsed ? "40px" : "40px",
                        padding: isToolbarCollapsed ? "0px" : "4px",
                      }}
                      transition={{
                        duration: 0.15,
                      }}
                    >
                      {/* Plus icon - only visible when collapsed */}
                      <motion.div
                        className="absolute size-[40px] flex items-center justify-center group hover:scale-110 transition-all duration-200"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 1 : 0,
                        }}
                        transition={{ duration: 0.2 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? "auto" : "none",
                          cursor: "pointer",
                        }}
                        onClick={handlePlusClick}
                      >
                        <Plus
                          size={24}
                          className="text-white/40 group-hover:text-white transition-all duration-200"
                        />
                      </motion.div>

                      {/* Toolbar content - hidden when collapsed with zero width but still in DOM */}
                      <motion.div
                        className="flex items-center justify-center"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 0 : 1,
                          width: isToolbarCollapsed ? 40 : "auto",
                        }}
                        transition={{ duration: 0.15 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? "none" : "auto",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group cursor-move"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragControls.start(e);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleToolbarCollapse(e);
                          }}
                        >
                          <DotsSixVertical
                            size={18}
                            className="text-white/70 group-hover:text-white"
                          />
                        </div>

                        {showCode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSplitView(!isSplitView);
                              if (!isSplitView) {
                                minimizeSound.play();
                              } else {
                                maximizeSound.play();
                              }
                            }}
                            className="flex items-center justify-center px-2 h-8 hover:bg-white/10 rounded-full group text-sm font-geneva-12"
                            aria-label={t("common.htmlPreview.toggleSplitView")}
                          >
                            <span className="text-white/70 group-hover:text-white">
                              {isSplitView
                                ? t("common.htmlPreview.split")
                                : t("common.htmlPreview.full")}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!showCode) {
                              setShowCode(true);
                              setIsSplitView(true);
                              maximizeSound.play();
                            } else {
                              setShowCode(false);
                              setIsSplitView(false);
                              minimizeSound.play();
                            }
                          }}
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group"
                          aria-label={t("common.htmlPreview.toggleCode")}
                        >
                          <Code
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleSaveAsApplet}
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group"
                          aria-label={t("common.htmlPreview.saveApplet")}
                        >
                          <DownloadSimple
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleSaveToDisk}
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group"
                          aria-label={t("common.htmlPreview.downloadHtml")}
                        >
                          <Export
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group"
                          aria-label={t("common.htmlPreview.copyHtml")}
                        >
                          {copySuccess ? (
                            <Check
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          ) : (
                            <Copy
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            minimizeSound.play();
                            setIsFullScreen(false);
                          }}
                          className="flex items-center justify-center size-8 hover:bg-white/10 rounded-full group"
                          aria-label={t("common.htmlPreview.exitFullscreen")}
                        >
                          <ArrowsIn
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <InputDialog
        isOpen={isSaveAppletDialogOpen}
        onOpenChange={setIsSaveAppletDialogOpen}
        onSubmit={handleSaveAppletSubmit}
        title={t("common.htmlPreview.saveApplet")}
        description={t("common.htmlPreview.saveAppletDescription")}
        value={appletFileName}
        onChange={setAppletFileName}
      />
    </>
  );
}
