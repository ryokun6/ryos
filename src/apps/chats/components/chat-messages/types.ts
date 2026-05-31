import type { UIMessage as VercelMessage } from "@ai-sdk/react";
import type { ChatHighlightSegment } from "../../hooks/useChatSpeechSync";

export interface ChatMessage extends Omit<VercelMessage, "role"> {
  username?: string;
  role: VercelMessage["role"] | "human";
  isPending?: boolean;
  serverId?: string;
  metadata?: {
    createdAt?: Date;
    [key: string]: unknown;
  };
}

export interface ChatMessagesProps {
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
  highlightSegment?: ChatHighlightSegment | null;
  isSpeaking?: boolean;
  speakAssistantMessageManually: (
    messageId: string,
    fullSource: string,
    onAllDone?: () => void
  ) => void;
  stopSpeech: () => void;
  onSendMessage?: (username: string) => void;
  isLoadingGreeting?: boolean;
  typingUsers?: string[];
}

export interface ChatMessageItemProps {
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
  highlightSegment?: ChatHighlightSegment | null;
  isAdmin: boolean;
  roomId?: string;
  username?: string;
  onMessageDeleted?: (messageId: string) => void;
  onSendMessage?: (username: string) => void;
  onCopyMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  setPlayingMessageId: (id: string | null) => void;
  setSpeechLoadingId: (id: string | null) => void;
  speakAssistantMessageManually: (
    messageId: string,
    fullSource: string,
    onAllDone?: () => void
  ) => void;
  stopSpeech: () => void;
  playNote: () => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

export interface ChatMessagesContentProps {
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
  highlightSegment?: ChatHighlightSegment | null;
  isSpeaking?: boolean;
  speakAssistantMessageManually: (
    messageId: string,
    fullSource: string,
    onAllDone?: () => void
  ) => void;
  stopSpeech: () => void;
}
