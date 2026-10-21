import { useEffect } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX } from "./composerClearance";
import { ChatMessagesContent } from "./ChatMessagesContent";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import type { ChatMessagesProps } from "./types";

// In Aqua Glass, fade the very top of the scroller once it's scrolled away
// from the top so messages dissolve under the floating toolbar islands.
const TOP_FADE_MASK = "linear-gradient(to bottom, transparent 0px, black 52px)";

function TopScrollFade() {
  const { isAquaGlass } = useThemeFlags();
  const { scrollRef } = useStickToBottomContext();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const setMask = (mask: string) => {
      el.style.maskImage = mask;
      el.style.setProperty("-webkit-mask-image", mask);
    };
    if (!isAquaGlass) {
      setMask("");
      return;
    }
    const update = () => {
      setMask(el.scrollTop > 4 ? TOP_FADE_MASK : "");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      el.removeEventListener("scroll", update);
      setMask("");
    };
  }, [isAquaGlass, scrollRef]);

  return null;
}

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
  bottomClearance = CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX,
  onSendMessage,
  isLoadingGreeting,
  typingUsers,
  highlightSegment,
  isSpeaking,
  speakAssistantMessageManually,
  stopSpeech,
}: ChatMessagesProps) {
  return (
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden size-full"
      // Instant resize: restored/hydrated history must land at the bottom
      // without a spring scroll. New messages still animate via the explicit
      // scrollToBottom("smooth") trigger in ChatMessagesContent.
      resize="instant"
      initial="instant"
    >
      <StickToBottom.Content
        className="flex flex-col p-3 pt-12"
        style={{ paddingBottom: 0 }}
      >
        {/* Gap lives on the message stack so the clearance spacer does not
            pick up an extra flex gap and change the no-label layout. */}
        <div className="flex flex-col gap-1">
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
            highlightSegment={highlightSegment}
            isSpeaking={isSpeaking}
            speakAssistantMessageManually={speakAssistantMessageManually}
            stopSpeech={stopSpeech}
          />
        </div>
        {/* In-flow spacer (not padding) so stick-to-bottom's content-box
            ResizeObserver sees label / safe-area growth and keeps the tail
            pinned when the user is already at the bottom. */}
        <div
          aria-hidden
          data-chat-composer-clearance=""
          className="shrink-0"
          style={{ height: bottomClearance }}
        />
      </StickToBottom.Content>

      <TopScrollFade />
      <ScrollToBottomButton bottomClearance={bottomClearance} />
    </StickToBottom>
  );
}
