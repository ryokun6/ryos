import { useRef, useCallback } from "react";
import { useSoundboardStore } from "@/stores/useSoundboardStore";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";
// WaveSurfer import will be removed as it's moving to SoundGrid
// import type WaveSurfer from "wavesurfer.js";

// Helper function to decode base64 audio data
const decodeBase64Audio = async (base64Data: string): Promise<AudioBuffer | null> => {
  try {
    // Check for Safari and large data
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari && base64Data.length > 100000) {
      console.warn('Large audio data detected on Safari, skipping to prevent crash');
      return null;
    }
    
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const audioContext = getAudioContext();
    const arrayBuffer = bytes.buffer;
    
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    console.error("Error decoding audio data:", error);
    return null;
  }
};

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

  const audioSourcesRef = useRef<(AudioBufferSourceNode | null)[]>(Array(9).fill(null));

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
    async (index: number) => {
      if (!activeBoard) return;
      const slot = activeBoard.slots[index];
      if (!slot || !slot.audioData) return;

      // Stop any currently playing sound in the same slot
      if (audioSourcesRef.current[index]) {
        audioSourcesRef.current[index]?.stop();
        audioSourcesRef.current[index] = null;
      }

      try {
        // Ensure audio context is running (important for Safari)
        await resumeAudioContext();
        
        const audioContext = getAudioContext();
        const audioBuffer = await decodeBase64Audio(slot.audioData);
        
        if (!audioBuffer) {
          console.error("Failed to decode audio data");
          updateSlotState(index, false, false);
          return;
        }

        // Create a source node
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        // Store the source node reference
        audioSourcesRef.current[index] = source;
        updateSlotState(index, true, false); // isPlaying: true, isRecording: false

        // Handle playback end
        source.onended = () => {
          updateSlotState(index, false, false);
          audioSourcesRef.current[index] = null;
        };

        // Start playback
        source.start(0);
      } catch (error) {
        console.error("Error playing sound:", error);
        updateSlotState(index, false, false);
      }
    },
    [activeBoard, updateSlotState]
  );

  const stopSound = useCallback(
    (index: number) => {
      const source = audioSourcesRef.current[index];
      if (source) {
        try {
          source.stop();
        } catch (error) {
          // Source may have already stopped
          console.debug("Source already stopped:", error);
        }
        audioSourcesRef.current[index] = null;
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
