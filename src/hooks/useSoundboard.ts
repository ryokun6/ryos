import { useRef, useCallback } from "react";
import { useSoundboardStore } from "@/stores/useSoundboardStore";
import { createAudioFromBase64 } from "@/utils/audio";
// WaveSurfer import will be removed as it's moving to SoundGrid
// import type WaveSurfer from "wavesurfer.js";

export const useSoundboard = () => {
  // Selectors from Zustand store
  const boards = useSoundboardStore((state) => state.boards);
  const activeBoardId = useSoundboardStore((state) => state.activeBoardId);
  const playbackStates = useSoundboardStore((state) => state.playbackStates);
  const addNewBoardAction = useSoundboardStore((state) => state.addNewBoard);
  const updateBoardNameAction = useSoundboardStore(
    (state) => state.updateBoardName
  );
  const deleteBoardAction = useSoundboardStore((state) => state.deleteBoard);
  const setActiveBoardIdAction = useSoundboardStore(
    (state) => state.setActiveBoardId
  );
  const updateSlotAction = useSoundboardStore((state) => state.updateSlot);
  const deleteSlotAction = useSoundboardStore((state) => state.deleteSlot);
  const setSlotPlaybackStateAction = useSoundboardStore(
    (state) => state.setSlotPlaybackState
  );

  const audioRefs = useRef<(HTMLAudioElement | null)[]>(Array(9).fill(null));

  // Removed automatic initialization - now handled by the app component

  const activeBoard = boards.find((b) => b.id === activeBoardId);

  const addNewBoard = useCallback(() => {
    addNewBoardAction();
  }, [addNewBoardAction]);

  const updateBoardName = useCallback(
    (name: string) => {
      if (activeBoardId) {
        updateBoardNameAction(activeBoardId, name);
      }
    },
    [activeBoardId, updateBoardNameAction]
  );

  const deleteCurrentBoard = useCallback(() => {
    if (activeBoardId && boards.length > 1) {
      deleteBoardAction(activeBoardId);
    }
  }, [activeBoardId, boards.length, deleteBoardAction]);

  const updateSlot = useCallback(
    (index: number, updates: Partial<import("@/types/types").SoundSlot>) => {
      if (activeBoardId) {
        // Ensure waveform is not passed to the store action
        const { waveform: _waveform, ...restUpdates } = updates;
        void _waveform;
        updateSlotAction(activeBoardId, index, restUpdates);
      }
    },
    [activeBoardId, updateSlotAction]
  );

  const deleteSlot = useCallback(
    (index: number) => {
      if (activeBoardId) {
        deleteSlotAction(activeBoardId, index);
      }
    },
    [activeBoardId, deleteSlotAction]
  );

  const updateSlotState = useCallback(
    (index: number, isPlaying: boolean, isRecording?: boolean) => {
      setSlotPlaybackStateAction(index, isPlaying, isRecording);
    },
    [setSlotPlaybackStateAction]
  );

  const playSound = useCallback(
    (index: number) => {
      if (!activeBoard) return;
      const slot = activeBoard.slots[index];
      if (!slot || !slot.audioData) return;

      // Stop any currently playing sound in the same slot or other slots if needed
      if (audioRefs.current[index]) {
        audioRefs.current[index]?.pause();
        audioRefs.current[index] = null;
      }
      // Optionally stop other sounds if only one can play at a time
      // audioRefs.current.forEach((audio, i) => { ... });

      // Pass the stored format for cross-browser compatibility
      const audio = createAudioFromBase64(slot.audioData, slot.audioFormat);
      audioRefs.current[index] = audio;
      updateSlotState(index, true, false); // isPlaying: true, isRecording: false

      audio.play().catch((error) => {
        console.error("Error playing sound:", error);
        updateSlotState(index, false, false);
      });

      audio.onended = () => {
        updateSlotState(index, false, false);
        audioRefs.current[index] = null;
      };
    },
    [activeBoard, updateSlotState]
  );

  const stopSound = useCallback(
    (index: number) => {
      const audio = audioRefs.current[index];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audioRefs.current[index] = null;
        updateSlotState(index, false, false);
      }
    },
    [updateSlotState]
  );

  // Waveform related logic is removed from here
  // handleWaveformCreate is removed
  // waveformRefs is removed

  return {
    boards,
    activeBoard: activeBoard || (boards.length > 0 ? boards[0] : null), // Fallback for activeBoard
    activeBoardId,
    playbackStates,
    // waveformRefs removed
    setActiveBoardId: setActiveBoardIdAction,
    addNewBoard,
    updateBoardName,
    deleteCurrentBoard,
    updateSlot,
    deleteSlot,
    playSound,
    stopSound,
    // handleWaveformCreate removed
    // Expose store setters directly if needed by components, or keep wrapped actions
    // setBoards: useSoundboardStore((state) => state._setBoards_internal), // Example if needed
    // setPlaybackStates: useSoundboardStore((state) => state.setPlaybackStates), // Example if needed
  };
};
