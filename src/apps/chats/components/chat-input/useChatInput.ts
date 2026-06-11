import { useState, useRef, useEffect, useCallback, useReducer } from "react";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useAudioSettingsStoreShallow } from "@/stores/useAudioSettingsStore";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { CHAT_ANALYTICS, track } from "@/utils/analytics";
import { AI_MODELS } from "@/types/aiModels";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";
import { preprocessImage } from "@/utils/imagePreprocessing";
import { WAVEFORM_BANDS } from "./constants";
import {
  composerInitialState,
  composerReducer,
} from "./composerState";
import { focusIsInOtherTextField } from "./utils";
import type { ChatInputProps } from "./types";

export function useChatInput({
  isLoading,
  isForeground = false,
  onSubmitMessage,
  onStop,
  onDirectMessageSubmit,
  onNudge,
  previousMessages = [],
  showNudgeButton = true,
  isInChatRoom = false,
  isSpeechPlaying = false,
  rateLimitError,
  needsUsername = false,
  isOffline = false,
  onManualStop,
  onTyping,
  prefillMessage,
  resetTrigger = 0,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [composerState, dispatchComposer] = useReducer(
    composerReducer,
    composerInitialState
  );
  const { input, historyIndex, selectedImage } = composerState;
  const setInputAndResetHistory = useCallback((value: string) => {
    dispatchComposer({ type: "setInputAndResetHistory", value });
  }, []);
  const setSelectedImage = useCallback((value: string | null) => {
    dispatchComposer({ type: "setSelectedImage", value });
  }, []);
  const [isFocused, setIsFocused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [lastTypingTime, setLastTypingTime] = useState(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [waveformFrequencies, setWaveformFrequencies] = useState<number[]>(
    Array(WAVEFORM_BANDS).fill(0)
  );
  const [waveformIsSilent, setWaveformIsSilent] = useState(true);
  const [isInKeepTalkingMode, setIsInKeepTalkingMode] = useState(false);
  const prevIsLoadingRef = useRef(isLoading);
  const prevIsSpeechPlayingRef = useRef(isSpeechPlaying);
  const didMountRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioButtonRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { playNote } = useChatSynth();
  const { play: playNudgeSound } = useSound(Sounds.MSN_NUDGE);
  const { typingSynthEnabled, keepTalkingEnabled } =
    useAudioSettingsStoreShallow((s) => ({
      typingSynthEnabled: s.typingSynthEnabled,
      keepTalkingEnabled: s.keepTalkingEnabled,
    }));
  const debugMode = useDisplaySettingsStoreShallow((s) => s.debugMode);
  const aiModel = useAppStoreShallow((s) => s.aiModel);
  const { isMacOSTheme: isMacTheme, isWindowsTheme: isXpTheme } =
    useThemeFlags();

  const modelDisplayName = aiModel ? AI_MODELS[aiModel]?.name : null;

  const isTypingRyoMention =
    isInChatRoom && (input.startsWith("@ryo ") || input === "@ryo");

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (!isForeground) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && previousMessages.length > 0) {
        e.preventDefault();
        const nextIndex = historyIndex + 1;
        if (nextIndex < previousMessages.length) {
          dispatchComposer({
            type: "setHistoryNavigation",
            value: { index: nextIndex, input: previousMessages[nextIndex] },
          });
        }
      } else if (e.key === "ArrowDown" && historyIndex > -1) {
        e.preventDefault();
        const nextIndex = historyIndex - 1;
        dispatchComposer({
          type: "setHistoryNavigation",
          value: {
            index: nextIndex,
            input: nextIndex === -1 ? "" : previousMessages[nextIndex],
          },
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForeground, historyIndex, previousMessages]);

  useEffect(() => {
    if (prefillMessage) {
      setInputAndResetHistory(prefillMessage);
    }
  }, [prefillMessage, setInputAndResetHistory]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    dispatchComposer({ type: "clearComposer" });
  }, [resetTrigger]);

  useEffect(() => {
    const wasBusy = prevIsLoadingRef.current || prevIsSpeechPlayingRef.current;
    const isNowDone = !isLoading && !isSpeechPlaying;

    prevIsLoadingRef.current = isLoading;
    prevIsSpeechPlayingRef.current = isSpeechPlaying;

    if (!isInKeepTalkingMode || !keepTalkingEnabled) return;

    if (wasBusy && isNowDone) {
      const timeoutId = setTimeout(() => {
        if (!isRecording && !isTranscribing) {
          audioButtonRef.current?.click();
        }
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [
    isLoading,
    isSpeechPlaying,
    isInKeepTalkingMode,
    keepTalkingEnabled,
    isRecording,
    isTranscribing,
  ]);

  const handleInputChangeWithSound = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    dispatchComposer({ type: "setInputAndResetHistory", value: e.target.value });

    const now = Date.now();
    if (typingSynthEnabled && now - lastTypingTime > 50) {
      playNote();
      setLastTypingTime(now);
    }

    if (e.target.value.trim()) {
      onTyping?.();
    }
  };

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    setIsRecording(false);
    setTranscriptionError(null);

    if (!text) {
      setTranscriptionError(t("apps.chats.status.noTranscriptionText"));
      setIsInKeepTalkingMode(false);
      return;
    }

    track(CHAT_ANALYTICS.VOICE_MESSAGE);

    if (keepTalkingEnabled && !isInChatRoom) {
      setIsInKeepTalkingMode(true);
    }

    if (onDirectMessageSubmit) {
      onDirectMessageSubmit(text.trim());
    } else {
      void Promise.resolve(onSubmitMessage(text.trim(), null)).then(
        (didSubmit) => {
          if (didSubmit) setInputAndResetHistory("");
        }
      );
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
      inputRef.current?.focus();
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
      newValue = input.replace("@ryo", "@ryo ");
    } else {
      newValue = `@ryo ${input}`.trim() + (input.endsWith(" ") ? "" : " ");
    }

    setInputAndResetHistory(newValue);
    inputRef.current?.focus();

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(
          inputRef.current.value.length,
          inputRef.current.value.length
        );
      }
    }, 0);
  };

  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        console.error("Invalid file type - must be an image");
        return;
      }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error("Image too large - max 10MB");
        return;
      }

      e.target.value = "";
      setIsProcessingImage(true);

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
        });
        reader.readAsDataURL(file);
        const rawBase64 = await base64Promise;

        const processedImage = await preprocessImage(rawBase64, {
          maxDimension: 1280,
          quality: 0.85,
        });

        setSelectedImage(processedImage);
      } catch (error) {
        console.error("Failed to process image:", error);
      } finally {
        setIsProcessingImage(false);
      }
    },
    [setSelectedImage]
  );

  const handleImageClear = useCallback(() => {
    setSelectedImage(null);
  }, [setSelectedImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        isForeground &&
        !isFocused &&
        !focusIsInOtherTextField(inputRef.current) &&
        !isTranscribing
      ) {
        e.preventDefault();
        audioButtonRef.current?.click();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        isForeground &&
        !isFocused &&
        !focusIsInOtherTextField(inputRef.current) &&
        isTranscribing
      ) {
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

  const waveformBars = waveformFrequencies.map((freq, position) => ({
    freq,
    barKey: `wave-${position + 1}`,
  }));

  const handleStopClick = () => {
    setIsInKeepTalkingMode(false);
    if (isRecording) {
      handleStopRecording();
    } else {
      track(CHAT_ANALYTICS.STOP_GENERATION);
      onStop();
      onManualStop?.();
    }
  };

  return {
    t,
    input,
    selectedImage,
    dispatchComposer,
    isFocused,
    setIsFocused,
    isTranscribing,
    isRecording,
    transcriptionError,
    isTouchDevice,
    isProcessingImage,
    waveformBars,
    waveformIsSilent,
    inputRef,
    audioButtonRef,
    imageInputRef,
    isMacTheme,
    isXpTheme,
    debugMode,
    modelDisplayName,
    isTypingRyoMention,
    showNudgeButton,
    isInChatRoom,
    isLoading,
    isSpeechPlaying,
    needsUsername,
    isOffline,
    rateLimitError,
    handleInputChangeWithSound,
    handleTranscriptionComplete,
    handleTranscriptionStart,
    handleRecordingStateChange,
    handleFrequenciesChange,
    handleNudgeClick,
    handleMentionClick,
    handleImageSelect,
    handleImageClear,
    handleStopClick,
    onSubmitMessage,
  };
}

export type ChatInputViewModel = ReturnType<typeof useChatInput>;
