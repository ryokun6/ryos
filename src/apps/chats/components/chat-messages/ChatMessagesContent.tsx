import { ChatCircle, WarningCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { abortableFetch } from "@/utils/abortableFetch";
import { TypingDots } from "../TypingBubble";
import { ChatMessageItem } from "./chat-message-item/ChatMessageItem";
import { getChatMessageStyle } from "./streamdown";
import type { ChatMessage, ChatMessagesContentProps } from "./types";
import { getErrorMessage, getMessageKey, getMessageText } from "./utils";

export function ChatMessagesContent({
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
  highlightSegment,
  isSpeaking: sharedTtsSpeaking,
  speakAssistantMessageManually,
  stopSpeech,
}: ChatMessagesContentProps) {
  const { t } = useTranslation();
  const { playNote } = useChatSynth();
  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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

  // Clear loading indicator when TTS actually starts playing. We subscribe to
  // the shared queue's speaking state (the same one driving streaming
  // highlights) so manual playback and streaming playback both clear the
  // spinner consistently.
  useEffect(() => {
    if (sharedTtsSpeaking && speechLoadingId) {
      setSpeechLoadingId(null);
    }
  }, [sharedTtsSpeaking, speechLoadingId]);

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
          className="flex items-center gap-2 text-neutral-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
        >
          <ChatCircle className="size-3" weight="bold" />
          <span>{t("apps.chats.status.startNewConversation")}</span>
          {onClear && (
            <Button
              size="sm"
              variant="link"
              onClick={onClear}
              className="m-0 p-0 text-[16px] h-0 text-neutral-500 hover:text-neutral-700"
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
            highlightSegment={highlightSegment}
            isAdmin={isAdmin}
            roomId={roomId}
            username={username}
            onMessageDeleted={onMessageDeleted}
            onSendMessage={onSendMessage}
            onCopyMessage={copyMessage}
            onDeleteMessage={deleteMessage}
            setPlayingMessageId={setPlayingMessageId}
            setSpeechLoadingId={setSpeechLoadingId}
            speakAssistantMessageManually={speakAssistantMessageManually}
            stopSpeech={stopSpeech}
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
                className="flex items-center gap-2 text-neutral-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
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
