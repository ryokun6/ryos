import { UIMessage as VercelMessage } from "@ai-sdk/react";
import { WarningCircle, ChatCircle, Copy, Check, CaretDown, Trash, SpeakerHigh, Pause, PaperPlaneRight } from "@phosphor-icons/react";
import { createCodePlugin } from "@streamdown/code";
import { useEffect, useRef, useState, memo, useCallback, type CSSProperties } from "react";
import { Streamdown, type Components as StreamdownComponents } from "streamdown";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { AnimatePresence, motion } from "framer-motion";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";

import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { TypingDots } from "./TypingBubble";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { appNames } from "@/config/appRegistryData";
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
import { useThemeFlags } from "@/hooks/useThemeFlags";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { segmentChatMarkdownText } from "@/lib/chatMarkdown";
import { cleanTextForSpeech } from "../utils/textForSpeech";

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

// Stable module-level animation objects — prevents Framer Motion from seeing
// prop changes on every render, which would otherwise re-trigger animations.
const CHAT_BUBBLE_VARIANTS = { initial: { opacity: 0 }, animate: { opacity: 1 } };
const MOTION_BTN_INITIAL = { opacity: 0, scale: 0.8 } as const;

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
    return appNames[id as AppId] || formatToolName(id);
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

const getMessageKey = (message: {
  id?: string;
  role: string;
  parts?: Array<{ type: string; text?: string }>;
}): string => {
  const messageText = getMessageText(message);
  return message.id === "1" || message.id === "proactive-1"
    ? "greeting"
    : message.id || `${message.role}-${messageText.substring(0, 10)}`;
};

const chatStreamdownComponents: StreamdownComponents = {
  a: ({ children, href, onClick }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ryos-chat-streamdown-link"
      onClick={(event) => {
        onClick?.(event);
        event.stopPropagation();
      }}
    >
      {children}
    </a>
  ),
};

const STREAMDOWN_DISALLOWED_ELEMENTS = ["img"] as const;
const CHAT_STREAMDOWN_SHIKI_THEME: ["github-light", "github-dark"] = [
  "github-light",
  "github-dark",
];
const chatCodePlugin = createCodePlugin({
  themes: CHAT_STREAMDOWN_SHIKI_THEME,
});
const CHAT_STREAMDOWN_PLUGINS = {
  code: chatCodePlugin,
};
const CHAT_STREAMDOWN_ANIMATED = {
  animation: "fadeIn",
  duration: 400,
  easing: "ease-out",
  sep: "word",
} as const;

type ChatMessageStyle = CSSProperties & {
  "--ryos-chat-font-size": string;
};

const getChatMessageStyle = (
  fontSize: number,
  isEmojiMessage = false
): ChatMessageStyle => {
  const size = isEmojiMessage ? "24px" : `${fontSize}px`;
  return {
    fontSize: size,
    "--ryos-chat-font-size": size,
  };
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
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
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
            className={`size-2.5 ${
              isMacTheme ? "text-black/70 relative z-10" : "text-neutral-800"
            }`}
            weight="bold"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// Memoized chat message item - extracted for list rendering performance
interface ChatMessageItemProps {
  message: ChatMessage;
  messageKey: string;
  isInitialMessage: boolean;
  isStreamingMessage: boolean;
  isLoading: boolean;
  isLoadingGreeting: boolean;
  isRoomView: boolean;
  fontSize: number;
  isMacOSTheme: boolean;
  copiedMessageId: string | null;
  playingMessageId: string | null;
  speechLoadingId: string | null;
  speechEnabled: boolean;
  isAdmin: boolean;
  roomId?: string;
  username?: string;
  onMessageDeleted?: (messageId: string) => void;
  onSendMessage?: (username: string) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  setPlayingMessageId: (id: string | null) => void;
  setSpeechLoadingId: (id: string | null) => void;
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
    isAdmin,
    roomId: _roomId,
    username: _username,
    onMessageDeleted: _onMessageDeleted,
    onSendMessage,
    onCopyMessage,
    onDeleteMessage,
    setPlayingMessageId,
    setSpeechLoadingId,
    speak,
    stop,
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
        } chat-messages-meta text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2`}
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
                      className="size-3 text-gray-400 hover:text-red-600 transition-colors"
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
              className="size-3 text-gray-400 hover:text-neutral-600 transition-colors"
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
              initial={MOTION_BTN_INITIAL}
              animate={{
                opacity: isHovered ? 1 : 0,
                scale: 1,
              }}
              className="size-3 text-gray-400 hover:text-neutral-600 transition-colors"
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
                className="size-3 text-gray-400 hover:text-neutral-600 transition-colors"
                onClick={() => {
                  if (playingMessageId === messageKey) {
                    stop();
                    setPlayingMessageId(null);
                  } else {
                    stop();
                    setSpeechLoadingId(null);
                    const text = displayContent.trim();
                    if (text) {
                      const chunks: string[] = [];
                      const lines = text.split(/\r?\n/);
                      for (const line of lines) {
                        const cleanedLine = cleanTextForSpeech(line);
                        if (cleanedLine && cleanedLine.length > 0) {
                          chunks.push(cleanedLine);
                        }
                      }
                      if (chunks.length > 0) {
                        let pendingChunks = chunks.length;
                        setSpeechLoadingId(messageKey);
                        setPlayingMessageId(messageKey);
                        chunks.forEach((chunk) => {
                          speak(chunk, () => {
                            pendingChunks -= 1;
                            if (pendingChunks === 0) {
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
                    className="size-3 text-gray-400 hover:text-blue-600 transition-colors"
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
                  className="size-3 text-gray-400 hover:text-red-600 transition-colors"
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
                            <span
                              key={partKey}
                              className="select-text italic"
                            >
                              {t("apps.chats.status.editing")}
                            </span>
                          );
                        }
                      }
                      const rawPartContent = isUrgentMessage(partText)
                        ? partText.slice(4).trimStart()
                        : partText;
                      const partDisplayContent = decodeHtmlEntities(rawPartContent);
                      const textContent = partDisplayContent;
                      const streamdownContent = textContent.trim();
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
                          {streamdownContent && (
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
                              mode={isStreamingMessage ? "streaming" : "static"}
                              animated={CHAT_STREAMDOWN_ANIMATED}
                              isAnimating={isStreamingMessage}
                              parseIncompleteMarkdown={isStreamingMessage}
                            >
                              {streamdownContent}
                            </Streamdown>
                          )}
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
  const { isMacOSTheme } = useThemeFlags();
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null);

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
      initialMessageIdsRef.current = new Set(messages.map(getMessageKey));
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

  const copyMessage = useCallback(async (message: ChatMessage) => {
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
  }, []);

  const deleteMessage = useCallback(async (message: ChatMessage) => {
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
  }, [roomId, onMessageDeleted]);

  // Only treat the very last message as a streaming target, and only if it
  // is an assistant message. Searching backwards for the last assistant can
  // briefly flag a previously-completed assistant message as streaming
  // during the moment after the user's new message is appended but before
  // the AI SDK pushes the next empty assistant message — that flicker would
  // make Streamdown's animate plugin re-run and rapidly fade-in the whole
  // prior reply word-by-word.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const streamingAssistantMessage =
    isLoading && lastMessage && lastMessage.role === "assistant"
      ? lastMessage
      : undefined;
  const streamingAssistantMessageKey = streamingAssistantMessage
    ? getMessageKey(streamingAssistantMessage)
    : null;

  // Belt-and-suspenders: once a message key has been seen as streaming and
  // then leaves that state, lock its `isAnimating` to false forever so any
  // future flicker (e.g. message list reorder, key reuse) cannot re-trigger
  // the animation.
  const animatedKeysRef = useRef<Set<string>>(new Set());
  const previousStreamingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const previousKey = previousStreamingKeyRef.current;
    if (previousKey && previousKey !== streamingAssistantMessageKey) {
      animatedKeysRef.current.add(previousKey);
    }
    previousStreamingKeyRef.current = streamingAssistantMessageKey;
  }, [streamingAssistantMessageKey]);

  // Return the message list rendering logic
  return (
    <AnimatePresence initial={false} mode="sync">
      {messages.length === 0 && !isRoomView && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
        >
          <ChatCircle className="size-3" weight="bold" />
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
        const messageKey = getMessageKey(message);
        const isInitialMessage = initialMessageIdsRef.current.has(messageKey);
        const isStreamingMessage =
          messageKey === streamingAssistantMessageKey &&
          !animatedKeysRef.current.has(messageKey);
        return (
          <ChatMessageItem
            key={messageKey}
            message={message}
            messageKey={messageKey}
            isInitialMessage={isInitialMessage}
            isStreamingMessage={isStreamingMessage}
            isLoading={isLoading}
            isLoadingGreeting={!!isLoadingGreeting}
            isRoomView={isRoomView}
            fontSize={fontSize}
            isMacOSTheme={isMacOSTheme}
            copiedMessageId={copiedMessageId}
            playingMessageId={playingMessageId}
            speechLoadingId={speechLoadingId}
            speechEnabled={speechEnabled}
            isAdmin={isAdmin}
            roomId={roomId}
            username={username}
            onMessageDeleted={onMessageDeleted}
            onSendMessage={onSendMessage}
            onCopyMessage={copyMessage}
            onDeleteMessage={deleteMessage}
            setPlayingMessageId={setPlayingMessageId}
            setSpeechLoadingId={setSpeechLoadingId}
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
              style={getChatMessageStyle(fontSize)}
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
                <ChatCircle className="size-3" weight="bold" />
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
              <WarningCircle className="size-3 mt-0.5 flex-shrink-0" weight="bold" />
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
  onSendMessage,
  isLoadingGreeting,
  typingUsers,
}: ChatMessagesProps) {
  return (
    // Use StickToBottom component as the main container
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden size-full"
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
