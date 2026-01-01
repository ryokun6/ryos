import React, { useState, useEffect, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { BoardList } from "./BoardList";
import { SoundGrid } from "./SoundGrid";
import { useSoundboard } from "@/hooks/useSoundboard";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { DialogState, Soundboard } from "@/types/types";
import { EmojiDialog } from "@/components/dialogs/EmojiDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { AppProps } from "../../base/types";
import { SoundboardMenuBar } from "./SoundboardMenuBar";
import { appMetadata, helpItems as defaultHelpItems } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSoundboardStore } from "@/stores/useSoundboardStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTranslatedAppName } from "@/utils/i18n";
import { useTranslation } from "react-i18next";

interface ImportedSlot {
  audioData: string | null;
  audioFormat?: 'webm' | 'mp4' | 'wav' | 'mpeg';
  emoji?: string;
  title?: string;
}

interface ImportedBoard {
  id?: string;
  name: string;
  slots: ImportedSlot[];
}

export function SoundboardAppComponent({
  onClose,
  isWindowOpen,
  isForeground,
  helpItems = [],
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
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
  const storeResetPlaybackStates = () => {
    for (let i = 0; i < 9; i++) {
      storeSetSlotPlaybackState(i, false, false);
    }
  };
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
  const translatedHelpItems = useTranslatedHelpItems("soundboard", helpItems.length > 0 ? helpItems : defaultHelpItems);
  // Disable waveforms by default on mobile Safari to prevent initial freeze
  const isMobileSafari =
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    /Mobile|iP(hone|ad|od)/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const [showWaveforms, setShowWaveforms] = useState(!isMobileSafari);
  const [showEmojis, setShowEmojis] = useState(true);
  const activeSlotRef = useRef<number | null>(null);

  const handleRecordingComplete = (base64Data: string, format: string) => {
    const activeSlot = activeSlotRef.current;
    if (activeSlot !== null && activeBoardId) {
      updateSlot(activeSlot, { 
        audioData: base64Data, 
        audioFormat: format as 'webm' | 'mp4' | 'wav' | 'mpeg' 
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
  }, [
    micPermissionGranted,
    selectedDeviceId,
    playbackStates,
    storeSetSelectedDeviceId,
  ]);

  useEffect(() => {
    playbackStates.forEach((state, index) => {
      if (state.isPlaying) {
        stopSound(index);
      }
    });
    storeResetPlaybackStates();
  }, [activeBoardId]);

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

  const handleImportBoard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
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
      boards: [boardToExport].map((b) => ({
        id: b.id,
        name: b.name,
        slots: b.slots.map((slot) => ({
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
    const a = document.createElement("a");
    a.href = url;
    a.download = `${boardToExport.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_soundboard.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reloadFromJson = async () => {
    try {
      const res = await fetch("/data/soundboards.json");
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
      const res = await fetch("/data/all-sounds.json");
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

  const menuBar = (
    <SoundboardMenuBar
      onClose={onClose}
      isWindowOpen={isWindowOpen}
      onNewBoard={addNewBoard}
      onImportBoard={() => importInputRef.current?.click()}
      onExportBoard={exportBoard}
      onReloadBoard={reloadFromJson}
      onReloadAllSounds={reloadFromAllSounds}
      onRenameBoard={() => setIsEditingTitle(true)}
      onDeleteBoard={() => {
        if (activeBoardId && boards.length > 1) {
          storeDeleteBoard(activeBoardId);
        }
      }}
      canDeleteBoard={boards.length > 1}
      onShowHelp={() => setHelpDialogOpen(true)}
      onShowAbout={() => setAboutDialogOpen(true)}
      showWaveforms={showWaveforms}
      onToggleWaveforms={setShowWaveforms}
      showEmojis={showEmojis}
      onToggleEmojis={setShowEmojis}
    />
  );

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

  if (!hasInitialized || !activeBoard || !activeBoardId) {
    return (
      <WindowFrame
        title={getTranslatedAppName("soundboard")}
        onClose={onClose}
        isForeground={isForeground}
        appId="soundboard"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex-1 flex items-center justify-center">
          {!hasInitialized
            ? "Initializing soundboard..."
            : "Loading soundboard..."}
        </div>
      </WindowFrame>
    );
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={
          isEditingTitle
            ? getTranslatedAppName("soundboard")
            : activeBoard?.name || `${getTranslatedAppName("soundboard")} ${activeBoardId}`
        }
        onClose={onClose}
        isForeground={isForeground}
        appId="soundboard"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{
          minHeight: window.innerWidth >= 768 ? 475 : 625,
        }}
      >
        <div
          className={`h-full w-full flex flex-col md:flex-row ${
            isXpTheme ? "border-t border-[#919b9c]" : ""
          }`}
        >
          <input
            type="file"
            ref={importInputRef}
            className="hidden"
            accept="application/json"
            onChange={handleImportBoard}
          />

          <BoardList
            boards={boards}
            activeBoardId={activeBoardId}
            onBoardSelect={setActiveBoardId}
            onNewBoard={addNewBoard}
            selectedDeviceId={selectedDeviceId || ""}
            onDeviceSelect={storeSetSelectedDeviceId}
            audioDevices={audioDevices}
            micPermissionGranted={micPermissionGranted}
          />

          <SoundGrid
            board={activeBoard}
            playbackStates={playbackStates}
            isEditingTitle={isEditingTitle}
            onTitleChange={(name) => updateBoardName(name)}
            onTitleBlur={(name) => {
              updateBoardName(name);
              setIsEditingTitle(false);
            }}
            onTitleKeyDown={(e) => {
              if (e.key === "Enter") {
                updateBoardName(e.currentTarget.value);
                setIsEditingTitle(false);
              }
            }}
            onSlotClick={handleSlotClick}
            onSlotDelete={deleteSlot}
            onSlotEmojiClick={(index) =>
              setDialogState({
                type: "emoji",
                isOpen: true,
                slotIndex: index,
                value: activeBoard.slots[index]?.emoji || "",
              })
            }
            onSlotTitleClick={(index) =>
              setDialogState({
                type: "title",
                isOpen: true,
                slotIndex: index,
                value: activeBoard.slots[index]?.title || "",
              })
            }
            setIsEditingTitle={setIsEditingTitle}
            showWaveforms={showWaveforms}
            showEmojis={showEmojis}
          />
        </div>

        <EmojiDialog
          isOpen={dialogState.isOpen && dialogState.type === "emoji"}
          onOpenChange={(open) =>
            setDialogState((prev) => ({ ...prev, isOpen: open }))
          }
          onEmojiSelect={(emoji) => {
            if (activeBoardId) {
              updateSlot(dialogState.slotIndex, { emoji });
            }
            setDialogState((prev) => ({ ...prev, isOpen: false }));
          }}
        />

        <InputDialog
          isOpen={dialogState.isOpen && dialogState.type === "title"}
          onOpenChange={(open) =>
            setDialogState((prev) => ({ ...prev, isOpen: open }))
          }
          onSubmit={handleDialogSubmit}
          title="Set Title"
          description="Enter a title for this sound slot"
          value={dialogState.value}
          onChange={(value) => setDialogState((prev) => ({ ...prev, value }))}
        />

        <HelpDialog
          isOpen={helpDialogOpen}
          onOpenChange={setHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="soundboard"
        />
        <AboutDialog
          isOpen={aboutDialogOpen}
          onOpenChange={setAboutDialogOpen}
          metadata={appMetadata}
          appId="soundboard"
        />
      </WindowFrame>
    </>
  );
}
