import { UIMessage as VercelMessage } from "@ai-sdk/react";
import { WarningCircle, ChatCircle, Copy, Check, CaretDown, Trash, SpeakerHigh, Pause, PaperPlaneRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
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
    return "bg-gray-100 text-black";
  }
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

  const jsonMatch = error.message.match(/\{.*\}/);

  if (jsonMatch) {
    try {
      const errorData = JSON.parse(jsonMatch[0]);

      if (errorData.error === "rate_limit_exceeded") {
        if (errorData.isAuthenticated) {
          return i18n.t("apps.chats.status.dailyLimitReached");
        } else {
          return i18n.t("apps.chats.status.loginToContinue");
        }
      }

      if (errorData.error === "authentication_failed") {
        return i18n.t("apps.chats.status.sessionExpired");
      }

      if (typeof errorData.error === "string") {
        return errorData.error;
      }

      if (typeof errorData.message === "string") {
        return errorData.message;
      }
    } catch {
      // If JSON parsing fails, continue to fallback
    }
  }

  if (error.message.startsWith("Error: ")) {
    return error.message.slice(7);
  }

  return error.message;
};

// Helper to map an app id to a user-friendly name (uses translations)
const getAppName = (id?: string): string => {
  if (!id) return "app";
  try {
    return getTranslatedAppName(id as AppId);
  } catch {
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

// Detect touch device once per render (used to gate touch-triggered hover).
// NOTE: We intentionally do NOT gate mouseenter/mouseleave with this check –
// some desktop browsers / hybrid devices / cloud VMs report maxTouchPoints > 0
// even though the primary input is a mouse, and blocking hover there prevents
// hover-revealed toolbar icons from ever appearing.
const isTouchDevice = (): boolean =>
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

// Define an extended message type that includes username
interface ChatMessage extends Omit<VercelMessage, "role"> {
  username?: string;
  role: VercelMessage["role"] | "human";
  isPending?: boolean;
  serverId?: string;
  metadata?: {
    createdAt?: Date;
    [key: string]: unknown;
  };
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean;
  roomId?: string;
  isAdmin?: boolean;
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
          onClick={() => scrollToBottom()}
          aria-label={t("apps.chats.status.scrollToBottom")}
        >
          {isMacTheme && (
            <>
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

// Memoized chat message item - extracted for list rendering performance.
//
// IMPORTANT: This component uses a CUSTOM MEMO COMPARATOR so that prop-cascade
// re-renders (e.g. when another message is copied/hovered/highlighted, or when
// the chat is streaming) are avoided. Only re-render when the props that
// actually affect THIS message's visual output have changed.
interface ChatMessageItemProps {
  message: ChatMessage;
  messageKey: string;
  isInitialMessage: boolean;
  isLoading: boolean;
  isLoadingGreeting: boolean;
  isRoomView: boolean;
  fontSize: number;
  currentTheme: string;
  isCopied: boolean;
  isPlaying: boolean;
  isSpeechLoading: boolean;
  // True only for the last assistant message while isLoading is true. When
  // streaming, we render text as a single span (no markdown tokenization)
  // to keep per-delta reconciliation cheap. Tokenization happens once the
  // stream completes.
  isStreaming: boolean;
  // highlightSegment / localHighlightSegment are ONLY non-null if the segment
  // belongs to THIS message; parent filters these before passing.
  highlightSegment: { messageId: string; start: number; end: number } | null;
  localHighlightSegment: { messageId: string; start: number; end: number } | null;
  isSpeakingAny: boolean;
  speechEnabled: boolean;
  isAdmin: boolean;
  onSendMessage?: (username: string) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onPlaySpeech: (message: ChatMessage, displayContent: string) => void;
  onStopSpeech: () => void;
  setIsInteractingWithPreview: (v: boolean) => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

const ChatMessageItem = memo(
  function ChatMessageItem(props: ChatMessageItemProps) {
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
      isCopied,
      isPlaying,
      isSpeechLoading,
      isStreaming,
      highlightSegment,
      localHighlightSegment,
      isSpeakingAny,
      speechEnabled,
      isAdmin,
      onSendMessage,
      onCopyMessage,
      onDeleteMessage,
      onPlaySpeech,
      onStopSpeech,
      setIsInteractingWithPreview,
      playElevatorMusic,
      stopElevatorMusic,
      playDingSound,
    } = props;

    // Local hover state: avoids cascading re-renders to ALL messages whenever
    // the cursor enters a different message. Each item owns its own hover.
    const [isHovered, setIsHovered] = useState(false);

    // Derived values – memoised against `message` and content changes.
    // Because memo custom comparator only lets us re-render when the message
    // ref changes (or other relevant props), these useMemos act as a cache
    // and also keep tokens stable across hover/copy toggles.
    const messageText = useMemo(() => {
      const raw = getMessageText(message);
      const isStaticGreeting =
        message.role === "assistant" && message.id === "1";
      if (isStaticGreeting && !raw) {
        return t("apps.chats.messages.greeting");
      }
      return raw;
    }, [message, t]);

    const isStaticGreeting = message.role === "assistant" && message.id === "1";
    const showTypingDots = isLoadingGreeting && !isRoomView && isStaticGreeting;
    const isUrgent = isUrgentMessage(messageText);

    let bgColorClass = "";
    if (isUrgent) {
      bgColorClass = "bg-transparent text-current";
    } else if (message.role === "user") bgColorClass = "bg-yellow-100 text-black";
    else if (message.role === "assistant") bgColorClass = "bg-blue-100 text-black";
    else if (message.role === "human") bgColorClass = getUserColorClass(message.username);

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
    const highlightActive = isSpeakingAny && !!combinedHighlightSeg;

    // Cache token segmentation for this message's visible content.
    // The assistant branch parses per-part text; the user/human branch uses
    // the combined `displayContent`. Pre-compute once per render, so we avoid
    // re-tokenising every refresh.
    const displayTokens = useMemo<ChatMarkdownToken[]>(() => {
      if (message.role === "assistant") return [];
      if (!displayContent) return [];
      return segmentChatMarkdownText(displayContent);
    }, [message.role, displayContent]);

    // Memoise the image URLs extracted from parts.
    const imageUrls = useMemo<string[]>(() => {
      if (message.role !== "user") return [];
      return extractImageParts(
        message as {
          parts?: Array<{ type: string; url?: string; mediaType?: string }>;
        }
      );
    }, [message]);

    // Memoise collected URLs for link previews.
    //
    // During streaming we skip URL extraction entirely — link previews are
    // rendered AFTER the stream completes, otherwise we'd be paying for
    // regex-heavy URL scanning on every ~50ms delta on the longest
    // in-flight message. When isStreaming flips to false we re-compute
    // once and render previews.
    const allUrls = useMemo<string[]>(() => {
      if (isStreaming) return [];
      const urls = new Set<string>();
      const collectFromText = (text: string) => {
        segmentChatMarkdownText(text).forEach((token) => {
          if (token.type === "link" && token.url) urls.add(token.url);
        });
      };
      if (message.role === "assistant") {
        message.parts?.forEach(
          (part: ToolInvocationPart | { type: string; text?: string }) => {
            if (part.type === "text") {
              const partText =
                (part as { type: string; text?: string }).text || "";
              const partContent = isUrgentMessage(partText)
                ? partText.slice(4).trimStart()
                : partText;
              collectFromText(decodeHtmlEntities(partContent));
            }
          }
        );
      } else {
        collectFromText(displayContent);
      }
      return Array.from(urls);
    }, [message, displayContent, isStreaming]);

    // Touch support: toggle toolbar on touch, but skip when the touch lands
    // on a link preview so it can handle its own gestures. Desktop hover uses
    // the wrapper's `group-hover:` CSS class (no React state needed), which
    // avoids a re-render per mouse enter/leave and is also resilient to
    // environments where synthetic mouse events are dropped.
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (!isTouchDevice()) return;
      const target = e.target as HTMLElement;
      const isLinkPreview = target.closest("[data-link-preview]");
      if (!isLinkPreview) {
        e.preventDefault();
        setIsHovered((prev) => !prev);
      }
    }, []);

    const renderInlineToken = (segment: ChatMarkdownToken) => {
      if ((segment.type === "link" || segment.type === "citation") && segment.url) {
        return (
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
        );
      }
      return segment.content;
    };

    // Hover-reveal button visibility: CSS opacity toggle driven by the
    // wrapper's `group` class + group-hover. This is a pure-CSS hover path
    // (no React state update per hover) which is both fast and also reliable
    // in contexts where React synthetic events might be misrouted.
    // We keep `isHovered` state available for the touch path.
    const toolbarBtnClass = (extra: string) =>
      `h-3 w-3 text-gray-400 transition-opacity duration-150 opacity-0 group-hover:opacity-100 ${
        isHovered ? "!opacity-100" : ""
      } ${extra}`;

    // Message entry fade: only animate brand-new messages. For messages already
    // in the initial list or the static greeting, skip the opacity animation
    // via `initial={false}`, which makes framer-motion render at the final
    // state immediately (avoiding a one-shot compositor paint per history item).
    const shouldAnimate = !(isInitialMessage || isStaticGreeting);
    const wrapperClassName = `group flex flex-col z-10 w-full ${
      message.role === "user" ? "items-end" : "items-start"
    }`;
    const wrapperStyle = {
      transformOrigin:
        message.role === "user" ? ("bottom right" as const) : ("bottom left" as const),
    };

    return (
      <motion.div
        key={messageKey}
        initial={shouldAnimate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={wrapperClassName}
        style={wrapperStyle}
        onTouchStart={handleTouchStart}
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
                        type="button"
                        className={toolbarBtnClass("hover:text-red-600")}
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
                type="button"
                className={toolbarBtnClass("hover:text-neutral-600")}
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
                type="button"
                className={toolbarBtnClass("hover:text-neutral-600")}
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
                  type="button"
                  className={toolbarBtnClass("hover:text-neutral-600")}
                  onClick={() => {
                    if (isPlaying) {
                      onStopSpeech();
                    } else {
                      onPlaySpeech(message, displayContent);
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
                      type="button"
                      className={toolbarBtnClass("hover:text-blue-600")}
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
                    type="button"
                    className={toolbarBtnClass("hover:text-red-600")}
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

        {imageUrls.length > 0 && (
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
        )}

        {!isUrlOnly(displayContent) && (
          <div
            className={`p-1.5 px-2 chat-bubble ${
              showTypingDots
                ? "bg-neutral-200 text-neutral-400"
                : bgColorClass ||
                  (message.role === "user"
                    ? "bg-yellow-100 text-black"
                    : "bg-blue-100 text-black")
            } ${
              isUrgent ? "animate-urgent-bg" : ""
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
                          (isStaticGreeting
                            ? t("apps.chats.messages.greeting")
                            : "");
                        const hasXmlTags =
                          /<textedit:(insert|replace|delete)/i.test(partText);
                        if (hasXmlTags) {
                          const openTags = (
                            partText.match(
                              /<textedit:(insert|replace|delete)/g
                            ) || []
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
                        const partDisplayContent =
                          decodeHtmlEntities(rawPartContent);
                        const textContent = partDisplayContent;
                        if (!textContent) {
                          return <div key={partKey} className="w-full" />;
                        }
                        const textIsEmojiOnly = isEmojiOnly(textContent);
                        const commonStyle = {
                          userSelect: "text" as const,
                          fontSize: textIsEmojiOnly
                            ? undefined
                            : `${fontSize}px`,
                        };
                        // Streaming fast-path: the last assistant message
                        // receives a text delta every ~50ms. Tokenizing +
                        // rendering hundreds of span nodes per delta is the
                        // main source of lag here. Render raw text as a
                        // single span during streaming; tokenize once the
                        // stream completes (isStreaming -> false).
                        if (isStreaming) {
                          return (
                            <div key={partKey} className="w-full">
                              <div
                                className={`whitespace-pre-wrap select-text ${
                                  textIsEmojiOnly ? "text-[24px]" : ""
                                }`}
                                style={commonStyle}
                              >
                                {textContent.trim()}
                              </div>
                            </div>
                          );
                        }
                        const tokens = segmentChatMarkdownText(
                          textContent.trim()
                        );
                        let charPos = 0;
                        return (
                          <div key={partKey} className="w-full">
                            <div className="whitespace-pre-wrap">
                              {tokens.map((segment, idx) => {
                                const start = charPos;
                                const end = charPos + segment.content.length;
                                charPos = end;
                                const isHighlight =
                                  highlightActive &&
                                  combinedHighlightSeg &&
                                  start < combinedHighlightSeg.end &&
                                  end > combinedHighlightSeg.start;
                                return (
                                  <span
                                    key={`${partKey}-segment-${idx}`}
                                    className={`select-text ${
                                      textIsEmojiOnly ? "text-[24px]" : ""
                                    } ${
                                      segment.type === "bold"
                                        ? "font-bold"
                                        : segment.type === "italic"
                                        ? "italic"
                                        : ""
                                    }`}
                                    style={commonStyle}
                                  >
                                    {isHighlight ? (
                                      <span className="animate-highlight">
                                        {renderInlineToken(segment)}
                                      </span>
                                    ) : (
                                      renderInlineToken(segment)
                                    )}
                                  </span>
                                );
                              })}
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
                          highlightActive &&
                          combinedHighlightSeg &&
                          start2 < combinedHighlightSeg.end &&
                          end2 > combinedHighlightSeg.start;
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
  },
  // Custom comparator: skip re-render unless something RELEVANT to this
  // message changed. This is the single biggest win – without it, every
  // hover/copy/highlight/loading toggle re-rendered the whole list.
  function arePropsEqual(prev, next) {
    if (prev.message !== next.message) return false;
    if (prev.messageKey !== next.messageKey) return false;
    if (prev.isInitialMessage !== next.isInitialMessage) return false;
    if (prev.fontSize !== next.fontSize) return false;
    if (prev.currentTheme !== next.currentTheme) return false;
    if (prev.isRoomView !== next.isRoomView) return false;
    if (prev.isAdmin !== next.isAdmin) return false;
    if (prev.isLoadingGreeting !== next.isLoadingGreeting) return false;
    if (prev.speechEnabled !== next.speechEnabled) return false;
    if (prev.isCopied !== next.isCopied) return false;
    if (prev.isPlaying !== next.isPlaying) return false;
    if (prev.isSpeechLoading !== next.isSpeechLoading) return false;
    if (prev.isStreaming !== next.isStreaming) return false;
    // highlightSegment / localHighlightSegment are already nulled-out by
    // parent when they don't apply to this message, so a reference change is
    // meaningful here.
    if (prev.highlightSegment !== next.highlightSegment) return false;
    if (prev.localHighlightSegment !== next.localHighlightSegment) return false;
    // isSpeakingAny only matters if there's an active highlight on this msg.
    const hasAnyHighlight =
      !!next.highlightSegment || !!next.localHighlightSegment;
    if (hasAnyHighlight && prev.isSpeakingAny !== next.isSpeakingAny) {
      return false;
    }
    // isLoading only matters for messages with tool parts (pending states).
    const hasToolPart = next.message.parts?.some((p) =>
      typeof p.type === "string" && p.type.startsWith("tool-")
    );
    if (hasToolPart && prev.isLoading !== next.isLoading) return false;
    // Callback identity: callbacks are stable via useCallback in the parent.
    // We intentionally ignore identity differences to avoid false re-renders.
    return true;
  }
);

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
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);

  // `isInteractingWithPreview` is used by ToolInvocationMessage / LinkPreview.
  // We no longer need it in the hover logic (that's local to each item now).
  // Referencing it here keeps the setter stable for children.
  void isInteractingWithPreview;

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

  const { scrollToBottom } = useStickToBottomContext();

  // Effect for Sound/Vibration on new incoming messages + streaming note play
  const lastAssistantLenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    // 1) Human-message incoming sound / vibration (unchanged semantics)
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

    // 2) Streaming-note feedback: play a note when the last assistant message
    //    grows. Replaces the per-token motion.onComplete hook. `playNote` has
    //    built-in throttling so calling on every text delta is safe.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      const text = getMessageText(lastMsg);
      const prevLen = lastAssistantLenRef.current[lastMsg.id] || 0;
      if (text.length > prevLen) {
        playNote();
        lastAssistantLenRef.current[lastMsg.id] = text.length;
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

  // deleteMessage needs a stable identity for the memoised item, but it depends
  // on roomId / onMessageDeleted. Use a ref so we don't bust the callback
  // identity on every parent render.
  const deleteCtxRef = useRef({ roomId, onMessageDeleted });
  deleteCtxRef.current = { roomId, onMessageDeleted };

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    const { roomId: currentRoomIdVal, onMessageDeleted: onDeleted } =
      deleteCtxRef.current;
    if (!currentRoomIdVal) return;
    const serverMessageId = message.serverId || message.id;
    if (!serverMessageId) return;

    const url = `/api/rooms/${encodeURIComponent(currentRoomIdVal)}/messages/${encodeURIComponent(serverMessageId)}`;

    try {
      const res = await abortableFetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      if (res.ok) {
        onDeleted?.(serverMessageId);
        return;
      }

      if (res.status === 404 || res.status === 410) {
        console.warn(
          `Delete message ${serverMessageId} returned ${res.status}; removing locally as orphan.`
        );
        onDeleted?.(serverMessageId);
        return;
      }

      const errorData = await res
        .json()
        .catch(() => ({ error: `HTTP error! status: ${res.status}` }));
      console.error("Failed to delete message", errorData);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error("Delete message request timed out", {
          roomId: currentRoomIdVal,
          serverMessageId,
        });
        return;
      }
      console.error("Error deleting message", err);
    }
  }, []);

  const handleStopSpeech = useCallback(() => {
    stop();
    setPlayingMessageId(null);
    setLocalHighlightSegment(null);
    localHighlightQueueRef.current = [];
    setSpeechLoadingId(null);
  }, [stop]);

  const handlePlaySpeech = useCallback(
    (message: ChatMessage, displayContent: string) => {
      stop();
      setLocalHighlightSegment(null);
      localHighlightQueueRef.current = [];
      setSpeechLoadingId(null);
      const text = displayContent.trim();
      if (!text) {
        setPlayingMessageId(null);
        setSpeechLoadingId(null);
        return;
      }
      const chunks: string[] = [];
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.length > 0) {
          chunks.push(trimmedLine);
        }
      }
      if (chunks.length === 0) {
        setPlayingMessageId(null);
        setSpeechLoadingId(null);
        return;
      }
      const messageKey =
        message.id || `${message.role}-${getMessageText(message).substring(0, 10)}`;
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
            setLocalHighlightSegment(localHighlightQueueRef.current[0]);
          } else {
            setLocalHighlightSegment(null);
            setPlayingMessageId(null);
            setSpeechLoadingId(null);
          }
        });
      });
    },
    [speak, stop]
  );

  const isSpeakingAny = !!isSpeaking || !!localTtsSpeaking;

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
      {messages.map((message, index) => {
        const messageText = getMessageText(message);
        const messageKey =
          message.id === "1" || message.id === "proactive-1"
            ? "greeting"
            : message.id || `${message.role}-${messageText.substring(0, 10)}`;
        const isInitialMessage = initialMessageIdsRef.current.has(messageKey);
        const isCopied = copiedMessageId === messageKey;
        const isPlaying = playingMessageId === messageKey;
        const isSpeechLoading = speechLoadingId === messageKey;
        // Streaming fast-path: only the very last assistant message while
        // `isLoading` is true. For that message we skip markdown tokenization
        // per delta to keep reconciliation cheap.
        const isStreaming =
          !!isLoading &&
          message.role === "assistant" &&
          index === messages.length - 1;
        // Pre-filter highlight segments so the memoized child only re-renders
        // when a highlight that actually belongs to THIS message changes.
        const itemHighlight =
          highlightSegment && highlightSegment.messageId === message.id
            ? highlightSegment
            : null;
        const itemLocalHighlight =
          localHighlightSegment &&
          localHighlightSegment.messageId === message.id
            ? localHighlightSegment
            : null;
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
            isCopied={isCopied}
            isPlaying={isPlaying}
            isSpeechLoading={isSpeechLoading}
            isStreaming={isStreaming}
            highlightSegment={itemHighlight}
            localHighlightSegment={itemLocalHighlight}
            isSpeakingAny={isSpeakingAny}
            speechEnabled={speechEnabled}
            isAdmin={isAdmin}
            onSendMessage={onSendMessage}
            onCopyMessage={copyMessage}
            onDeleteMessage={deleteMessage}
            onPlaySpeech={handlePlaySpeech}
            onStopSpeech={handleStopSpeech}
            setIsInteractingWithPreview={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
          />
        );
      })}
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

          const isRateLimitError =
            errorMessage === "Daily AI message limit reached." ||
            errorMessage === "Set a username to continue chatting with Ryo.";

          if (isRateLimitError) return null;

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
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden w-full h-full"
      resize="smooth"
      initial="instant"
    >
      <StickToBottom.Content className="flex flex-col gap-1 p-3 pt-12 pb-14">
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

      <ScrollToBottomButton />
    </StickToBottom>
  );
}
