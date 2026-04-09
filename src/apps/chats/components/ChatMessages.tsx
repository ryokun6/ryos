import { UIMessage as VercelMessage } from "@ai-sdk/react";
import { WarningCircle, ChatCircle, Copy, Check, CaretDown, Trash, SpeakerHigh, Pause, PaperPlaneRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
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
import { segmentChatMarkdownText, type ChatMarkdownToken } from "@/lib/chatMarkdown";

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

const getMessageKey = (message: ChatMessage): string => {
  const messageText = getMessageText(message);
  return message.id === "1" || message.id === "proactive-1"
    ? "greeting"
    : message.id || `${message.role}-${messageText.substring(0, 10)}`;
};

const getCreatedAtValue = (createdAt?: Date): number | null => {
  if (!createdAt) return null;
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value) ? value : null;
};

const areToolPartPayloadsEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

const areMessagePartsEqual = (
  prevParts?: ChatMessage["parts"],
  nextParts?: ChatMessage["parts"]
): boolean => {
  if (prevParts === nextParts) return true;
  if (!prevParts || !nextParts) return prevParts === nextParts;
  if (prevParts.length !== nextParts.length) return false;

  return prevParts.every((part, index) => {
    const nextPart = nextParts[index];
    if (!nextPart || part.type !== nextPart.type) return false;

    return (
      (part as { text?: string }).text === (nextPart as { text?: string }).text &&
      (part as { url?: string }).url === (nextPart as { url?: string }).url &&
      (part as { mediaType?: string }).mediaType ===
        (nextPart as { mediaType?: string }).mediaType &&
      (part as { toolCallId?: string }).toolCallId ===
        (nextPart as { toolCallId?: string }).toolCallId &&
      (part as { state?: string }).state === (nextPart as { state?: string }).state &&
      (part as { errorText?: string }).errorText ===
        (nextPart as { errorText?: string }).errorText &&
      areToolPartPayloadsEqual(
        (part as { input?: unknown }).input,
        (nextPart as { input?: unknown }).input
      ) &&
      areToolPartPayloadsEqual(
        (part as { output?: unknown }).output,
        (nextPart as { output?: unknown }).output
      )
    );
  });
};

const areMessagesEqual = (prev: ChatMessage, next: ChatMessage): boolean =>
  prev.id === next.id &&
  prev.serverId === next.serverId &&
  prev.role === next.role &&
  prev.username === next.username &&
  prev.isPending === next.isPending &&
  getCreatedAtValue(prev.metadata?.createdAt) ===
    getCreatedAtValue(next.metadata?.createdAt) &&
  areMessagePartsEqual(prev.parts, next.parts);

const isSegmentForMessage = (
  segment: { messageId: string; start: number; end: number } | null,
  messageId?: string
): boolean => !!segment && !!messageId && segment.messageId === messageId;

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
  playingMessageId: string | null;
  speechLoadingId: string | null;
  highlightSegment: { messageId: string; start: number; end: number } | null;
  localHighlightSegment: { messageId: string; start: number; end: number } | null;
  isSpeaking: boolean;
  localTtsSpeaking: boolean;
  speechEnabled: boolean;
  isAdmin: boolean;
  onSendMessage?: (username: string) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  setIsInteractingWithPreview: (v: boolean) => void;
  setLocalHighlightSegment: (seg: { messageId: string; start: number; end: number } | null) => void;
  setPlayingMessageId: (id: string | null) => void;
  setSpeechLoadingId: (id: string | null) => void;
  localHighlightQueueRef: React.MutableRefObject<{ messageId: string; start: number; end: number }[]>;
  speak: (text: string, onDone?: () => void) => void;
  stop: () => void;
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
    playingMessageId,
    speechLoadingId,
    highlightSegment,
    localHighlightSegment,
    isSpeaking,
    localTtsSpeaking,
    speechEnabled,
    isAdmin,
    onSendMessage,
    onCopyMessage,
    onDeleteMessage,
    setIsInteractingWithPreview,
    setLocalHighlightSegment,
    setPlayingMessageId,
    setSpeechLoadingId,
    localHighlightQueueRef,
    speak,
    stop,
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
  const resolvedMessageId = message.id || messageKey;
  const highlightActive =
    combinedIsSpeaking &&
    combinedHighlightSeg &&
    combinedHighlightSeg.messageId === resolvedMessageId;
  const isCopied = copiedMessageId === messageKey;
  const isPlaying = playingMessageId === messageKey;
  const isSpeechLoading = speechLoadingId === messageKey;
  const isEmojiOnlyContent = useMemo(
    () => isEmojiOnly(displayContent),
    [displayContent]
  );
  const actionButtonClass =
    "h-3 w-3 text-gray-400 opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-neutral-600";

  const allUrls = useMemo(() => {
    const urls = new Set<string>();
    const collectUrls = (content: string) => {
      segmentChatMarkdownText(content).forEach((token) => {
        if (token.type === "link" && token.url) {
          urls.add(token.url);
        }
      });
    };

    if (message.role === "assistant") {
      message.parts?.forEach(
        (part: ToolInvocationPart | { type: string; text?: string }) => {
          if (part.type === "text") {
            const partText = (part as { type: string; text?: string }).text || "";
            const partContent = isUrgentMessage(partText)
              ? partText.slice(4).trimStart()
              : partText;
            collectUrls(decodeHtmlEntities(partContent));
          }
        }
      );
    } else {
      collectUrls(displayContent);
    }

    return Array.from(urls);
  }, [displayContent, message.parts, message.role]);

  const renderInlineToken = (segment: ChatMarkdownToken) => {
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
  };

  return (
    <motion.div
      key={messageKey}
      initial={
        isInitialMessage || isStaticGreeting ? false : { opacity: 0, y: 10 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={isStaticGreeting ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
      className={`group flex flex-col z-10 w-full ${
        message.role === "user" ? "items-end" : "items-start"
      }`}
      style={{
        transformOrigin: message.role === "user" ? "bottom right" : "bottom left",
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
                    <button
                      className={`${actionButtonClass} hover:text-red-600`}
                      onClick={() => onDeleteMessage(message)}
                      aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                    >
                      <Trash className="h-3 w-3" weight="bold" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("apps.chats.messages.delete")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <button
              className={actionButtonClass}
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {isCopied ? (
                <Check className="h-3 w-3" weight="bold" />
              ) : (
                <Copy className="h-3 w-3" weight="bold" />
              )}
            </button>
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
            <button
              className={actionButtonClass}
              onClick={() => onCopyMessage(message)}
              aria-label={t("apps.chats.ariaLabels.copyMessage")}
            >
              {isCopied ? (
                <Check className="h-3 w-3" weight="bold" />
              ) : (
                <Copy className="h-3 w-3" weight="bold" />
              )}
            </button>
            {speechEnabled && (
              <button
                className={actionButtonClass}
                onClick={() => {
                  if (isPlaying) {
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
                            messageId: resolvedMessageId,
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
                  isPlaying
                    ? t("apps.chats.ariaLabels.stopSpeech")
                    : t("apps.chats.ariaLabels.speakMessage")
                }
              >
                {isPlaying ? (
                  isSpeechLoading ? (
                    <ActivityIndicator size="xs" />
                  ) : (
                    <Pause className="h-3 w-3" weight="bold" />
                  )
                ) : (
                  <SpeakerHigh className="h-3 w-3" weight="bold" />
                )}
              </button>
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
                  <button
                    className={`${actionButtonClass} hover:text-blue-600`}
                    onClick={() => onSendMessage(message.username!)}
                    aria-label={t("apps.chats.ariaLabels.messageUser", {
                      username: message.username,
                    })}
                  >
                    <PaperPlaneRight className="h-3 w-3" weight="bold" />
                  </button>
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
                <button
                  className={`${actionButtonClass} hover:text-red-600`}
                  onClick={() => onDeleteMessage(message)}
                  aria-label={t("apps.chats.ariaLabels.deleteMessage")}
                >
                  <Trash className="h-3 w-3" weight="bold" />
                </button>
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
        <div
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
            <div className="select-text flex flex-col gap-1">
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
                            <span key={partKey} className="select-text italic">
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
                      const isEmojiOnlyText = isEmojiOnly(textContent);
                      return (
                        <div key={partKey} className="w-full">
                          <div className="whitespace-pre-wrap">
                            {textContent &&
                              (() => {
                                const tokens = segmentChatMarkdownText(textContent.trim());
                                let charPos = 0;
                                return tokens.map((segment, idx) => {
                                  const start = charPos;
                                  const end = charPos + segment.content.length;
                                  charPos = end;
                                  return (
                                    <span
                                      key={`${partKey}-segment-${idx}`}
                                      className={`select-text ${
                                        isEmojiOnlyText
                                          ? "text-[24px]"
                                          : ""
                                      } ${
                                        segment.type === "bold"
                                          ? "font-bold"
                                          : segment.type === "italic"
                                          ? "italic"
                                          : ""
                                      }`}
                                      style={{
                                        userSelect: "text",
                                        fontSize: isEmojiOnlyText
                                          ? undefined
                                          : `${fontSize}px`,
                                      }}
                                    >
                                      {highlightActive &&
                                      start < (combinedHighlightSeg?.end ?? 0) &&
                                      end > (combinedHighlightSeg?.start ?? 0) ? (
                                        <span className="animate-highlight">
                                          {renderInlineToken(segment)}
                                        </span>
                                      ) : (
                                        renderInlineToken(segment)
                                      )}
                                    </span>
                                  );
                                });
                              })()}
                          </div>
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
            </div>
          ) : (
            <>
              {displayContent && (
                <span
                  className={`select-text whitespace-pre-wrap ${
                    isEmojiOnlyContent ? "text-[24px]" : ""
                  }`}
                  style={{
                    userSelect: "text",
                    fontSize: isEmojiOnlyContent
                      ? undefined
                      : `${fontSize}px`,
                  }}
                >
                  {(() => {
                    const tokens = segmentChatMarkdownText(displayContent);
                    let charPos2 = 0;
                    return tokens.map((segment, idx) => {
                      const start2 = charPos2;
                      const end2 = charPos2 + segment.content.length;
                      charPos2 = end2;
                      const isHighlight =
                        highlightActive &&
                        start2 < (combinedHighlightSeg?.end ?? 0) &&
                        end2 > (combinedHighlightSeg?.start ?? 0);
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
        </div>
      )}

      {allUrls.length > 0 && (
        <div
          className={`flex flex-col gap-2 w-full ${
            !isUrlOnly(displayContent) ? "mt-2" : ""
          } ${message.role === "user" ? "items-end" : "items-start"}`}
        >
          {allUrls.map((url, index) => (
            <LinkPreview
              key={`${messageKey}-link-${index}`}
              url={url}
              className="max-w-[90%]"
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}, (prevProps, nextProps) => {
  if (!areMessagesEqual(prevProps.message, nextProps.message)) return false;
  if (prevProps.messageKey !== nextProps.messageKey) return false;
  if (prevProps.isInitialMessage !== nextProps.isInitialMessage) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoadingGreeting !== nextProps.isLoadingGreeting) return false;
  if (prevProps.isRoomView !== nextProps.isRoomView) return false;
  if (prevProps.fontSize !== nextProps.fontSize) return false;
  if (prevProps.currentTheme !== nextProps.currentTheme) return false;
  if (prevProps.speechEnabled !== nextProps.speechEnabled) return false;
  if (prevProps.isAdmin !== nextProps.isAdmin) return false;
  if (prevProps.onSendMessage !== nextProps.onSendMessage) return false;

  const prevMessageId = prevProps.message.id || prevProps.messageKey;
  const nextMessageId = nextProps.message.id || nextProps.messageKey;
  const wasCopied = prevProps.copiedMessageId === prevProps.messageKey;
  const isCopied = nextProps.copiedMessageId === nextProps.messageKey;
  if (wasCopied !== isCopied) return false;

  const wasPlaying = prevProps.playingMessageId === prevProps.messageKey;
  const isPlaying = nextProps.playingMessageId === nextProps.messageKey;
  if (wasPlaying !== isPlaying) return false;

  const wasSpeechLoading = prevProps.speechLoadingId === prevProps.messageKey;
  const isSpeechLoading = nextProps.speechLoadingId === nextProps.messageKey;
  if (wasSpeechLoading !== isSpeechLoading) return false;

  const prevHighlightActive =
    isSegmentForMessage(prevProps.highlightSegment, prevMessageId) ||
    isSegmentForMessage(prevProps.localHighlightSegment, prevMessageId);
  const nextHighlightActive =
    isSegmentForMessage(nextProps.highlightSegment, nextMessageId) ||
    isSegmentForMessage(nextProps.localHighlightSegment, nextMessageId);
  if (prevHighlightActive !== nextHighlightActive) return false;

  if (prevHighlightActive || nextHighlightActive) {
    if (
      prevProps.highlightSegment?.start !== nextProps.highlightSegment?.start ||
      prevProps.highlightSegment?.end !== nextProps.highlightSegment?.end ||
      prevProps.localHighlightSegment?.start !==
        nextProps.localHighlightSegment?.start ||
      prevProps.localHighlightSegment?.end !== nextProps.localHighlightSegment?.end
    ) {
      return false;
    }
  }

  const prevSpeaking =
    prevProps.isSpeaking !== nextProps.isSpeaking ||
    prevProps.localTtsSpeaking !== nextProps.localTtsSpeaking;
  if ((prevHighlightActive || nextHighlightActive) && prevSpeaking) {
    return false;
  }

  return true;
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
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteractingWithPreviewRef = useRef(false);

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

  const setIsInteractingWithPreview = useCallback((value: boolean) => {
    isInteractingWithPreviewRef.current = value;
  }, []);

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

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const resetCopiedMessage = useCallback((messageKey: string) => {
    setCopiedMessageId(messageKey);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopiedMessageId(null);
      copyResetTimeoutRef.current = null;
    }, 2000);
  }, []);

  const copyMessage = useCallback(async (message: ChatMessage) => {
    const messageText = getMessageText(message);
    const resolvedMessageKey = getMessageKey(message);
    try {
      await navigator.clipboard.writeText(messageText);
      resetCopiedMessage(resolvedMessageKey);
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
        resetCopiedMessage(resolvedMessageKey);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  }, [resetCopiedMessage]);

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
  }, [onMessageDeleted, roomId]);

  // Return the message list rendering logic
  return (
    <>
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
        const messageKey = getMessageKey(message);
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
            playingMessageId={playingMessageId}
            speechLoadingId={speechLoadingId}
            highlightSegment={highlightSegment ?? null}
            localHighlightSegment={localHighlightSegment}
            isSpeaking={!!isSpeaking}
            localTtsSpeaking={localTtsSpeaking}
            speechEnabled={speechEnabled}
            isAdmin={isAdmin}
            onSendMessage={onSendMessage}
            onCopyMessage={copyMessage}
            onDeleteMessage={deleteMessage}
            setIsInteractingWithPreview={setIsInteractingWithPreview}
            setLocalHighlightSegment={setLocalHighlightSegment}
            setPlayingMessageId={setPlayingMessageId}
            setSpeechLoadingId={setSpeechLoadingId}
            localHighlightQueueRef={localHighlightQueueRef}
            speak={speak}
            stop={stop}
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
    </>
  );
}
// --- END NEW INNER COMPONENT ---

export const ChatMessages = memo(function ChatMessages({
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
});
