export interface ChatInputProps {
  isLoading: boolean;
  /** 0–100 while an attached image is uploading to the server; null otherwise */
  imageUploadProgress?: number | null;
  isForeground?: boolean;
  onSubmitMessage: (
    message: string,
    imageData: string | null
  ) => boolean | Promise<boolean>;
  onStop: () => void;
  onDirectMessageSubmit?: (message: string) => void;
  onNudge?: () => void;
  previousMessages?: string[];
  showNudgeButton?: boolean;
  isInChatRoom?: boolean;
  isSpeechPlaying?: boolean;
  rateLimitError?: {
    isAuthenticated: boolean;
    count: number;
    limit: number;
    message: string;
  } | null;
  needsUsername?: boolean;
  isOffline?: boolean;
  onManualStop?: () => void;
  onTyping?: () => void;
  prefillMessage?: string | null;
  resetTrigger?: number;
}
