import { useEffect } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { ChatMessagesContent } from "./ChatMessagesContent";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import type { ChatMessagesProps } from "./types";

// In Aqua Glass, fade the very top of the scroller once it's scrolled away
// from the top so messages dissolve under the floating toolbar islands.
// Keep the band under the floating islands fully transparent, then ramp in
// over a longer, clearly-visible distance so messages dissolve smoothly below
// the islands rather than clipping at a hard edge.
const TOP_FADE_MASK =
  "linear-gradient(to bottom, transparent 0px, transparent 36px, black 104px)";

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
          onSendMessage={onSendMessage}
          isLoadingGreeting={isLoadingGreeting}
          typingUsers={typingUsers}
          highlightSegment={highlightSegment}
          isSpeaking={isSpeaking}
          speakAssistantMessageManually={speakAssistantMessageManually}
          stopSpeech={stopSpeech}
        />
      </StickToBottom.Content>

      <TopScrollFade />
      <ScrollToBottomButton />
    </StickToBottom>
  );
}
