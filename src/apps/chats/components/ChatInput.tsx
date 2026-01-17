import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Hand, At, Microphone, ImageSquare, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useAppStoreShallow, useAudioSettingsStoreShallow, useDisplaySettingsStoreShallow } from "@/stores/helpers";
import { useSound, Sounds } from "@/hooks/useSound";
import { track } from "@vercel/analytics";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AI_MODELS } from "@/types/aiModels";
import { useThemeStore } from "@/stores/useThemeStore";
import { CHAT_ANALYTICS } from "@/utils/analytics";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useTranslation } from "react-i18next";
import { preprocessImage } from "@/utils/imagePreprocessing";

// Number of frequency bands for the full-width waveform
const WAVEFORM_BANDS = 48;

// Animated ellipsis component (copied from TerminalAppComponent)
function AnimatedEllipsis() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const patterns = [".", "..", "...", "..", ".", ".", "..", "..."];
    let index = 0;

    const interval = setInterval(() => {
      setDots(patterns[index]);
      index = (index + 1) % patterns.length;
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return <span>{dots}</span>;
}

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isForeground?: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  onDirectMessageSubmit?: (message: string) => void;
  onNudge?: () => void;
  previousMessages?: string[];
  /**
   * Whether to display the "nudge" (👋) button. Defaults to true so that the
   * button is shown in the regular Ryo chat, and can be disabled for chat-room
   * contexts where nudging is not available.
   */
  showNudgeButton?: boolean;
  isInChatRoom?: boolean;
  /** Whether TTS speech is currently playing */
  isSpeechPlaying?: boolean;
  /** Whether to show the @mention button in chat rooms */
  showMentionButton?: boolean;
  rateLimitError?: {
    isAuthenticated: boolean;
    count: number;
    limit: number;
    message: string;
  } | null;
  needsUsername?: boolean;
  isOffline?: boolean;
  /** Called when manual stop is triggered (to cancel keep talking mode) */
  onManualStop?: () => void;
  /** Currently selected image data (base64) */
  selectedImage?: string | null;
  /** Callback when an image is selected or cleared */
  onImageChange?: (imageData: string | null) => void;
}

export function ChatInput({
  input,
  isLoading,
  isForeground = false,
  onInputChange,
  onSubmit,
  onStop,
  onDirectMessageSubmit,
  onNudge,
  previousMessages = [],
  showNudgeButton = true,
  isInChatRoom = false,
  isSpeechPlaying = false,
  showMentionButton = true,
  rateLimitError,
  needsUsername = false,
  isOffline = false,
  onManualStop,
  selectedImage,
  onImageChange,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [lastTypingTime, setLastTypingTime] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [waveformFrequencies, setWaveformFrequencies] = useState<number[]>(
    Array(WAVEFORM_BANDS).fill(0)
  );
  const [waveformIsSilent, setWaveformIsSilent] = useState(true);
  // Track if last submitted message was via voice for keep talking mode
  const [isInKeepTalkingMode, setIsInKeepTalkingMode] = useState(false);
  // Track previous loading/speaking states for detecting transitions
  const prevIsLoadingRef = useRef(isLoading);
  const prevIsSpeechPlayingRef = useRef(isSpeechPlaying);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioButtonRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { playNote } = useChatSynth();
  const { play: playNudgeSound } = useSound(Sounds.MSN_NUDGE);
  // Audio settings
  const { typingSynthEnabled, keepTalkingEnabled } = useAudioSettingsStoreShallow(
    (s) => ({
      typingSynthEnabled: s.typingSynthEnabled,
      keepTalkingEnabled: s.keepTalkingEnabled,
    })
  );
  // Display settings
  const debugMode = useDisplaySettingsStoreShallow((s) => s.debugMode);
  // AI model from app store
  const aiModel = useAppStoreShallow((s) => s.aiModel);
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // Get the model display name for debug information
  const modelDisplayName = aiModel ? AI_MODELS[aiModel]?.name : null;

  // Check if user is typing @ryo
  const isTypingRyoMention =
    showMentionButton &&
    isInChatRoom &&
    (input.startsWith("@ryo ") || input === "@ryo");

  useEffect(() => {
    // Check if device has touch capability
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (!isForeground) return; // Only register hotkeys when window is foreground
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && previousMessages.length > 0) {
        e.preventDefault();
        const nextIndex = historyIndex + 1;
        if (nextIndex < previousMessages.length) {
          setHistoryIndex(nextIndex);
          const event = {
            target: { value: previousMessages[nextIndex] },
          } as React.ChangeEvent<HTMLInputElement>;
          onInputChange(event);
        }
      } else if (e.key === "ArrowDown" && historyIndex > -1) {
        e.preventDefault();
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const event = {
          target: {
            value: nextIndex === -1 ? "" : previousMessages[nextIndex],
          },
        } as React.ChangeEvent<HTMLInputElement>;
        onInputChange(event);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForeground, historyIndex, previousMessages, onInputChange]);

  // Reset history index when input changes manually
  useEffect(() => {
    setHistoryIndex(-1);
  }, [input]);

  // Keep Talking Mode: Auto-start recording after AI response completes
  useEffect(() => {
    // "Busy" means AI is still generating (loading) or TTS is still playing
    const wasBusy = prevIsLoadingRef.current || prevIsSpeechPlayingRef.current;
    const isNowDone = !isLoading && !isSpeechPlaying;
    
    // Update refs for next render
    prevIsLoadingRef.current = isLoading;
    prevIsSpeechPlayingRef.current = isSpeechPlaying;
    
    // If not in keep talking mode or keep talking is disabled, do nothing
    if (!isInKeepTalkingMode || !keepTalkingEnabled) return;
    
    // Trigger auto-record when transitioning from "busy" to "done"
    // This ensures we wait for BOTH loading AND speech to complete
    if (wasBusy && isNowDone) {
      // Auto-start recording after a small delay
      setTimeout(() => {
        if (!isRecording && !isTranscribing) {
          audioButtonRef.current?.click();
        }
      }, 300);
    }
  }, [isLoading, isSpeechPlaying, isInKeepTalkingMode, keepTalkingEnabled, isRecording, isTranscribing]);

  const handleInputChangeWithSound = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onInputChange(e);
    setHistoryIndex(-1); // Reset history index when typing

    // Only play sound if typing synth is enabled and enough time has passed
    const now = Date.now();
    if (typingSynthEnabled && now - lastTypingTime > 50) {
      playNote();
      setLastTypingTime(now);
    }
  };

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    setIsRecording(false);
    setTranscriptionError(null);

    if (!text) {
      setTranscriptionError(t("apps.chats.status.noTranscriptionText"));
      // Exit keep talking mode on empty transcription
      setIsInKeepTalkingMode(false);
      return;
    }

    // Track voice message
    track(CHAT_ANALYTICS.VOICE_MESSAGE);

    // Enter keep talking mode if enabled (for non-chat-room contexts)
    if (keepTalkingEnabled && !isInChatRoom) {
      setIsInKeepTalkingMode(true);
    }

    // Submit the transcribed text directly if the function is available
    if (onDirectMessageSubmit) {
      onDirectMessageSubmit(text.trim());
    } else {
      // Fallback to form submission
      const transcriptionEvent = {
        target: { value: text.trim() },
      } as React.ChangeEvent<HTMLInputElement>;
      onInputChange(transcriptionEvent);

      const submitEvent = new Event(
        "submit"
      ) as unknown as React.FormEvent<HTMLFormElement>;
      onSubmit(submitEvent);

      const clearEvent = {
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>;
      onInputChange(clearEvent);
    }
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  const handleRecordingStateChange = (recording: boolean) => {
    setIsRecording(recording);
  };

  const handleFrequenciesChange = useCallback(
    (frequencies: number[], isSilent: boolean) => {
      setWaveformFrequencies(frequencies);
      setWaveformIsSilent(isSilent);
    },
    []
  );

  // Handle stop recording - trigger the audio button click
  const handleStopRecording = () => {
    audioButtonRef.current?.click();
  };

  const handleNudgeClick = () => {
    track(CHAT_ANALYTICS.NUDGE);
    playNudgeSound();
    onNudge?.();
  };

  const handleMentionClick = () => {
    let newValue = input;

    if (input.startsWith("@ryo ")) {
      // Already properly mentioned, just focus
      inputRef.current?.focus();
      // Position cursor at the end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(
            inputRef.current.value.length,
            inputRef.current.value.length
          );
        }
      }, 0);
      return;
    } else if (input.startsWith("@ryo")) {
      // Has @ryo but missing space
      newValue = input.replace("@ryo", "@ryo ");
    } else {
      // Add @ryo at the beginning
      newValue = `@ryo ${input}`.trim() + (input.endsWith(" ") ? "" : " ");
    }

    const event = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLInputElement>;
    onInputChange(event);

    // Focus the input field after adding the mention
    inputRef.current?.focus();

    // Position cursor at the end of the input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(
          inputRef.current.value.length,
          inputRef.current.value.length
        );
      }
    }, 0);
  };

  // Handle image selection
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      console.error("Invalid file type - must be an image");
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      console.error("Image too large - max 10MB");
      return;
    }

    // Reset the input so the same file can be selected again
    e.target.value = "";

    setIsProcessingImage(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
      });
      reader.readAsDataURL(file);
      const rawBase64 = await base64Promise;

      // Preprocess the image (resize and compress)
      const processedImage = await preprocessImage(rawBase64, {
        maxDimension: 1280,
        quality: 0.85,
      });

      onImageChange?.(processedImage);
    } catch (error) {
      console.error("Failed to process image:", error);
    } finally {
      setIsProcessingImage(false);
    }
  }, [onImageChange]);

  // Handle image clear
  const handleImageClear = useCallback(() => {
    onImageChange?.(null);
  }, [onImageChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        isForeground &&
        !isFocused &&
        !isTranscribing
      ) {
        e.preventDefault();
        audioButtonRef.current?.click();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && isForeground && !isFocused && isTranscribing) {
        e.preventDefault();
        audioButtonRef.current?.click();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isForeground, isFocused, isTranscribing]);

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full"
      >
        {/* Hidden file input for image selection */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
          aria-hidden="true"
        />

        {/* Image preview thumbnail */}
        <AnimatePresence>
          {selectedImage && !isInChatRoom && (
            <motion.div
              key="image-preview"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-visible"
            >
              <div className="relative inline-block">
                {/* Container with aqua bubble styling for macOS */}
                <div
                  className={`relative overflow-hidden ${
                    isMacTheme 
                      ? "chat-bubble macosx-link-preview rounded-[16px] bg-gray-100" 
                      : isXpTheme 
                      ? "rounded-none border border-[#7f9db9] bg-white" 
                      : "rounded-md border border-gray-200 bg-white"
                  }`}
                >
                  {/* Full bleed image for macOS */}
                  <div
                    className={`relative overflow-hidden ${
                      isMacTheme ? "-mx-3 -mt-[6px] -mb-[6px] rounded-[14px]" : ""
                    }`}
                  >
                    <img
                      src={selectedImage}
                      alt={t("apps.chats.ariaLabels.selectedImage") || "Selected image"}
                      className="h-16 w-auto object-cover block"
                      style={{ maxWidth: "120px" }}
                    />
                  </div>
                </div>
                {/* X button - positioned at top right corner */}
                <button
                  type="button"
                  onClick={handleImageClear}
                  className={`absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center z-20 ${
                    isMacTheme 
                      ? "rounded-full overflow-hidden" 
                      : "rounded-sm bg-black/40 backdrop-blur-sm hover:bg-black/60"
                  } transition-colors`}
                  style={
                    isMacTheme
                      ? {
                          background: "linear-gradient(rgba(160, 160, 160, 0.9), rgba(255, 255, 255, 0.9))",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2), 0 0.5px 0.5px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(0, 0, 0, 0.2), inset 0 1px 2px 0.5px rgba(187, 187, 187, 0.8)",
                        }
                      : undefined
                  }
                  aria-label={t("apps.chats.ariaLabels.clearImage") || "Clear image"}
                >
                  {/* Top shine for macOS */}
                  {isMacTheme && (
                    <div
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                      style={{
                        top: "1px",
                        height: "35%",
                        width: "50%",
                        borderRadius: "9999px",
                        background: "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.2))",
                        filter: "blur(0.3px)",
                        zIndex: 2,
                      }}
                    />
                  )}
                  <X className={`h-2.5 w-2.5 relative z-[3] ${isMacTheme ? "text-neutral-500" : "text-white"}`} weight="bold" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            if (isOffline) {
              e.preventDefault();
              checkOfflineAndShowError(t("apps.chats.status.chatRequiresInternet"));
              return;
            }
            if (input.trim() !== "") {
              track(CHAT_ANALYTICS.TEXT_MESSAGE, {
                message: input,
              });
            }
            onSubmit(e);
          }}
          className={`flex ${isMacTheme ? "gap-2" : "gap-1"}`}
        >
          {/* Hidden AudioInputButton - always mounted to manage recording state */}
          <div className="sr-only">
            <AudioInputButton
              ref={audioButtonRef}
              onTranscriptionComplete={handleTranscriptionComplete}
              onTranscriptionStart={handleTranscriptionStart}
              onRecordingStateChange={handleRecordingStateChange}
              onFrequenciesChange={handleFrequenciesChange}
              isLoading={isTranscribing}
              silenceThreshold={1200}
              externalWaveform={true}
              frequencyBands={WAVEFORM_BANDS}
            />
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {isRecording ? (
              // Recording mode: Full-width waveform UI
              <motion.div
                key="recording-ui"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={`flex-1 relative h-9 flex items-center px-3 gap-2 ${
                  isMacTheme ? "rounded-full" : isXpTheme ? "rounded-none" : "rounded-md"
                }`}
                style={
                  isMacTheme
                    ? {
                        border: "1px solid rgba(0, 0, 0, 0.2)",
                        backgroundColor: "rgba(255, 255, 255, 1)",
                        boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
                      }
                    : isXpTheme
                    ? {
                        border: "1px solid #7f9db9",
                        backgroundColor: "white",
                      }
                    : {
                        border: "1px solid #000",
                        backgroundColor: "rgba(255, 255, 255, 0.8)",
                      }
                }
              >
                {/* Recording indicator */}
                <div className="flex items-center shrink-0">
                  <span className="text-muted-foreground text-xs font-geneva-12">
                    {t("apps.chats.status.listening")}
                  </span>
                </div>
                {/* Waveform visualization */}
                <div className="flex-1 flex items-center h-full overflow-hidden">
                  <div
                    className="flex gap-[2px] items-center justify-between w-full"
                    style={{ opacity: waveformIsSilent ? 0.4 : 1 }}
                  >
                    {waveformFrequencies.map((freq, index) => (
                      <motion.div
                        key={index}
                        className="flex-1 max-w-[2px] rounded-full origin-center bg-neutral-300"
                        initial={{ scaleY: 0.3 }}
                        animate={{
                          scaleY: waveformIsSilent
                            ? 0.3
                            : Math.max(0.3, Math.min(freq * 2, 1)),
                        }}
                        style={{
                          height: 20,
                        }}
                        transition={{
                          type: "spring",
                          bounce: 0.5,
                          duration: 0.12,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              // Normal input mode
              <motion.div
                key="input-ui"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex-1 relative"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChangeWithSound}
                  placeholder={
                    isLoading
                      ? ""
                      : isTranscribing
                      ? t("apps.chats.status.transcribing")
                      : needsUsername && !isInChatRoom
                      ? t("apps.chats.status.createAccountToContinue")
                      : isFocused || isTouchDevice
                      ? t("apps.chats.status.typeMessage")
                      : t("apps.chats.status.typeOrPushSpace")
                  }
                  className={`w-full border-1 border-gray-800 text-xs font-geneva-12 h-9 ${
                    isMacTheme ? "pl-3 pr-[88px] rounded-full" : "pl-2 pr-[88px]"
                  } backdrop-blur-lg bg-white/80 ${
                    isFocused ? "input--focused" : ""
                  } ${isTypingRyoMention ? "border-blue-600 bg-blue-50" : ""} ${
                    needsUsername && !isInChatRoom
                      ? "border-orange-600 bg-orange-50"
                      : ""
                  }`}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                  }}
                  disabled={(needsUsername && !isInChatRoom) || isOffline}
                />
                <AnimatePresence>
                  {isLoading && input.trim() === "" && (
                    <motion.div
                      key="thinking-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center pl-3"
                    >
                      <span className="text-gray-500 opacity-70 shimmer-gray text-[13px] font-geneva-12">
                        {t("apps.chats.status.thinking")}
                        <AnimatedEllipsis />
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {showNudgeButton && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={handleNudgeClick}
                              className={`w-[22px] h-[22px] flex items-center justify-center ${
                                isMacTheme
                                  ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                                  : ""
                              }`}
                              disabled={isLoading}
                              aria-label={t("apps.chats.ariaLabels.sendNudge")}
                            >
                              <Hand className="h-4 w-4 -rotate-40" weight="bold" />
                            </button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("apps.chats.ariaLabels.sendNudge")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {isInChatRoom && showMentionButton && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={handleMentionClick}
                              className={`w-[22px] h-[22px] flex items-center justify-center ${
                                isMacTheme
                                  ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                                  : ""
                              }`}
                              disabled={isLoading}
                              aria-label={t("apps.chats.ariaLabels.mentionRyo")}
                            >
                              <At className="h-4 w-4" weight="bold" />
                            </button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("apps.chats.ariaLabels.mentionRyo")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isInChatRoom && onImageChange && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className={`w-[22px] h-[22px] flex items-center justify-center ${
                              isMacTheme
                                ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                                : ""
                            } ${isProcessingImage ? "animate-pulse" : ""}`}
                            disabled={isLoading || isProcessingImage}
                            aria-label={t("apps.chats.ariaLabels.attachImage") || "Attach image"}
                          >
                            <ImageSquare className="h-4 w-4" weight="bold" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isProcessingImage ? (t("apps.chats.status.processingImage") || "Processing image...") : (t("apps.chats.ariaLabels.attachImage") || "Attach image")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => audioButtonRef.current?.click()}
                          className={`w-[22px] h-[22px] flex items-center justify-center ${
                            isMacTheme
                              ? "text-neutral-400 hover:text-neutral-800 transition-colors"
                              : ""
                          }`}
                          disabled={isTranscribing}
                          aria-label={t("apps.chats.ariaLabels.pushToTalk")}
                        >
                          <Microphone className="h-4 w-4" weight="bold" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("apps.chats.ariaLabels.pushToTalk")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </motion.div>
            )}
            {isLoading || isSpeechPlaying || isRecording ? (
              <motion.div
                key="stop"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  type="button"
                  onClick={() => {
                    // Exit keep talking mode on manual stop
                    setIsInKeepTalkingMode(false);
                    if (isRecording) {
                      handleStopRecording();
                    } else {
                      track(CHAT_ANALYTICS.STOP_GENERATION);
                      onStop();
                      onManualStop?.();
                    }
                  }}
                  className={`text-xs w-9 h-9 p-0 flex items-center justify-center ${
                    isMacTheme ? "rounded-full" : "rounded-none"
                  } ${
                    isMacTheme
                      ? "relative overflow-hidden transition-transform hover:scale-105"
                      : isXpTheme
                      ? "text-black"
                      : "bg-black hover:bg-black/80 text-white border-2 border-gray-800"
                  }`}
                  style={
                    isMacTheme
                      ? {
                          background:
                            "linear-gradient(rgba(254, 205, 211, 0.9), rgba(252, 165, 165, 0.9))",
                          boxShadow:
                            "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(254, 205, 211, 0.5)",
                          backdropFilter: "blur(2px)",
                        }
                      : {}
                  }
                >
                  {isMacTheme && (
                    <>
                      {/* Top shine */}
                      <div
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                        style={{
                          top: "2px",
                          height: "30%",
                          width: "calc(100% - 18px)",
                          borderRadius: "8px 8px 4px 4px",
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
                          borderRadius: "4px 4px 100% 100%",
                          background:
                            "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                          filter: "blur(0.3px)",
                          zIndex: 1,
                        }}
                      />
                    </>
                  )}
                  <Square
                    className={`h-4 w-4 ${
                      isMacTheme
                        ? "text-black/70 relative z-10"
                        : isXpTheme
                        ? "text-black"
                        : ""
                    }`}
                    weight="fill"
                  />
                </Button>
              </motion.div>
            ) : input.trim() !== "" || selectedImage ? (
              <motion.div
                key="send"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Button
                  type="submit"
                  className={`text-xs w-9 h-9 p-0 flex items-center justify-center ${
                    isMacTheme ? "rounded-full" : "rounded-none"
                  } ${
                    isMacTheme
                      ? "relative overflow-hidden transition-transform hover:scale-105"
                      : isXpTheme
                      ? "text-black"
                      : "bg-black hover:bg-black/80 text-white border-2 border-gray-800"
                  }`}
                  style={
                    isMacTheme
                      ? {
                          background:
                            "linear-gradient(rgba(217, 249, 157, 0.9), rgba(190, 227, 120, 0.9))",
                          boxShadow:
                            "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px rgba(217, 249, 157, 0.5)",
                          backdropFilter: "blur(2px)",
                        }
                      : {}
                  }
                  disabled={isLoading || isOffline}
                >
                  {isMacTheme && (
                    <>
                      {/* Top shine */}
                      <div
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                        style={{
                          top: "2px",
                          height: "30%",
                          width: "calc(100% - 16px)",
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
                          borderRadius: "4px 4px 100% 100%",
                          background:
                            "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                          filter: "blur(0.3px)",
                          zIndex: 1,
                        }}
                      />
                    </>
                  )}
                  <ArrowUp
                    className={`h-4 w-4 ${
                      isMacTheme
                        ? "text-black/70 relative z-10"
                        : isXpTheme
                        ? "text-black"
                        : ""
                    }`}
                    weight="bold"
                  />
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </form>
        <AnimatePresence>
          {(isTypingRyoMention ||
            (!isInChatRoom && debugMode && modelDisplayName)) && (
            <motion.div
              key="model-info"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="mt-2 px-1 text-xs text-neutral-700 font-geneva-12"
            >
              {isTypingRyoMention
                ? t("apps.chats.status.ryoWillRespond") + (debugMode && modelDisplayName ? ` (${modelDisplayName})` : "")
                : t("apps.chats.status.usingModel", { model: modelDisplayName })}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {transcriptionError && (
            <motion.div
              key="transcription-error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="mt-1 text-red-600 text-xs font-geneva-12"
            >
              {transcriptionError}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {rateLimitError && !isInChatRoom && (
            <motion.div
              key="rate-limit-error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="mt-1 text-red-600 text-xs font-geneva-12"
            >
              {rateLimitError.message}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
