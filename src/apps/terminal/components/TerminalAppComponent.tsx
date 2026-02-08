import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { TerminalMenuBar } from "./TerminalMenuBar";
import { appMetadata } from "../index";
import HtmlPreview from "@/components/shared/HtmlPreview";
import {
  isHtmlCodeBlock,
  extractHtmlContent,
} from "@/components/shared/htmlPreviewUtils";
import { useSound, Sounds } from "@/hooks/useSound";
import { getTranslatedAppName } from "@/utils/i18n";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import i18n from "@/lib/i18n";
import { TerminalToolInvocation } from "./TerminalToolInvocation";
import { VimEditor } from "./VimEditor";
import { TypewriterText } from "./TypewriterText";
import { parseSimpleMarkdown } from "./typewriterMarkdown";
import { AnimatedEllipsis } from "./AnimatedEllipsis";
import { UrgentMessageAnimation } from "./UrgentMessageAnimation";
import {
  cleanUrgentPrefix,
  isUrgentMessage,
  useTerminalLogic,
} from "../hooks/useTerminalLogic";

// Component to render HTML previews
interface HtmlPreviewProps {
  htmlContent: string;
  onInteractionChange: (isInteracting: boolean) => void;
  isStreaming?: boolean;
}

function TerminalHtmlPreview({
  htmlContent,
  onInteractionChange,
  isStreaming = false,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
}: HtmlPreviewProps & {
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}) {
  // Get UI sound hooks
  const maximizeSound = useSound(Sounds.WINDOW_EXPAND);
  const minimizeSound = useSound(Sounds.WINDOW_COLLAPSE);

  return (
    <HtmlPreview
      htmlContent={htmlContent}
      onInteractionChange={onInteractionChange}
      isStreaming={isStreaming}
      playElevatorMusic={playElevatorMusic}
      stopElevatorMusic={stopElevatorMusic}
      playDingSound={playDingSound}
      maximizeSound={maximizeSound}
      minimizeSound={minimizeSound}
      className="select-text"
    />
  );
}

// parseSimpleMarkdown is imported from TypewriterText exports

// TypewriterText component has been extracted to separate file

// AnimatedEllipsis component has been extracted to separate file

export function TerminalAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    currentCommand,
    setCurrentCommand,
    commandHistory,
    fontSize,
    spinnerIndex,
    spinnerChars,
    isInAiMode,
    isAiLoading,
    aiMessages,
    handleCommandSubmit,
    handleKeyDown,
    inputFocused,
    setInputFocused,
    inputRef,
    terminalRef,
    currentPath,
    isClearingTerminal,
    animatedLines,
    handleScroll,
    handleHtmlPreviewInteraction,
    isMuted,
    toggleMute,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    terminalFlash,
    isInVimMode,
    vimFile,
    vimPosition,
    vimCursorLine,
    vimCursorColumn,
    vimMode,
    vimSearchPattern,
    vimVisualStartLine,
    handleVimTextInput,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
    bringInstanceToForeground,
    handleClearTerminal,
    isXpTheme,
    shouldApplyMarkdown,
  } = useTerminalLogic({ isForeground });

  // Animation variants for terminal lines
  const lineVariants = {
    initial: {
      opacity: 0,
      y: 10,
      filter: "blur(2px)",
    },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 25,
        mass: 0.8,
      },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  };

  // VimEditor component has been extracted to separate file

  // Add a helper function to render the main terminal or vim editor
  const renderMainContent = () => {
    if (isInVimMode && vimFile) {
      return (
        <div className="mb-4">
          <VimEditor
            file={vimFile}
            position={vimPosition}
            vimCursorLine={vimCursorLine}
            vimCursorColumn={vimCursorColumn}
            vimMode={vimMode}
            searchPattern={vimSearchPattern}
            visualStartLine={vimVisualStartLine}
          />
          <div className="flex items-center mt-1">
            <span
              className="text-green-400 mr-1 flex-shrink-0"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: `${Math.round(fontSize * 1.5)}px`,
                height: `${Math.round(fontSize * 1.5)}px`,
                fontFamily: "inherit",
              }}
            >
              {vimMode === "normal" || vimMode === "insert" || vimMode === "visual"
                ? ""
                : vimMode === "command"
                  ? ":"
                  : vimMode === "search"
                    ? "/"
                    : ""}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={
                vimMode === "insert"
                  ? handleVimTextInput
                  : (e) => setCurrentCommand(e.target.value)
              }
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className={`flex-1 bg-transparent text-white font-monaco focus:outline-none terminal-input ${
                inputFocused ? "input--focused" : ""
              }`}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: `${Math.round(fontSize * 1.5)}px`,
                height: `${Math.round(fontSize * 1.5)}px`,
                fontFamily: "inherit",
              }}
              autoFocus
            />
          </div>
        </div>
      );
    }

    return (
      <>
        <AnimatePresence>
          {commandHistory.map((item, index) => (
            <motion.div
              key={index}
              className="mb-1 select-text cursor-text"
              variants={lineVariants}
              initial="initial"
              animate={
                isClearingTerminal
                  ? {
                      opacity: 0,
                      y: -100,
                      filter: "blur(4px)",
                      transition: {
                        duration: 0.3,
                        delay: 0.02 * (commandHistory.length - index),
                      },
                    }
                  : "animate"
              }
              exit="exit"
            >
              {item.command && (
                <div className="flex select-text">
                  {item.path === "ai-user" ? (
                    <span className="text-purple-400 mr-2 select-text cursor-text">
                      <span className="inline-block w-2 text-center">→</span>{" "}
                      ryo
                    </span>
                  ) : (
                    <span className="text-green-400 mr-2 select-text cursor-text">
                      <span className="inline-block w-2 text-center">→</span>{" "}
                      {item.path === "/" ? "/" : item.path}
                    </span>
                  )}
                  <span className="select-text cursor-text">
                    {item.command}
                  </span>
                </div>
              )}
              {(item.output ||
                (item.toolInvocations && item.toolInvocations.length > 0)) && (
                <div
                  className={`ml-0 select-text ${
                    item.path === "ai-thinking" ? "text-gray-400" : ""
                  } ${item.path === "ai-assistant" ? "text-purple-100" : ""} ${
                    item.path === "ai-error" ? "text-red-400" : ""
                  } ${item.path === "welcome-message" ? "text-gray-400" : ""} ${
                    // Add urgent message styling
                    item.output && isUrgentMessage(item.output)
                      ? "text-red-400"
                      : ""
                  } ${
                    // System messages (errors, usage hints) styled in gray
                    item.isSystemMessage ? "text-gray-400" : ""
                  }`}
                >
                  {item.path === "ai-thinking" ? (
                    <div>
                      <span className="gradient-spin">
                        <span className="inline-block w-2 text-center">
                          {(item.output || "").split(" ")[0]}
                        </span>{" "}
                        ryo
                      </span>
                      <span className="text-gray-500 italic shimmer-subtle">
                        {" "}
                        {i18n.t("apps.terminal.output.isThinking")}
                        <AnimatedEllipsis />
                      </span>
                    </div>
                  ) : item.path === "ai-assistant" ? (
                    <div className="select-text cursor-text">
                      {(() => {
                        // Process the message to extract HTML and text parts
                        const { htmlContent, textContent, hasHtml } =
                          extractHtmlContent(item.output || "");

                        // Check if this is an urgent message
                        const urgent = isUrgentMessage(item.output || "");
                        // Clean content by removing !!!! prefix if urgent
                        const cleanedTextContent = urgent
                          ? cleanUrgentPrefix(textContent || "")
                          : textContent;

                        // Only mark as streaming if this specific message is the one currently being updated
                        const isThisMessageStreaming =
                          isAiLoading &&
                          aiMessages.length > 0 &&
                          aiMessages[aiMessages.length - 1].id ===
                            item.messageId &&
                          index === commandHistory.length - 1;

                        return (
                          <>
                            {/* Render tool invocations FIRST (before text content) */}
                            {item.toolInvocations &&
                              item.toolInvocations.length > 0 && (
                                <div className="space-y-0.5 mb-1">
                                  {item.toolInvocations.map(
                                    (invocation, invIdx) => (
                                      <TerminalToolInvocation
                                        key={`${item.messageId}-tool-${invIdx}`}
                                        invocation={invocation}
                                        fontSize={fontSize}
                                      />
                                    )
                                  )}
                                </div>
                              )}

                            {/* Show only non-HTML text content with markdown parsing */}
                            {cleanedTextContent &&
                              (() => {
                                const parts = cleanedTextContent.split("\n");
                                return parts.map((line, idx) => {
                                  const trimmed = line.trimStart();
                                  const isSpin = trimmed.startsWith(":::");
                                  const isRes = trimmed.startsWith("→");
                                  const displayLine = isSpin
                                    ? line.replace(
                                        ":::",
                                        spinnerChars[spinnerIndex]
                                      )
                                    : line;
                                  const cls = urgent
                                    ? "text-red-300"
                                    : isSpin
                                      ? "gradient-spin italic"
                                      : isRes
                                        ? "text-gray-400"
                                        : "text-purple-300";
                                  return (
                                    <span
                                      key={idx}
                                      className={`select-text cursor-text ${cls}`}
                                    >
                                      {idx > 0 && <br />}
                                      {idx === 0 && urgent && (
                                        <UrgentMessageAnimation />
                                      )}
                                      {parseSimpleMarkdown(displayLine)}
                                    </span>
                                  );
                                });
                              })()}

                            {/* Show HTML preview if there's HTML content */}
                            {hasHtml && htmlContent && (
                              <TerminalHtmlPreview
                                htmlContent={htmlContent}
                                onInteractionChange={
                                  handleHtmlPreviewInteraction
                                }
                                isStreaming={isThisMessageStreaming}
                                playElevatorMusic={playElevatorMusic}
                                stopElevatorMusic={stopElevatorMusic}
                                playDingSound={playDingSound}
                              />
                            )}

                            {/* Render aquarium tool visually when present */}
                            {item.hasAquarium && (
                              <div className="mt-1">
                                <EmojiAquarium />
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : animatedLines.has(index) ? (
                    <>
                      {isUrgentMessage(item.output) && (
                        <UrgentMessageAnimation />
                      )}
                      <TypewriterText
                        text={
                          isUrgentMessage(item.output)
                            ? cleanUrgentPrefix(item.output)
                            : item.output
                        }
                        speed={10}
                        className=""
                        renderMarkdown={shouldApplyMarkdown(item.path)}
                      />
                    </>
                  ) : (
                    <>
                      {isUrgentMessage(item.output) && (
                        <UrgentMessageAnimation />
                      )}
                      {isUrgentMessage(item.output)
                        ? shouldApplyMarkdown(item.path)
                          ? parseSimpleMarkdown(cleanUrgentPrefix(item.output))
                          : cleanUrgentPrefix(item.output)
                        : shouldApplyMarkdown(item.path)
                          ? parseSimpleMarkdown(item.output)
                          : item.output}
                      {isHtmlCodeBlock(item.output).isHtml && (
                        <TerminalHtmlPreview
                          htmlContent={isHtmlCodeBlock(item.output).content}
                          onInteractionChange={handleHtmlPreviewInteraction}
                          isStreaming={false}
                          playElevatorMusic={playElevatorMusic}
                          stopElevatorMusic={stopElevatorMusic}
                          playDingSound={playDingSound}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="relative select-text">
          <form
            onSubmit={handleCommandSubmit}
            className="flex items-center transition-all duration-200 select-text"
          >
            {isInAiMode ? (
              <span
                className="text-purple-400 mr-2 whitespace-nowrap select-text cursor-text flex-shrink-0"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: "inherit",
                }}
              >
                {isAiLoading ? (
                  <span>
                    <span className="gradient-spin">
                      <span className="inline-block w-2 text-center">
                        {spinnerChars[spinnerIndex]}
                      </span>{" "}
                      ryo
                    </span>
                  </span>
                ) : (
                  <>
                    <span className="inline-block w-2 text-center">→</span> ryo
                  </>
                )}
              </span>
            ) : (
              <span
                className="text-green-400 mr-2 whitespace-nowrap select-text cursor-text flex-shrink-0"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: "inherit",
                }}
              >
                <span className="inline-block w-2 text-center">→</span>{" "}
                {currentPath === "/" ? "/" : currentPath}
              </span>
            )}
            <div className="flex-1 relative min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                }}
                className={`w-full text-white font-monaco focus:outline-none bg-transparent terminal-input ${
                  inputFocused ? "input--focused" : ""
                }`}
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: "inherit",
                }}
                autoFocus
              />
              {isAiLoading && isInAiMode && (
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center">
                  <span className="text-gray-400/40 opacity-30 shimmer">
                    {i18n.t("apps.terminal.output.isThinking")}
                    <AnimatedEllipsis />
                  </span>
                </div>
              )}
            </div>
          </form>
        </div>
      </>
    );
  };

  const menuBar = (
    <TerminalMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClear={handleClearTerminal}
      onIncreaseFontSize={increaseFontSize}
      onDecreaseFontSize={decreaseFontSize}
      onResetFontSize={resetFontSize}
      onToggleMute={toggleMute}
      isMuted={isMuted}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        appId="terminal"
        title={getTranslatedAppName("terminal")}
        onClose={onClose}
        isForeground={isForeground}
        material="transparent"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <motion.div
          className="terminal-content flex flex-col h-full w-full bg-black/80 backdrop-blur-lg text-white antialiased font-monaco overflow-hidden select-text"
          style={
            {
              // Use CSS custom property to allow !important override in macOS theme
              "--terminal-font-size": `${fontSize}px`,
              fontSize: `${fontSize}px`,
              fontFamily:
                '"Monaco", "ArkPixel", "SerenityOS-Emoji", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
            } as CSSProperties
          }
          animate={
            terminalFlash
              ? {
                  filter: [
                    "brightness(1)",
                    "brightness(1.5)",
                    "brightness(1)",
                  ],
                  scale: [1, 1.01, 1],
                }
              : {}
          }
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div
            ref={terminalRef}
            className="flex-1 overflow-auto whitespace-pre-wrap select-text cursor-text p-2"
            onClick={(e) => {
              // Only focus input if this isn't a text selection
              if (window.getSelection()?.toString() === "") {
                e.stopPropagation();
                inputRef.current?.focus();
                if (!isForeground) {
                  bringInstanceToForeground(instanceId);
                }
              }
            }}
            onScroll={handleScroll}
          >
            {renderMainContent()}
          </div>
        </motion.div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="terminal"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={
          appMetadata || {
            name: "Terminal",
            version: "1.0",
            creator: {
              name: "Ryo Lu",
              url: "https://ryo.lu",
            },
            github: "https://github.com/ryokun6/ryos",
            icon: "/icons/default/terminal.png",
          }
        }
        appId="terminal"
      />
    </>
  );
}
