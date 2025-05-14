import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Hand, AtSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useAppStore } from "@/stores/useAppStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { track } from "@vercel/analytics";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AI_MODELS } from "@/types/aiModels";

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

// Analytics event namespace for chat events
export const CHAT_ANALYTICS = {
  TEXT_MESSAGE: "chats:text",
  VOICE_MESSAGE: "chats:voice",
  NUDGE: "chats:nudge",
  STOP_GENERATION: "chats:stop",
};

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
}: ChatInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [lastTypingTime, setLastTypingTime] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioButtonRef = useRef<HTMLButtonElement>(null);
  const { playNote } = useChatSynth();
  const { play: playNudgeSound } = useSound(Sounds.MSN_NUDGE);
  const { typingSynthEnabled, debugMode, aiModel } = useAppStore();

  // Get the model display name for debug information
  const modelDisplayName = aiModel ? AI_MODELS[aiModel]?.name : null;

  // Check if user is typing @ryo
  const isTypingRyoMention =
    isInChatRoom && (input.startsWith("@ryo ") || input === "@ryo");

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
      setTranscriptionError("No transcription text received");
      return;
    }

    // Track voice message
    track(CHAT_ANALYTICS.VOICE_MESSAGE);

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
        <form
          onSubmit={(e) => {
            if (input.trim() !== "") {
              track(CHAT_ANALYTICS.TEXT_MESSAGE, {
                message: input,
              });
            }
            onSubmit(e);
          }}
          className="flex gap-1"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              layout
              className="flex-1 relative"
              transition={{ duration: 0.15 }}
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={handleInputChangeWithSound}
                placeholder={
                  isLoading
                    ? ""
                    : isRecording
                    ? "Recording..."
                    : isTranscribing
                    ? "Transcribing..."
                    : isFocused || isTouchDevice
                    ? "Type a message..."
                    : "Type or push 'space' to talk..."
                }
                className={`w-full border-1 border-gray-800 text-xs font-geneva-12 h-9 pr-16 backdrop-blur-lg bg-white/80 ${
                  isFocused ? "input--focused" : ""
                } ${isTypingRyoMention ? "border-blue-600 bg-blue-50" : ""}`}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                }}
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
                      Thinking
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
                            className="w-[22px] h-[22px] flex items-center justify-center"
                            disabled={isLoading}
                            aria-label="Send a Nudge"
                          >
                            <Hand className="h-4 w-4 -rotate-40" />
                          </button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send a Nudge</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isInChatRoom && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={handleMentionClick}
                            className="w-[22px] h-[22px] flex items-center justify-center"
                            disabled={isLoading}
                            aria-label="Mention Ryo"
                          >
                            <AtSign className="h-4 w-4" />
                          </button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Mention Ryo</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <AudioInputButton
                          ref={audioButtonRef}
                          onTranscriptionComplete={handleTranscriptionComplete}
                          onTranscriptionStart={handleTranscriptionStart}
                          onRecordingStateChange={handleRecordingStateChange}
                          isLoading={isTranscribing}
                          silenceThreshold={1200}
                          className="w-[22px] h-[22px] flex items-center justify-center"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Push to Talk</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </motion.div>
            {isLoading || isSpeechPlaying ? (
              <motion.div
                key="stop"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                layout
              >
                <Button
                  type="button"
                  onClick={() => {
                    track(CHAT_ANALYTICS.STOP_GENERATION);
                    onStop();
                  }}
                  className="bg-black hover:bg-black/80 text-white text-xs border-2 border-gray-800 w-9 h-9 p-0 flex items-center justify-center"
                >
                  <Square className="h-4 w-4" fill="currentColor" />
                </Button>
              </motion.div>
            ) : input.trim() !== "" ? (
              <motion.div
                key="send"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                layout
              >
                <Button
                  type="submit"
                  className="bg-black hover:bg-black/80 text-white text-xs border-2 border-gray-800 w-9 h-9 p-0 flex items-center justify-center"
                  disabled={isLoading}
                >
                  <ArrowUp className="h-6 w-6" />
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
                ? `Ryo will respond to this message${
                    debugMode && modelDisplayName
                      ? ` (${modelDisplayName})`
                      : ""
                  }`
                : `Using ${modelDisplayName}`}
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
      </motion.div>
    </AnimatePresence>
  );
}
