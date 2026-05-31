import {
  Copy,
  Check,
  Trash,
  SpeakerHigh,
  Pause,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  ToolInvocationMessage,
  type ToolInvocationPart,
} from "@/components/shared/ToolInvocationMessage";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LinkPreview } from "@/components/shared/LinkPreview";
import { ImageAttachment } from "@/components/shared/ImageAttachment";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { segmentChatMarkdownText } from "@/lib/chatMarkdown";
import { getVisibleTextPartText } from "../../utils/aiMessageText";
import {
  applyTtsHighlight,
  clearTtsHighlight,
} from "../../utils/ttsHighlight";
import { TypingDots } from "../TypingBubble";
import { CHAT_BUBBLE_VARIANTS, MOTION_BTN_INITIAL } from "./constants";
import {
  Streamdown,
  CHAT_STREAMDOWN_ANIMATED,
  CHAT_STREAMDOWN_PLUGINS,
  CHAT_STREAMDOWN_SHIKI_THEME,
  STREAMDOWN_DISALLOWED_ELEMENTS,
  chatStreamdownComponents,
  getChatMessageStyle,
} from "./streamdown";
import type { ChatMessageItemProps } from "./types";
import {
  extractImageParts,
  getAppName,
  getMessageText,
  getUserColorClass,
  isEmojiOnly,
  isUrlOnly,
  isUrgentMessage,
} from "./utils";

export const ChatMessageItem = memo(function ChatMessageItem(
  props: ChatMessageItemProps
) {
  const { t } = useTranslation();
  const {
    message,
    messageKey,
    isInitialMessage,
    isStreamingMessage,
    isLoading,
    isLoadingGreeting,
    isRoomView,
    fontSize,
    isMacOSTheme,
    copiedMessageId,
    playingMessageId,
    speechLoadingId,
    speechEnabled,
    highlightSegment,
    isAdmin,
    roomId: _roomId,
    username: _username,
    onMessageDeleted: _onMessageDeleted,
    onSendMessage,
    onCopyMessage,
    onDeleteMessage,
    setPlayingMessageId,
    setSpeechLoadingId,
    speakAssistantMessageManually,
    stopSpeech,
    playNote,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [isInteractingWithPreview, setIsInteractingWithPreview] = useState(false);

  // Stable ref to playNote so the bubbling animationstart handler stays stable
  // across renders and Streamdown's animated word spans don't trigger
  // unnecessary re-binds.
  const playNoteRef = useRef(playNote);
  useEffect(() => {
    playNoteRef.current = playNote;
  }, [playNote]);

  // Counter so we play a note on every other animated word during streaming,
  // matching the original chat synth cadence and avoiding audio overload on
  // bursty token arrivals.
  const animationCountRef = useRef(0);
  const handleStreamdownAnimationStart = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.dataset || target.dataset.sdAnimate === undefined) {
        return;
      }
      animationCountRef.current += 1;
      if (animationCountRef.current % 2 !== 0) {
        return;
      }
      try {
        playNoteRef.current();
      } catch {
        // useChatSynth handles audio context errors internally; swallow any
        // synchronous throws so streaming doesn't break.
      }
    },
    []
  );

  let messageText = getMessageText(message);
  const isStaticGreeting = message.role === "assistant" && message.id === "1";
  if (isStaticGreeting && !messageText) {
    messageText = t("apps.chats.messages.greeting");
  }
  const showTypingDots = isLoadingGreeting && !isRoomView && isStaticGreeting;
  const isUrgent = isUrgentMessage(messageText);
  let bgColorClass = "";
  if (isUrgent) {
    bgColorClass = "bg-transparent text-current";
  } else if (message.role === "user")
    bgColorClass = "bg-yellow-100 text-black";
  else if (message.role === "assistant")
    bgColorClass = "bg-blue-100 text-black";
  else if (message.role === "human")
    bgColorClass = getUserColorClass(message.username);

  const rawContent = isUrgent ? messageText.slice(4).trimStart() : messageText;
  const decodedContent = decodeHtmlEntities(rawContent);
  const hasAquariumToken = decodedContent.includes("[[AQUARIUM]]");
  const displayContent = decodedContent.replace(/\[\[AQUARIUM\]\]/g, "").trim();
  const activeHighlight =
    !isStreamingMessage &&
    message.role === "assistant" &&
    highlightSegment?.messageId === message.id
      ? highlightSegment
      : null;

  // Concatenated visible text across all `text` parts, mirroring how
  // useChatSpeechSync computes its character offsets. Used to derive the
  // highlight prefix/target source for the CSS Custom Highlight overlay.
  const fullAssistantSource =
    message.role === "assistant" && message.parts
      ? message.parts.reduce((acc, part) => {
          if (part.type === "text") {
            return (
              acc +
              decodeHtmlEntities(
                getVisibleTextPartText(
                  (part as { type: string; text?: string }).text ||
                    (isStaticGreeting
                      ? t("apps.chats.messages.greeting")
                      : "")
                )
              )
            );
          }
          return acc;
        }, "")
      : "";

  const renderAssistantMarkdown = (content: string, keyPrefix: string) => {
    if (!content.trim()) return null;
    return (
      <Streamdown
        key={`${keyPrefix}-full`}
        className={`ryos-chat-streamdown ${
          isUrgent ? "ryos-chat-streamdown-urgent" : ""
        }`}
        components={chatStreamdownComponents}
        disallowedElements={STREAMDOWN_DISALLOWED_ELEMENTS}
        controls={false}
        lineNumbers={false}
        shikiTheme={CHAT_STREAMDOWN_SHIKI_THEME}
        plugins={CHAT_STREAMDOWN_PLUGINS}
        skipHtml
        unwrapDisallowed
        mode={isStreamingMessage ? "streaming" : "static"}
        animated={CHAT_STREAMDOWN_ANIMATED}
        isAnimating={isStreamingMessage}
        parseIncompleteMarkdown={isStreamingMessage}
      >
        {content}
      </Streamdown>
    );
  };

  // Apply the TTS highlight via the CSS Custom Highlight API, scoped to this
  // message bubble. This paints the spoken span over the existing text nodes
  // without splitting the rendered markdown.
  const assistantContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeHighlight || !fullAssistantSource) {
      return;
    }
    const container = assistantContentRef.current;
    if (!container) return;
    const start = Math.max(0, Math.min(activeHighlight.start, fullAssistantSource.length));
    const end = Math.max(start, Math.min(activeHighlight.end, fullAssistantSource.length));
    const prefix = fullAssistantSource.slice(0, start);
    const target = fullAssistantSource.slice(start, end);
    // Capture the owner token so the cleanup below only clears the registry
    // when our highlight is still the active one. Sibling components and
    // segment transitions within the same message can apply a new highlight
    // before this cleanup runs; without the token check, that newer highlight
    // would be wiped out and the user would see a stale or missing overlay.
    const ownerToken = applyTtsHighlight(container, target, prefix);
    return () => {
      clearTtsHighlight(ownerToken);
    };
  }, [activeHighlight, fullAssistantSource]);

  let hasAquarium = false;
  if (message.role === "assistant" && message.parts) {
    const aquariumParts = message.parts.filter(
      (p: ToolInvocationPart | { type: string }) => p.type === "tool-aquarium"
    );
    hasAquarium = aquariumParts.length > 0;
  }
  if (
    (message.role === "human" || message.username === "ryo") &&
    hasAquariumToken
  ) {
    hasAquarium = true;
  }

  const isTouchDevice = () =>
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const extractUrls = (content: string): string[] => {
    const urls = new Set<string>();
    segmentChatMarkdownText(content).forEach((token) => {
      if (token.type === "link" && token.url) urls.add(token.url);
    });
    return Array.from(urls);
  };

  return (
    <motion.div
      key={messageKey}
      variants={CHAT_BUBBLE_VARIANTS}
      initial={isInitialMessage || isStaticGreeting ? "animate" : "initial"}
      animate="animate"
      transition={
        isStaticGreeting ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
      }
      className={`flex flex-col z-10 w-full ${
        message.role === "user" ? "items-end" : "items-start"
      }`}
      style={{
        transformOrigin: message.role === "user" ? "bottom right" : "bottom left",
      }}
      onMouseEnter={() =>
        !isInteractingWithPreview && !isTouchDevice() && setIsHovered(true)
      }
      onMouseLeave={() =>
        !isInteractingWithPreview && !isTouchDevice() && setIsHovered(false)
      }
      onTouchStart={(e) => {
        if (!isInteractingWithPreview && isTouchDevice()) {
          const target = e.target as HTMLElement;
          const isLinkPreview = target.closest("[data-link-preview]");
          if (!isLinkPreview) {
            e.preventDefault();
            setIsHovered(true);
          }
        }
      }}
    >
      <div
        className={`${
          isMacOSTheme ? "text-[10px]" : "text-[16px]"
        } chat-messages-meta text-neutral-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2`}
      >
        {message.role === "user" && (
          <>
            {isAdmin && isRoomView && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      initial={MOTION_BTN_INITIAL}
                      animate={{
                        opacity: isHovered ? 1 : 0,
                        scale: 1,
                      }}
                      className="size-3 text-neutral-400 hover:text-red-600 transition-colors"
                      onClick={() => onDeleteMessage(message)}
                      aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                    >
                      <Trash className="size-3" weight="bold" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("apps.chats.messages.delete")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <motion.button
              initial={MOTION_BTN_INITIAL}
              animate={{
                opacity: isHovered ? 1 : 0,
                scale: 1,
              }}
              className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors"
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {copiedMessageId === messageKey ? (
                <Check className="size-3" weight="bold" />
              ) : (
                <Copy className="size-3" weight="bold" />
              )}
            </motion.button>
          </>
        )}
        <span
          className="max-w-[120px] inline-block overflow-hidden text-ellipsis whitespace-nowrap"
          title={
            message.username ||
            (message.role === "user"
              ? t("apps.chats.messages.you")
              : t("apps.chats.messages.ryo"))
          }
        >
          {message.username ||
            (message.role === "user"
              ? t("apps.chats.messages.you")
              : t("apps.chats.messages.ryo"))}
        </span>{" "}
        <span className="text-neutral-400 select-text">
          {message.metadata?.createdAt ? (
            (() => {
              const messageDate = new Date(message.metadata.createdAt);
              const today = new Date();
              const isBeforeToday =
                messageDate.getDate() !== today.getDate() ||
                messageDate.getMonth() !== today.getMonth() ||
                messageDate.getFullYear() !== today.getFullYear();
              return isBeforeToday
                ? messageDate.toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })
                : messageDate.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  });
            })()
          ) : (
            <ActivityIndicator size="xs" />
          )}
        </span>
        {message.role === "assistant" && (
          <>
            <motion.button
              initial={MOTION_BTN_INITIAL}
              animate={{
                opacity: isHovered ? 1 : 0,
                scale: 1,
              }}
              className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors"
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {copiedMessageId === messageKey ? (
                <Check className="size-3" weight="bold" />
              ) : (
                <Copy className="size-3" weight="bold" />
              )}
            </motion.button>
            {speechEnabled && (
              <motion.button
                initial={MOTION_BTN_INITIAL}
                animate={{
                  opacity: isHovered ? 1 : 0,
                  scale: 1,
                }}
                className="size-3 text-neutral-400 hover:text-neutral-600 transition-colors"
                onClick={() => {
                  if (playingMessageId === messageKey) {
                    stopSpeech();
                    setPlayingMessageId(null);
                    setSpeechLoadingId(null);
                  } else {
                    // Use fullAssistantSource (not displayContent) so highlight
                    // offsets line up with the rendered DOM the same way they
                    // do for streaming playback. Falling back to displayContent
                    // keeps non-assistant edge cases working.
                    const sourceForHighlight =
                      message.role === "assistant" && fullAssistantSource
                        ? fullAssistantSource
                        : displayContent.trim();
                    if (!sourceForHighlight) {
                      setPlayingMessageId(null);
                      setSpeechLoadingId(null);
                      return;
                    }
                    setSpeechLoadingId(messageKey);
                    setPlayingMessageId(messageKey);
                    speakAssistantMessageManually(
                      messageKey,
                      sourceForHighlight,
                      () => {
                        setPlayingMessageId(null);
                        setSpeechLoadingId(null);
                      }
                    );
                  }
                }}
                aria-label={
                  playingMessageId === messageKey
                    ? t("apps.chats.ariaLabels.stopSpeech")
                    : t("apps.chats.ariaLabels.speakMessage")
                }
              >
                {playingMessageId === messageKey ? (
                  speechLoadingId === messageKey ? (
                    <ActivityIndicator size="xs" />
                  ) : (
                    <Pause className="size-3" weight="bold" />
                  )
                ) : (
                  <SpeakerHigh className="size-3" weight="bold" />
                )}
              </motion.button>
            )}
          </>
        )}
        {isRoomView &&
          message.role === "human" &&
          onSendMessage &&
          message.username && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    initial={MOTION_BTN_INITIAL}
                    animate={{
                      opacity: isHovered ? 1 : 0,
                      scale: 1,
                    }}
                    className="size-3 text-neutral-400 hover:text-blue-600 transition-colors"
                    onClick={() => onSendMessage(message.username!)}
                    aria-label={t("apps.chats.ariaLabels.messageUser", {
                      username: message.username,
                    })}
                  >
                    <PaperPlaneRight className="size-3" weight="bold" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t("apps.chats.ariaLabels.messageUser", {
                      username: message.username,
                    })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        {isAdmin && isRoomView && message.role !== "user" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  initial={MOTION_BTN_INITIAL}
                  animate={{
                    opacity: isHovered ? 1 : 0,
                    scale: 1,
                  }}
                  className="size-3 text-neutral-400 hover:text-red-600 transition-colors"
                  onClick={() => onDeleteMessage(message)}
                  aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                >
                  <Trash className="size-3" weight="bold" />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("apps.chats.messages.delete")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {hasAquarium && <EmojiAquarium />}

      {message.role === "user" &&
        (() => {
          const imageUrls = extractImageParts(message as {
            parts?: Array<{ type: string; url?: string; mediaType?: string }>;
          });
          if (imageUrls.length === 0) return null;
          return (
            <div
              className={`flex flex-col gap-2 w-full mb-1 ${
                message.role === "user" ? "items-end" : "items-start"
              }`}
            >
              {(() => {
                const imageKeyCounts = new Map<string, number>();
                let imageNumber = 0;
                return imageUrls.map((url) => {
                  imageNumber += 1;
                  const urlCount = (imageKeyCounts.get(url) ?? 0) + 1;
                  imageKeyCounts.set(url, urlCount);
                  return (
                    <ImageAttachment
                      key={`${messageKey}-img-${url}-${urlCount}`}
                      src={url}
                      alt={`Attached image ${imageNumber}`}
                      showRemoveButton={false}
                      className="max-w-[280px]"
                    />
                  );
                });
              })()}
            </div>
          );
        })()}

      {!isUrlOnly(displayContent) && (
        <motion.div
          initial={
            isUrgent
              ? {
                  opacity: 0,
                  backgroundColor: "#bfdbfe",
                  color: "#111827",
                }
              : { opacity: 0 }
          }
          animate={
            isUrgent
              ? {
                  opacity: 1,
                  backgroundColor: [
                    "#bfdbfe",
                    "#fecaca",
                    "#fee2e2",
                  ],
                  color: ["#111827", "#b91c1c", "#b91c1c"],
                }
              : { opacity: 1 }
          }
          transition={
            isUrgent
              ? {
                  opacity: { duration: 0.12, ease: "easeOut" },
                  backgroundColor: {
                    duration: 0.9,
                    ease: "easeInOut",
                    times: [0, 0.5, 1],
                  },
                  color: {
                    duration: 0.9,
                    ease: "easeInOut",
                    times: [0, 0.5, 1],
                  },
                }
              : undefined
          }
          className={`p-1.5 px-2 chat-bubble ${
            showTypingDots
              ? "bg-neutral-200 text-neutral-400"
              : bgColorClass ||
                (message.role === "user"
                  ? "bg-yellow-100 text-black"
                  : "bg-blue-100 text-black")
          } w-fit max-w-[90%] min-h-[12px] rounded leading-snug font-geneva-12 break-words select-text`}
          style={getChatMessageStyle(fontSize)}
        >
          {showTypingDots ? (
            <TypingDots />
          ) : message.role === "assistant" ? (
            <motion.div
              ref={assistantContentRef}
              className="select-text flex flex-col gap-1"
            >
              {message.parts?.map(
                (
                  part: ToolInvocationPart | { type: string; text?: string },
                  partIndex: number
                ) => {
                  const partKey = `${messageKey}-part-${partIndex}`;
                  switch (part.type) {
                    case "text": {
                      const partText =
                        (part as { type: string; text?: string }).text ||
                        (isStaticGreeting ? t("apps.chats.messages.greeting") : "");
                      const hasXmlTags =
                        /<textedit:(insert|replace|delete)/i.test(partText);
                      if (hasXmlTags) {
                        const openTags = (
                          partText.match(/<textedit:(insert|replace|delete)/g) || []
                        ).length;
                        const closeTags = (
                          partText.match(
                            /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
                          ) || []
                        ).length;
                        if (openTags !== closeTags) {
                          return (
                            <span
                              key={partKey}
                              className="select-text italic"
                            >
                              {t("apps.chats.status.editing")}
                            </span>
                          );
                        }
                      }
                      const rawPartContent = getVisibleTextPartText(partText);
                      const partDisplayContent = decodeHtmlEntities(rawPartContent);
                      const textContent = partDisplayContent;
                      const isEmojiMessage = isEmojiOnly(textContent);
                      return (
                        <div
                          key={partKey}
                          className="w-full"
                          style={getChatMessageStyle(fontSize, isEmojiMessage)}
                          onAnimationStart={
                            isStreamingMessage
                              ? handleStreamdownAnimationStart
                              : undefined
                          }
                        >
                          {renderAssistantMarkdown(textContent, partKey)}
                        </div>
                      );
                    }
                    default: {
                      if (part.type.startsWith("tool-")) {
                        const toolPart = part as ToolInvocationPart;
                        const toolName = part.type.slice(5);
                        if (toolName === "aquarium") return null;
                        return (
                          <ToolInvocationMessage
                            key={partKey}
                            part={toolPart}
                            partKey={partKey}
                            isLoading={isLoading}
                            getAppName={getAppName}
                            formatToolName={formatToolName}
                            setIsInteractingWithPreview={
                              setIsInteractingWithPreview
                            }
                            playElevatorMusic={playElevatorMusic}
                            stopElevatorMusic={stopElevatorMusic}
                            playDingSound={playDingSound}
                          />
                        );
                      }
                      return null;
                    }
                  }
                }
              )}
            </motion.div>
          ) : (
            displayContent && (
              <div
                className="select-text"
                style={getChatMessageStyle(fontSize, isEmojiOnly(displayContent))}
              >
                <Streamdown
                  className={`ryos-chat-streamdown ${
                    isUrgent ? "ryos-chat-streamdown-urgent" : ""
                  }`}
                  components={chatStreamdownComponents}
                  disallowedElements={STREAMDOWN_DISALLOWED_ELEMENTS}
                  controls={false}
                  lineNumbers={false}
                  shikiTheme={CHAT_STREAMDOWN_SHIKI_THEME}
                  plugins={CHAT_STREAMDOWN_PLUGINS}
                  skipHtml
                  unwrapDisallowed
                  mode="static"
                >
                  {displayContent}
                </Streamdown>
              </div>
            )
          )}
        </motion.div>
      )}

      {(() => {
        const allUrls = new Set<string>();
        if (message.role === "assistant") {
          message.parts?.forEach(
            (
              part: ToolInvocationPart | { type: string; text?: string }
            ) => {
              if (part.type === "text") {
                const partText =
                  (part as { type: string; text?: string }).text || "";
                const partContent = isUrgentMessage(partText)
                  ? partText.slice(4).trimStart()
                  : partText;
                extractUrls(decodeHtmlEntities(partContent)).forEach((u) =>
                  allUrls.add(u)
                );
              }
            }
          );
        } else {
          extractUrls(displayContent).forEach((u) => allUrls.add(u));
        }
        if (allUrls.size === 0) return null;
        return (
          <div
            className={`flex flex-col gap-2 w-full ${
              !isUrlOnly(displayContent) ? "mt-2" : ""
            } ${message.role === "user" ? "items-end" : "items-start"}`}
          >
            {Array.from(allUrls).map((url, index) => (
              <LinkPreview
                key={`${messageKey}-link-${index}`}
                url={url}
                className="max-w-[90%]"
              />
            ))}
          </div>
        );
      })()}
    </motion.div>
  );
});
