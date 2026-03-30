import { UIMessage as VercelMessage } from "@ai-sdk/react";
import { WarningCircle, ChatCircle, Copy, Check, CaretDown, Trash, SpeakerHigh, Pause, PaperPlaneRight } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { AnimatePresence, motion } from "framer-motion";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";

import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { TypingDots } from "./TypingBubble";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { appRegistry } from "@/config/appRegistry";
import {
  ToolInvocationMessage,
  type ToolInvocationPart,
} from "@/components/shared/ToolInvocationMessage";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LinkPreview } from "@/components/shared/LinkPreview";
import { ImageAttachment } from "@/components/shared/ImageAttachment";
import { useThemeStore } from "@/stores/useThemeStore";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import {
  coalesceChatMarkdownTokens,
  segmentChatMarkdownText,
  type ChatMarkdownToken,
} from "@/lib/chatMarkdown";
import {
  estimateChatTextLineCount,
  shouldAnimateAssistantTokens,
} from "@/apps/chats/utils/chatTextLayout";

// Helper to extract image URLs from message parts
const extractImageParts = (message: {
  parts?: Array<{ type: string; url?: string; mediaType?: string }>;
}): string[] => {
  if (!message.parts) return [];
  
  return message.parts
    .filter((p) => {
      // Check for file parts with image media types
      if (p.type === "file" && p.mediaType?.startsWith("image/") && p.url) {
        return true;
      }
      return false;
    })
    .map((p) => p.url as string);
};

// --- Color Hashing for Usernames ---
const userColors = [
  "bg-pink-100 text-black",
  "bg-purple-100 text-black",
  "bg-indigo-100 text-black",
  "bg-teal-100 text-black",
  "bg-lime-100 text-black",
  "bg-amber-100 text-black",
  "bg-cyan-100 text-black",
  "bg-rose-100 text-black",
];

const getUserColorClass = (username?: string): string => {
  if (!username) {
    return "bg-gray-100 text-black"; // Default or fallback color
  }
  // Simple hash function
  const hash = username
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return userColors[hash % userColors.length];
};
// --- End Color Hashing ---

// Helper function to check if text contains only emojis
const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text);
};

const isUrlOnly = (text: string): boolean => {
  const trimmedText = text.trim();
  const urlRegex = /^https?:\/\/[^\s]+$/;
  return urlRegex.test(trimmedText);
};

const isUrgentMessage = (content: string) => content.startsWith("!!!!");

const getFaviconUrl = (url: string): string => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=16`;
  }
};

const getCitationLabel = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Helper function to extract user-friendly error message
const getErrorMessage = (error: Error): string => {
  if (!error.message) return "An error occurred";

  // Try to extract JSON from the error message
  const jsonMatch = error.message.match(/\{.*\}/);

  if (jsonMatch) {
    try {
      const errorData = JSON.parse(jsonMatch[0]);

      // Handle specific error types
      if (errorData.error === "rate_limit_exceeded") {
        if (errorData.isAuthenticated) {
          return i18n.t("apps.chats.status.dailyLimitReached");
        } else {
          return i18n.t("apps.chats.status.loginToContinue");
        }
      }

      // Handle authentication error
      if (errorData.error === "authentication_failed") {
        return i18n.t("apps.chats.status.sessionExpired");
      }

      // Return the error field if it exists and is a string
      if (typeof errorData.error === "string") {
        return errorData.error;
      }

      // Return the message field if it exists
      if (typeof errorData.message === "string") {
        return errorData.message;
      }
    } catch {
      // If JSON parsing fails, continue to fallback
    }
  }

  // If the message starts with "Error: ", remove it for cleaner display
  if (error.message.startsWith("Error: ")) {
    return error.message.slice(7);
  }

  // Return the original message as fallback
  return error.message;
};

// Helper to map an app id to a user-friendly name (uses translations)
const getAppName = (id?: string): string => {
  if (!id) return "app";
  try {
    return getTranslatedAppName(id as AppId);
  } catch {
    // Fallback to formatting the id if translation fails
    const entry = (appRegistry as Record<string, { name?: string }>)[id];
    return entry?.name || formatToolName(id);
  }
};

// Helper to extract text content from v5 UIMessage parts
const getMessageText = (message: {
  parts?: Array<{ type: string; text?: string }>;
}): string => {
  if (!message.parts) return "";

  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: string; text?: string }).text || "")
    .join("");
};

// Define an extended message type that includes username
// Extend VercelMessage and add username and the 'human' role
interface ChatMessage extends Omit<VercelMessage, "role"> {
  // Omit the original role to redefine it
  username?: string; // Add username, make it optional for safety
  role: VercelMessage["role"] | "human"; // Allow original roles plus 'human'
  isPending?: boolean; // Add isPending flag
  serverId?: string; // Real server ID when id is a clientId
  metadata?: {
    createdAt?: Date;
    [key: string]: unknown;
  };
}

interface ChatMessagesProps {
  messages: ChatMessage[]; // Use the extended type
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean; // Indicates if this is a room view (vs Ryo chat)
  roomId?: string; // Needed for message deletion calls
  isAdmin?: boolean; // Whether the current user has admin privileges (e.g. username === "ryo")
  username?: string; // Current client username (needed for delete request)
  onMessageDeleted?: (messageId: string) => void; // Callback when a message is deleted locally
  fontSize: number; // Add font size prop
  scrollToBottomTrigger: number; // Add scroll trigger prop
  highlightSegment?: { messageId: string; start: number; end: number } | null;
  isSpeaking?: boolean;
  onSendMessage?: (username: string) => void; // Callback when send message button is clicked
  isLoadingGreeting?: boolean; // Show typing bubble for proactive greeting
  typingUsers?: string[];
}

// Component to render the scroll-to-bottom button using the library's context
function ScrollToBottomButton() {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ type: "spring", duration: 0.2 }}
          className={`absolute bottom-14 right-3 rounded-full z-20 flex items-center justify-center cursor-pointer select-none ${
            isMacTheme ? "relative overflow-hidden" : ""
          }`}
          style={{
            position: "absolute",
            bottom: "56px",
            right: `calc(12px + var(--sbw, 0px))`,
            width: 28,
            height: 28,
            background: isMacTheme
              ? "linear-gradient(rgba(160,160,160,0.625), rgba(255,255,255,0.625))"
              : "#ffffff",
            boxShadow: isMacTheme
              ? "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px #bbbbbb"
              : "0 1px 2px rgba(0,0,0,0.25)",
            border: isMacTheme ? undefined : "1px solid rgba(0,0,0,0.3)",
            backdropFilter: isMacTheme ? "blur(2px)" : undefined,
          }}
          onClick={() => scrollToBottom()} // Use the library's function
          aria-label={t("apps.chats.status.scrollToBottom")}
        >
          {isMacTheme && (
            <>
              {/* Top shine */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  top: "2px",
                  height: "30%",
                  width: "calc(100% - 12px)",
                  borderRadius: "12px 12px 4px 4px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                  filter: "blur(0.2px)",
                  zIndex: 2,
                }}
              />
              {/* Bottom glow */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: "1px",
                  height: "38%",
                  width: "calc(100% - 4px)",
                  borderRadius: "4px 4px 8px 8px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                  filter: "blur(0.3px)",
                  zIndex: 1,
                }}
              />
            </>
          )}
          <CaretDown
            className={`h-2.5 w-2.5 ${
              isMacTheme ? "text-black/70 relative z-10" : "text-neutral-800"
            }`}
            weight="bold"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

interface AssistantTextPartProps {
  partKey: string;
  textContent: string;
  isInitialMessage: boolean;
  fontSize: number;
  activeHighlightSegment: { start: number; end: number } | null;
  renderInlineToken: (segment: ChatMarkdownToken) => React.ReactNode;
  playNote: () => void;
}

const AssistantTextPart = memo(function AssistantTextPart({
  partKey,
  textContent,
  isInitialMessage,
  fontSize,
  activeHighlightSegment,
  renderInlineToken,
  playNote,
}: AssistantTextPartProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);

  const trimmedText = textContent.trim();
  const emojiOnly = useMemo(() => isEmojiOnly(trimmedText), [trimmedText]);
  const tokens = useMemo(() => segmentChatMarkdownText(trimmedText), [trimmedText]);
  const groupedTokens = useMemo(() => coalesceChatMarkdownTokens(tokens), [tokens]);
  const visibleText = useMemo(
    () => tokens.map((token) => token.content).join(""),
    [tokens]
  );
  const lineCount = useMemo(
    () => estimateChatTextLineCount(visibleText, fontSize, contentWidth),
    [visibleText, fontSize, contentWidth]
  );
  const animateTokens = useMemo(
    () =>
      shouldAnimateAssistantTokens({
        tokenCount: tokens.length,
        textLength: visibleText.length,
        lineCount,
      }),
    [tokens.length, visibleText.length, lineCount]
  );
  const renderedTokens = animateTokens ? tokens : groupedTokens;

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateWidth = (width: number) => {
      setContentWidth((previousWidth) =>
        Math.abs(previousWidth - width) < 0.5 ? previousWidth : width
      );
    };

    updateWidth(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updateWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fontSize]);

  if (!trimmedText) {
    return null;
  }

  let charPos = 0;

  return (
    <div className="w-full">
      <div ref={contentRef} className="whitespace-pre-wrap">
        {renderedTokens.map((segment, idx) => {
          const start = charPos;
          const end = charPos + segment.content.length;
          charPos = end;
          const isHighlight =
            !!activeHighlightSegment &&
            start < activeHighlightSegment.end &&
            end > activeHighlightSegment.start;
          const contentNode = isHighlight ? (
            <span className="animate-highlight">{renderInlineToken(segment)}</span>
          ) : (
            renderInlineToken(segment)
          );

          const className = `select-text ${
            emojiOnly ? "text-[24px]" : ""
          } ${
            segment.type === "bold"
              ? "font-bold"
              : segment.type === "italic"
              ? "italic"
              : ""
          }`;
          const style = {
            userSelect: "text" as const,
            fontSize: emojiOnly ? undefined : `${fontSize}px`,
          };

          if (!animateTokens) {
            return (
              <span
                key={`${partKey}-segment-${idx}`}
                className={className}
                style={style}
              >
                {contentNode}
              </span>
            );
          }

          return (
            <motion.span
              key={`${partKey}-segment-${idx}`}
              initial={
                isInitialMessage ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }
              }
              animate={{ opacity: 1, y: 0 }}
              className={className}
              style={style}
              transition={{
                duration: 0.08,
                delay: idx * 0.02,
                ease: "easeOut",
                onComplete: () => {
                  if (idx % 2 === 0) playNote();
                },
              }}
            >
              {contentNode}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
});

// Memoized chat message item - extracted for list rendering performance
interface ChatMessageItemProps {
  message: ChatMessage;
  messageKey: string;
  isInitialMessage: boolean;
  isLoading: boolean;
  isLoadingGreeting: boolean;
  isRoomView: boolean;
  fontSize: number;
  currentTheme: string;
  copiedMessageId: string | null;
  hoveredMessageId: string | null;
  playingMessageId: string | null;
  speechLoadingId: string | null;
  highlightSegment: { messageId: string; start: number; end: number } | null;
  localHighlightSegment: { messageId: string; start: number; end: number } | null;
  isSpeaking: boolean;
  localTtsSpeaking: boolean;
  speechEnabled: boolean;
  isAdmin: boolean;
  roomId?: string;
  username?: string;
  onMessageDeleted?: (messageId: string) => void;
  onSendMessage?: (username: string) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  setHoveredMessageId: (id: string | null) => void;
  setIsInteractingWithPreview: (v: boolean) => void;
  setLocalHighlightSegment: (seg: { messageId: string; start: number; end: number } | null) => void;
  setPlayingMessageId: (id: string | null) => void;
  setSpeechLoadingId: (id: string | null) => void;
  localHighlightQueueRef: React.MutableRefObject<{ messageId: string; start: number; end: number }[]>;
  isInteractingWithPreview: boolean;
  speak: (text: string, onDone?: () => void) => void;
  stop: () => void;
  playNote: () => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

const ChatMessageItem = memo(function ChatMessageItem(props: ChatMessageItemProps) {
  const { t } = useTranslation();
  const {
    message,
    messageKey,
    isInitialMessage,
    isLoading,
    isLoadingGreeting,
    isRoomView,
    fontSize,
    currentTheme,
    copiedMessageId,
    hoveredMessageId,
    playingMessageId,
    speechLoadingId,
    highlightSegment,
    localHighlightSegment,
    isSpeaking,
    localTtsSpeaking,
    speechEnabled,
    isAdmin,
    roomId: _roomId,
    username: _username,
    onMessageDeleted: _onMessageDeleted,
    onSendMessage,
    onCopyMessage,
    onDeleteMessage,
    setHoveredMessageId,
    setIsInteractingWithPreview,
    setLocalHighlightSegment,
    setPlayingMessageId,
    setSpeechLoadingId,
    localHighlightQueueRef,
    isInteractingWithPreview,
    speak,
    stop,
    playNote,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
  } = props;

  let messageText = getMessageText(message);
  const isStaticGreeting = message.role === "assistant" && message.id === "1";
  if (isStaticGreeting && !messageText) {
    messageText = t("apps.chats.messages.greeting");
  }
  const showTypingDots = isLoadingGreeting && !isRoomView && isStaticGreeting;
  const variants = { initial: { opacity: 0 }, animate: { opacity: 1 } };
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

  const combinedHighlightSeg = highlightSegment || localHighlightSegment;
  const combinedIsSpeaking = isSpeaking || localTtsSpeaking;
  const highlightActive =
    combinedIsSpeaking &&
    combinedHighlightSeg &&
    combinedHighlightSeg.messageId === message.id;
  const activeHighlightSegment = highlightActive
    ? {
        start: combinedHighlightSeg.start,
        end: combinedHighlightSeg.end,
      }
    : null;

  const isTouchDevice = () =>
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const extractUrls = (content: string): string[] => {
    const urls = new Set<string>();
    segmentChatMarkdownText(content).forEach((token) => {
      if (token.type === "link" && token.url) urls.add(token.url);
    });
    return Array.from(urls);
  };

  const displayTokens = useMemo(
    () =>
      displayContent
        ? coalesceChatMarkdownTokens(segmentChatMarkdownText(displayContent))
        : [],
    [displayContent]
  );

  const renderInlineToken = useCallback((segment: ChatMarkdownToken) => {
    const tokenNode =
      (segment.type === "link" || segment.type === "citation") && segment.url ? (
        <a
          href={segment.url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            segment.type === "citation"
              ? "inline-flex h-4 w-4 translate-y-[1px] items-center justify-center align-baseline no-underline"
              : "text-blue-600 hover:underline"
          }
          style={{
            color:
              segment.type === "citation"
                ? undefined
                : isUrgent
                ? "inherit"
                : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
          title={
            segment.type === "citation"
              ? getCitationLabel(segment.url)
              : undefined
          }
          aria-label={
            segment.type === "citation"
              ? `Source: ${getCitationLabel(segment.url)}`
              : undefined
          }
        >
          {segment.type === "citation" ? (
            <img
              src={getFaviconUrl(segment.url)}
              alt=""
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-[2px]"
            />
          ) : (
            segment.content
          )}
        </a>
      ) : (
        segment.content
      );
    return tokenNode;
  }, [isUrgent]);

  return (
    <motion.div
      key={messageKey}
      variants={variants}
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
        !isInteractingWithPreview && !isTouchDevice() && setHoveredMessageId(messageKey)
      }
      onMouseLeave={() =>
        !isInteractingWithPreview && !isTouchDevice() && setHoveredMessageId(null)
      }
      onTouchStart={(e) => {
        if (!isInteractingWithPreview && isTouchDevice()) {
          const target = e.target as HTMLElement;
          const isLinkPreview = target.closest("[data-link-preview]");
          if (!isLinkPreview) {
            e.preventDefault();
            setHoveredMessageId(messageKey);
          }
        }
      }}
    >
      <div
        className={`${
          currentTheme === "macosx" ? "text-[10px]" : "text-[16px]"
        } chat-messages-meta text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2`}
      >
        {message.role === "user" && (
          <>
            {isAdmin && isRoomView && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: hoveredMessageId === messageKey ? 1 : 0,
                        scale: 1,
                      }}
                      className="h-3 w-3 text-gray-400 hover:text-red-600 transition-colors"
                      onClick={() => onDeleteMessage(message)}
                      aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                    >
                      <Trash className="h-3 w-3" weight="bold" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("apps.chats.messages.delete")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: hoveredMessageId === messageKey ? 1 : 0,
                scale: 1,
              }}
              className="h-3 w-3 text-gray-400 hover:text-neutral-600 transition-colors"
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {copiedMessageId === messageKey ? (
                <Check className="h-3 w-3" weight="bold" />
              ) : (
                <Copy className="h-3 w-3" weight="bold" />
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
        <span className="text-gray-400 select-text">
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: hoveredMessageId === messageKey ? 1 : 0,
                scale: 1,
              }}
              className="h-3 w-3 text-gray-400 hover:text-neutral-600 transition-colors"
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {copiedMessageId === messageKey ? (
                <Check className="h-3 w-3" weight="bold" />
              ) : (
                <Copy className="h-3 w-3" weight="bold" />
              )}
            </motion.button>
            {speechEnabled && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                  opacity: hoveredMessageId === messageKey ? 1 : 0,
                  scale: 1,
                }}
                className="h-3 w-3 text-gray-400 hover:text-neutral-600 transition-colors"
                onClick={() => {
                  if (playingMessageId === messageKey) {
                    stop();
                    setPlayingMessageId(null);
                  } else {
                    stop();
                    setLocalHighlightSegment(null);
                    localHighlightQueueRef.current = [];
                    setSpeechLoadingId(null);
                    const text = displayContent.trim();
                    if (text) {
                      const chunks: string[] = [];
                      const lines = text.split(/\r?\n/);
                      for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine && trimmedLine.length > 0) {
                          chunks.push(trimmedLine);
                        }
                      }
                      if (chunks.length > 0) {
                        let charCursor = 0;
                        const segments = chunks.map((chunk) => {
                          const visibleLen = segmentChatMarkdownText(chunk).reduce(
                            (acc, token) => acc + token.content.length,
                            0
                          );
                          const seg = {
                            messageId: message.id || messageKey,
                            start: charCursor,
                            end: charCursor + visibleLen,
                          };
                          charCursor += visibleLen;
                          return seg;
                        });
                        localHighlightQueueRef.current = segments;
                        setLocalHighlightSegment(segments[0]);
                        setSpeechLoadingId(messageKey);
                        setPlayingMessageId(messageKey);
                        chunks.forEach((chunk) => {
                          speak(chunk, () => {
                            localHighlightQueueRef.current.shift();
                            if (localHighlightQueueRef.current.length > 0) {
                              setLocalHighlightSegment(
                                localHighlightQueueRef.current[0]
                              );
                            } else {
                              setLocalHighlightSegment(null);
                              setPlayingMessageId(null);
                              setSpeechLoadingId(null);
                            }
                          });
                        });
                      } else {
                        setPlayingMessageId(null);
                        setSpeechLoadingId(null);
                      }
                    } else {
                      setPlayingMessageId(null);
                      setSpeechLoadingId(null);
                    }
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
                    <Pause className="h-3 w-3" weight="bold" />
                  )
                ) : (
                  <SpeakerHigh className="h-3 w-3" weight="bold" />
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
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: hoveredMessageId === messageKey ? 1 : 0,
                      scale: 1,
                    }}
                    className="h-3 w-3 text-gray-400 hover:text-blue-600 transition-colors"
                    onClick={() => onSendMessage(message.username!)}
                    aria-label={t("apps.chats.ariaLabels.messageUser", {
                      username: message.username,
                    })}
                  >
                    <PaperPlaneRight className="h-3 w-3" weight="bold" />
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
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: hoveredMessageId === messageKey ? 1 : 0,
                    scale: 1,
                  }}
                  className="h-3 w-3 text-gray-400 hover:text-red-600 transition-colors"
                  onClick={() => onDeleteMessage(message)}
                  aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                >
                  <Trash className="h-3 w-3" weight="bold" />
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
              {imageUrls.map((url, idx) => (
                <ImageAttachment
                  key={`${messageKey}-img-${idx}`}
                  src={url}
                  alt={`Attached image ${idx + 1}`}
                  showRemoveButton={false}
                  className="max-w-[280px]"
                />
              ))}
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
          style={{ fontSize: `${fontSize}px` }}
        >
          {showTypingDots ? (
            <TypingDots />
          ) : message.role === "assistant" ? (
            <motion.div className="select-text flex flex-col gap-1">
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
                            <motion.span
                              key={partKey}
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0 }}
                              className="select-text italic"
                            >
                              {t("apps.chats.status.editing")}
                            </motion.span>
                          );
                        }
                      }
                      const rawPartContent = isUrgentMessage(partText)
                        ? partText.slice(4).trimStart()
                        : partText;
                      const partDisplayContent = decodeHtmlEntities(rawPartContent);
                      const textContent = partDisplayContent;
                      return (
                        <AssistantTextPart
                          key={partKey}
                          partKey={partKey}
                          textContent={textContent}
                          isInitialMessage={isInitialMessage}
                          fontSize={fontSize}
                          activeHighlightSegment={activeHighlightSegment}
                          renderInlineToken={renderInlineToken}
                          playNote={playNote}
                        />
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
            <>
              {displayContent && (
                <span
                  className={`select-text whitespace-pre-wrap ${
                    isEmojiOnly(displayContent) ? "text-[24px]" : ""
                  }`}
                  style={{
                    userSelect: "text",
                    fontSize: isEmojiOnly(displayContent)
                      ? undefined
                      : `${fontSize}px`,
                  }}
                >
                  {(() => {
                    let charPos2 = 0;
                    return displayTokens.map((segment, idx) => {
                      const start2 = charPos2;
                      const end2 = charPos2 + segment.content.length;
                      charPos2 = end2;
                      const isHighlight =
                        !!activeHighlightSegment &&
                        start2 < activeHighlightSegment.end &&
                        end2 > activeHighlightSegment.start;
                      const contentNode = renderInlineToken(segment);
                      return (
                        <span
                          key={`${messageKey}-segment-${idx}`}
                          className={`${
                            segment.type === "bold"
                              ? "font-bold"
                              : segment.type === "italic"
                              ? "italic"
                              : ""
                          }`}
                        >
                          {isHighlight ? (
                            <span className="bg-yellow-200 animate-highlight">
                              {contentNode}
                            </span>
                          ) : (
                            contentNode
                          )}
                        </span>
                      );
                    });
                  })()}
                </span>
              )}
            </>
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

// --- NEW INNER COMPONENT ---
interface ChatMessagesContentProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean;
  roomId?: string;
  isAdmin: boolean;
  username?: string;
  onMessageDeleted?: (messageId: string) => void;
  fontSize: number;
  scrollToBottomTrigger: number;
  highlightSegment?: { messageId: string; start: number; end: number } | null;
  isSpeaking?: boolean;
  onSendMessage?: (username: string) => void;
  isLoadingGreeting?: boolean;
  typingUsers?: string[];
}

function ChatMessagesContent({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
  isRoomView,
  roomId,
  isAdmin,
  username,
  onMessageDeleted,
  fontSize,
  scrollToBottomTrigger,
  highlightSegment,
  isSpeaking,
  onSendMessage,
  isLoadingGreeting,
  typingUsers,
}: ChatMessagesContentProps) {
  const { t } = useTranslation();
  const { playNote } = useChatSynth();
  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const { speak, stop, isSpeaking: localTtsSpeaking } = useTtsQueue();
  const speechEnabled = useAudioSettingsStore((state) => state.speechEnabled);
  const currentTheme = useThemeStore((s) => s.current);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);

  // Local highlight state for manual speech triggered from this component
  const [localHighlightSegment, setLocalHighlightSegment] = useState<{
    messageId: string;
    start: number;
    end: number;
  } | null>(null);
  const localHighlightQueueRef = useRef<
    { messageId: string; start: number; end: number }[]
  >([]);

  const previousMessagesRef = useRef<ChatMessage[]>([]);
  const initialMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  // Get scrollToBottom from context - NOW SAFE TO CALL HERE
  const { scrollToBottom } = useStickToBottomContext();

  // Effect for Sound/Vibration
  useEffect(() => {
    if (
      previousMessagesRef.current.length > 0 &&
      messages.length > previousMessagesRef.current.length
    ) {
      const previousIds = new Set(
        previousMessagesRef.current.map(
          (m) => m.id || `${m.role}-${getMessageText(m).substring(0, 10)}`
        )
      );
      const newMessages = messages.filter(
        (currentMsg) =>
          !previousIds.has(
            currentMsg.id ||
              `${currentMsg.role}-${getMessageText(currentMsg).substring(
                0,
                10
              )}`
          )
      );
      const newHumanMessage = newMessages.find((msg) => msg.role === "human");
      if (newHumanMessage) {
        playNote();
        if ("vibrate" in navigator) {
          navigator.vibrate(100);
        }
      }
    }
    previousMessagesRef.current = messages;
  }, [messages, playNote]);

  // Effect to capture initial message IDs
  useEffect(() => {
    if (!hasInitializedRef.current && messages.length > 0) {
      hasInitializedRef.current = true;
      previousMessagesRef.current = messages;
      initialMessageIdsRef.current = new Set(
        messages.map(
          (m) => m.id || `${m.role}-${getMessageText(m).substring(0, 10)}`
        )
      );
    } else if (messages.length === 0) {
      hasInitializedRef.current = false;
    }
  }, [messages]);

  // Effect to trigger scroll to bottom
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      scrollToBottom();
    }
  }, [scrollToBottomTrigger, scrollToBottom]);

  // Clear loading indicator when TTS actually starts playing
  useEffect(() => {
    if (localTtsSpeaking && speechLoadingId) {
      setSpeechLoadingId(null);
    }
  }, [localTtsSpeaking, speechLoadingId]);

  const copyMessage = async (message: ChatMessage) => {
    const messageText = getMessageText(message);
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMessageId(
        message.id || `${message.role}-${messageText.substring(0, 10)}`
      );
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
      // Fallback
      try {
        const textarea = document.createElement("textarea");
        textarea.value = messageText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedMessageId(
          message.id || `${message.role}-${messageText.substring(0, 10)}`
        );
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!roomId) return;
    const serverMessageId = message.serverId || message.id; // prefer serverId when present
    if (!serverMessageId) return;

    // Use DELETE method with proper authentication headers (matching deleteRoom pattern)
    const url = `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(serverMessageId)}`;

    try {
      const res = await abortableFetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      if (res.ok) {
        // Use the actual server message ID for local removal to match store expectations
        onMessageDeleted?.(serverMessageId);
        return;
      }

      // If the server says the message doesn't exist anymore, remove it locally anyway
      if (res.status === 404 || res.status === 410) {
        console.warn(
          `Delete message ${serverMessageId} returned ${res.status}; removing locally as orphan.`
        );
        onMessageDeleted?.(serverMessageId);
        return;
      }

      const errorData = await res
        .json()
        .catch(() => ({ error: `HTTP error! status: ${res.status}` }));
      console.error("Failed to delete message", errorData);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error("Delete message request timed out", {
          roomId,
          serverMessageId,
        });
        return;
      }
      console.error("Error deleting message", err);
    }
  };

  // Return the message list rendering logic
  return (
    <AnimatePresence initial={false} mode="sync">
      {messages.length === 0 && !isRoomView && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
        >
          <ChatCircle className="h-3 w-3" weight="bold" />
          <span>{t("apps.chats.status.startNewConversation")}</span>
          {onClear && (
            <Button
              size="sm"
              variant="link"
              onClick={onClear}
              className="m-0 p-0 text-[16px] h-0 text-gray-500 hover:text-gray-700"
            >
              {t("apps.chats.status.newChat")}
            </Button>
          )}
        </motion.div>
      )}
      {messages.map((message) => {
        const messageText = getMessageText(message);
        const messageKey = (message.id === "1" || message.id === "proactive-1")
          ? "greeting"
          : message.id || `${message.role}-${messageText.substring(0, 10)}`;
        const isInitialMessage = initialMessageIdsRef.current.has(messageKey);
        return (
          <ChatMessageItem
            key={messageKey}
            message={message}
            messageKey={messageKey}
            isInitialMessage={isInitialMessage}
            isLoading={isLoading}
            isLoadingGreeting={!!isLoadingGreeting}
            isRoomView={isRoomView}
            fontSize={fontSize}
            currentTheme={currentTheme}
            copiedMessageId={copiedMessageId}
            hoveredMessageId={hoveredMessageId}
            playingMessageId={playingMessageId}
            speechLoadingId={speechLoadingId}
            highlightSegment={highlightSegment ?? null}
            localHighlightSegment={localHighlightSegment}
            isSpeaking={!!isSpeaking}
            localTtsSpeaking={localTtsSpeaking}
            speechEnabled={speechEnabled}
            isAdmin={isAdmin}
            roomId={roomId}
            username={username}
            onMessageDeleted={onMessageDeleted}
            onSendMessage={onSendMessage}
            onCopyMessage={copyMessage}
            onDeleteMessage={deleteMessage}
            setHoveredMessageId={setHoveredMessageId}
            setIsInteractingWithPreview={setIsInteractingWithPreview}
            setLocalHighlightSegment={setLocalHighlightSegment}
            setPlayingMessageId={setPlayingMessageId}
            setSpeechLoadingId={setSpeechLoadingId}
            localHighlightQueueRef={localHighlightQueueRef}
            isInteractingWithPreview={isInteractingWithPreview}
            speak={speak}
            stop={stop}
            playNote={playNote}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
          />
        );
      })}
      {/* Typing indicators for room view */}
      <AnimatePresence>
        {isRoomView && typingUsers && typingUsers.length > 0 && (
          <motion.div
            key="typing-indicator"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="flex items-start gap-1"
          >
            <div
              className="p-1.5 px-2 chat-bubble bg-neutral-200 text-neutral-400 w-fit max-w-[90%] min-h-[12px] rounded leading-snug font-geneva-12 break-words"
              style={{ fontSize: `${fontSize}px` }}
            >
              <div className="flex items-center gap-1.5">
                <TypingDots />
                <span className="text-neutral-400 text-[11px]">
                  {typingUsers.length === 1
                    ? typingUsers[0]
                    : typingUsers.length === 2
                    ? `${typingUsers[0]} & ${typingUsers[1]}`
                    : `${typingUsers[0]} & ${typingUsers.length - 1} others`}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error &&
        (() => {
          const errorMessage = getErrorMessage(error);

          // Check if it's a rate limit error that's handled elsewhere
          const isRateLimitError =
            errorMessage === "Daily AI message limit reached." ||
            errorMessage === "Set a username to continue chatting with Ryo.";

          // Don't show these errors in chat since they're handled by other UI
          if (isRateLimitError) return null;

          // Special handling for login message - render in gray like "Start a new conversation?"
          if (errorMessage === t("apps.chats.status.loginToContinue")) {
            if (username) {
              return null;
            }
            return (
              <motion.div
                key="login-message"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
              >
                <ChatCircle className="h-3 w-3" weight="bold" />
                <span>{errorMessage}</span>
              </motion.div>
            );
          }

          return (
            <motion.div
              key="error-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 text-red-600 font-['Geneva-9'] text-[16px] antialiased pl-1 py-1"
            >
              <WarningCircle className="h-3 w-3 mt-0.5 flex-shrink-0" weight="bold" />
              <div className="flex-1 flex flex-row items-start justify-between gap-1">
                <span className="leading-none">{errorMessage}</span>
                {onRetry && (
                  <Button
                    size="sm"
                    variant="link"
                    onClick={onRetry}
                    className="m-0 p-0 h-auto text-red-600 text-[16px] h-[16px] hover:text-red-700"
                  >
                    {t("apps.chats.status.retry")}
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}
// --- END NEW INNER COMPONENT ---

export function ChatMessages({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
  isRoomView,
  roomId,
  isAdmin = false,
  username,
  onMessageDeleted,
  fontSize,
  scrollToBottomTrigger,
  highlightSegment,
  isSpeaking,
  onSendMessage,
  isLoadingGreeting,
  typingUsers,
}: ChatMessagesProps) {
  return (
    // Use StickToBottom component as the main container
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden w-full h-full"
      // Optional props for smooth scrolling behavior
      resize="smooth"
      initial="instant"
    >
      {/* StickToBottom.Content wraps the actual scrollable content */}
      <StickToBottom.Content className="flex flex-col gap-1 p-3 pt-12 pb-14">
        {/* Render the inner component here */}
        <ChatMessagesContent
          messages={messages}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          onClear={onClear}
          isRoomView={isRoomView}
          roomId={roomId}
          isAdmin={isAdmin}
          username={username}
          onMessageDeleted={onMessageDeleted}
          fontSize={fontSize}
          scrollToBottomTrigger={scrollToBottomTrigger}
          highlightSegment={highlightSegment}
          isSpeaking={isSpeaking}
          onSendMessage={onSendMessage}
          isLoadingGreeting={isLoadingGreeting}
          typingUsers={typingUsers}
        />
      </StickToBottom.Content>

      {/* Render the scroll-to-bottom button */}
      <ScrollToBottomButton />
    </StickToBottom>
  );
}
