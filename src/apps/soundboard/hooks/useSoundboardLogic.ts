import { useEffect, useRef, useState, useCallback } from "react";
import type { ChangeEvent } from "react";
import { useSoundboard } from "@/hooks/useSoundboard";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import type { DialogState, Soundboard } from "@/types/types";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSoundboardStore } from "@/stores/useSoundboardStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { helpItems as sharedHelpItems } from "..";
import { abortableFetch } from "@/utils/abortableFetch";

interface ImportedSlot {
  audioData: string | null;
  audioFormat?: "webm" | "mp4" | "wav" | "mpeg";
  emoji?: string;
  title?: string;
}

interface ImportedBoard {
  id?: string;
  name: string;
  slots: ImportedSlot[];
}

export interface UseSoundboardLogicProps {
  helpItems?: typeof sharedHelpItems;
  isForeground?: boolean;
}

export function useSoundboardLogic({
  helpItems = [],
  isForeground = true,
}: UseSoundboardLogicProps) {
  const {
    boards,
    activeBoard,
    activeBoardId,
    playbackStates,
    setActiveBoardId,
    addNewBoard,
    updateBoardName,
    updateSlot,
    deleteSlot,
    playSound,
    stopSound,
  } = useSoundboard();

  // Initialize soundboard data on first mount
  const initializeBoards = useSoundboardStore(
    (state) => state.initializeBoards
  );
  const hasInitialized = useSoundboardStore((state) => state.hasInitialized);

  // Get current theme
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  useEffect(() => {
    if (!hasInitialized) {
      initializeBoards();
    }
  }, [hasInitialized, initializeBoards]);

  const storeSetSlotPlaybackState = useSoundboardStore(
    (state) => state.setSlotPlaybackState
  );
  const storeResetPlaybackStates = useCallback(() => {
    for (let i = 0; i < 9; i++) {
      storeSetSlotPlaybackState(i, false, false);
    }
  }, [storeSetSlotPlaybackState]);
  const storeSetBoards = useSoundboardStore(
    (state) => state._setBoards_internal
  );
  const storeDeleteBoard = useSoundboardStore((state) => state.deleteBoard);
  const selectedDeviceId = useSoundboardStore(
    (state) => state.selectedDeviceId
  );
  const storeSetSelectedDeviceId = useSoundboardStore(
    (state) => state.setSelectedDeviceId
  );

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({
    type: null,
    isOpen: false,
    slotIndex: -1,
    value: "",
  });

  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "soundboard",
    helpItems.length > 0 ? helpItems : sharedHelpItems
  );
  // Disable waveforms by default on mobile Safari to prevent initial freeze
  const isMobileSafari =
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    /Mobile|iP(hone|ad|od)/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const [showWaveforms, setShowWaveforms] = useState(!isMobileSafari);
  const [showEmojis, setShowEmojis] = useState(true);
  const activeSlotRef = useRef<number | null>(null);
  const playbackStatesRef = useRef(playbackStates);

  useEffect(() => {
    playbackStatesRef.current = playbackStates;
  }, [playbackStates]);

  const handleRecordingComplete = (base64Data: string, format: string) => {
    const activeSlot = activeSlotRef.current;
    if (activeSlot !== null && activeBoardId) {
      updateSlot(activeSlot, {
        audioData: base64Data,
        audioFormat: format as "webm" | "mp4" | "wav" | "mpeg",
      });
    }
  };

  const {
    micPermissionGranted,
    startRecording: startRec,
    stopRecording,
  } = useAudioRecorder({
    onRecordingComplete: handleRecordingComplete,
    selectedDeviceId: selectedDeviceId || "",
    setRecordingState: (isRecording) => {
      const activeSlot = activeSlotRef.current;
      if (activeSlot !== null) {
        const currentPlaybackState = playbackStates[activeSlot];
        storeSetSlotPlaybackState(
          activeSlot,
          currentPlaybackState?.isPlaying || false,
          isRecording
        );
      }
    },
  });

  useEffect(() => {
    if (micPermissionGranted) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        setAudioDevices(audioInputs);

        if (selectedDeviceId) {
          const defaultDevice = audioInputs.find(
            (d) => d.deviceId === "default" || d.deviceId === selectedDeviceId
          );
          if (defaultDevice) {
            storeSetSelectedDeviceId(defaultDevice.deviceId);
          }
        } else if (audioInputs.length > 0) {
          storeSetSelectedDeviceId(audioInputs[0].deviceId);
        }
      });
    }
  }, [micPermissionGranted, selectedDeviceId, storeSetSelectedDeviceId]);

  useEffect(() => {
    playbackStatesRef.current.forEach((state, index) => {
      if (state.isPlaying) {
        stopSound(index);
      }
    });
    storeResetPlaybackStates();
  }, [activeBoardId, stopSound, storeResetPlaybackStates]);

  const startRecording = (index: number) => {
    activeSlotRef.current = index;
    startRec();
  };

  const handleSlotClick = (index: number) => {
    if (!activeBoard) return;
    const slot = activeBoard.slots[index];

    if (playbackStates[index]?.isRecording) {
      stopRecording();
    } else if (slot?.audioData) {
      if (playbackStates[index]?.isPlaying) {
        stopSound(index);
      } else {
        playSound(index);
      }
    } else {
      startRecording(index);
    }
  };

  const handleDialogSubmit = () => {
    if (!dialogState.type || !activeBoardId) return;
    updateSlot(dialogState.slotIndex, {
      [dialogState.type]: dialogState.value,
    });
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleImportBoard = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const importedData = JSON.parse(loadEvent.target?.result as string);
        const importedBoardsRaw = importedData.boards || [importedData];
        const newBoardsFromFile: Soundboard[] = importedBoardsRaw.map(
          (board: ImportedBoard) => ({
            id:
              board.id ||
              Date.now().toString() + Math.random().toString(36).slice(2),
            name: board.name || t("apps.soundboard.importedSoundboard"),
            slots: (board.slots || Array(9).fill(null)).map(
              (slot: ImportedSlot) => ({
                audioData: slot.audioData,
                audioFormat: slot.audioFormat,
                emoji: slot.emoji,
                title: slot.title,
              })
            ),
          })
        );
        storeSetBoards([...boards, ...newBoardsFromFile]);
        if (newBoardsFromFile.length > 0 && newBoardsFromFile[0].id) {
          setActiveBoardId(newBoardsFromFile[0].id);
        }
      } catch (err) {
        console.error("Failed to import soundboards:", err);
      }
    };
    reader.readAsText(file);
  };

  const exportBoard = () => {
    if (!activeBoard) return;
    const boardToExport =
      boards.find((b) => b.id === activeBoardId) || activeBoard;
    const exportData = {
      boards: [boardToExport].map((board) => ({
        id: board.id,
        name: board.name,
        slots: board.slots.map((slot) => ({
          audioData: slot.audioData,
          audioFormat: slot.audioFormat,
          emoji: slot.emoji,
          title: slot.title,
        })),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${boardToExport.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_soundboard.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const reloadFromJson = async () => {
    try {
      const res = await abortableFetch("/data/soundboards.json", {
        timeout: 15000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });
      const data = await res.json();
      const importedBoardsRaw = data.boards || [data];
      const newBoards: Soundboard[] = importedBoardsRaw.map(
        (board: ImportedBoard) => ({
          id:
            board.id ||
            Date.now().toString() + Math.random().toString(36).slice(2),
          name: board.name || t("apps.soundboard.importedSoundboard"),
          slots: (board.slots || Array(9).fill(null)).map(
            (slot: ImportedSlot) => ({
              audioData: slot.audioData,
              audioFormat: slot.audioFormat,
              emoji: slot.emoji,
              title: slot.title,
            })
          ),
        })
      );
      storeSetBoards(newBoards);
      if (newBoards.length > 0 && newBoards[0].id) {
        setActiveBoardId(newBoards[0].id);
      }
    } catch (err) {
      console.error("Failed to reload soundboards.json:", err);
    }
  };

  const reloadFromAllSounds = async () => {
    try {
      const res = await abortableFetch("/data/all-sounds.json", {
        timeout: 15000,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });
      const data = await res.json();
      const importedBoardsRaw = data.boards || [data];
      const newBoards: Soundboard[] = importedBoardsRaw.map(
        (board: ImportedBoard) => ({
          id:
            board.id ||
            Date.now().toString() + Math.random().toString(36).slice(2),
          name: board.name || t("apps.soundboard.importedSoundboard"),
          slots: (board.slots || Array(9).fill(null)).map(
            (slot: ImportedSlot) => ({
              audioData: slot.audioData,
              audioFormat: slot.audioFormat,
              emoji: slot.emoji,
              title: slot.title,
            })
          ),
        })
      );
      storeSetBoards(newBoards);
      if (newBoards.length > 0 && newBoards[0].id) {
        setActiveBoardId(newBoards[0].id);
      }
    } catch (err) {
      console.error("Failed to reload all-sounds.json:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isForeground || !activeBoard) return;

      const index = e.keyCode >= 97 ? e.keyCode - 97 : e.keyCode - 49;
      if (
        (e.keyCode >= 97 && e.keyCode <= 105) ||
        (e.keyCode >= 49 && e.keyCode <= 57)
      ) {
        if (index < 0 || index >= activeBoard.slots.length) return;
        const slot = activeBoard.slots[index];
        if (slot?.audioData) {
          if (playbackStates[index]?.isPlaying) {
            stopSound(index);
          } else {
            playSound(index);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeBoard, playbackStates, playSound, stopSound, isForeground]);

  return {
    t,
    translatedHelpItems,
    boards,
    activeBoard,
    activeBoardId,
    playbackStates,
    setActiveBoardId,
    addNewBoard,
    updateBoardName,
    updateSlot,
    deleteSlot,
    playSound,
    stopSound,
    hasInitialized,
    currentTheme,
    isXpTheme,
    isEditingTitle,
    setIsEditingTitle,
    dialogState,
    setDialogState,
    helpDialogOpen,
    setHelpDialogOpen,
    aboutDialogOpen,
    setAboutDialogOpen,
    audioDevices,
    importInputRef,
    showWaveforms,
    setShowWaveforms,
    showEmojis,
    setShowEmojis,
    micPermissionGranted,
    selectedDeviceId,
    storeSetSelectedDeviceId,
    storeDeleteBoard,
    handleSlotClick,
    handleDialogSubmit,
    handleImportBoard,
    exportBoard,
    reloadFromJson,
    reloadFromAllSounds,
  };
}
