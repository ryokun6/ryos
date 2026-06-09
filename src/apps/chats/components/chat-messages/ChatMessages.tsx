import { useEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { ChatMessagesContent } from "./ChatMessagesContent";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import type { ChatMessagesProps } from "./types";

// Self-mask of the scrim: solid under the floating islands, fading out lower so
// messages dissolve into the frosted top band rather than clipping at a hard
// edge. A CSS `mask` on the scroller itself does not clip the message bubbles
// (they are composited `motion.div`s that escape the mask), so we instead paint
// a frosted scrim above the messages and below the toolbar islands.
const SCRIM_MASK =
  "linear-gradient(to bottom, black 0px, black 30px, transparent 100%)";

// In Aqua Glass, frost + fade the top band of the message scroller once it is
// scrolled away from the top, so messages dissolve under the toolbar islands.
function TopScrollFade() {
  const { isAquaGlass } = useThemeFlags();
  const { scrollRef } = useStickToBottomContext();
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const scrim = scrimRef.current;
    if (!el || !scrim || !isAquaGlass) return;
    const update = () => {
      scrim.style.opacity = el.scrollTop > 4 ? "1" : "0";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [isAquaGlass, scrollRef]);

  if (!isAquaGlass) return null;
  return (
    <div
      ref={scrimRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 right-0 z-[5]"
      style={{
        height: 96,
        opacity: 0,
        transition: "opacity 150ms ease",
        backdropFilter: "blur(12px) saturate(160%)",
        WebkitBackdropFilter: "blur(12px) saturate(160%)",
        background:
          "linear-gradient(to bottom, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0))",
        maskImage: SCRIM_MASK,
        WebkitMaskImage: SCRIM_MASK,
      }}
    />
  );
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
