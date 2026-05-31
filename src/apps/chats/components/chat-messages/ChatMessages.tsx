import { StickToBottom } from "use-stick-to-bottom";
import { ChatMessagesContent } from "./ChatMessagesContent";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import type { ChatMessagesProps } from "./types";

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

      <ScrollToBottomButton />
    </StickToBottom>
  );
}
