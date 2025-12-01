import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Soundboard, SoundSlot, PlaybackState } from "@/types/types";
import { getLocalStorageUsage } from "@/utils/localStorageErrorHandler";


// Helper to create a default soundboard
const createDefaultBoard = (): Soundboard => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  name: "New Soundboard",
  slots: Array(9).fill({
    audioData: null,
    emoji: undefined,
    title: undefined,
  }) as SoundSlot[],
});

export interface SoundboardStoreState {
  boards: Soundboard[];
  activeBoardId: string | null;
  playbackStates: PlaybackState[];
  selectedDeviceId: string | null;
  hasInitialized: boolean;

  // Actions
  initializeBoards: () => Promise<void>;
  addNewBoard: () => void;
  updateBoardName: (boardId: string, name: string) => void;
  deleteBoard: (boardId: string) => void;
  setActiveBoardId: (boardId: string | null) => void;
  setSelectedDeviceId: (deviceId: string) => void;
  updateSlot: (
    boardId: string,
    slotIndex: number,
    updates: Partial<SoundSlot>
  ) => void;
  deleteSlot: (boardId: string, slotIndex: number) => void;
  setSlotPlaybackState: (
    slotIndex: number,
    isPlaying: boolean,
    isRecording?: boolean
  ) => void;
  resetSoundboardStore: () => void;
  _setBoards_internal: (boards: Soundboard[]) => void;
}

const SOUNDBOARD_STORE_VERSION = 1;
const SOUNDBOARD_STORE_NAME = "ryos:soundboard";

export const useSoundboardStore = create<SoundboardStoreState>()(
  persist(
    (set, get) => ({
      boards: [],
      activeBoardId: null,
      playbackStates: Array(9).fill({
        isRecording: false,
        isPlaying: false,
      }) as PlaybackState[],
      selectedDeviceId: null,
      hasInitialized: false,

      initializeBoards: async () => {
        if (get().hasInitialized) {
          return;
        }

        const currentBoards = get().boards;

        if (currentBoards.length > 0) {
          set({ hasInitialized: true });
          if (!get().activeBoardId) {
            set({ activeBoardId: currentBoards[0].id });
          }
          return;
        }

        try {
          // Check localStorage usage before loading data
          const usage = getLocalStorageUsage();
          if (usage.percentUsed > 90) {
            console.warn(`[Soundboard] Storage usage is high (${usage.percentUsed}%). Loading minimal data.`);
          }

          const response = await fetch("/data/soundboards.json");
          if (!response.ok)
            throw new Error(
              "Failed to fetch soundboards.json status: " + response.status
            );
          const data = await response.json();
          const importedBoardsRaw =
            data.boards || (Array.isArray(data) ? data : [data]);

          const importedBoards = importedBoardsRaw.map((boardData: Partial<Soundboard>) => ({
            id:
              boardData.id ||
              Date.now().toString() + Math.random().toString(36).slice(2),
            name: boardData.name || "Imported Soundboard",
            slots: (boardData.slots || Array(9).fill(null)).map(
              (slotData: Partial<SoundSlot>) => ({
                audioData: slotData?.audioData || null,
                emoji: slotData?.emoji || undefined,
                title: slotData?.title || undefined,
              })
            ),
          })) as Soundboard[];

          if (importedBoards.length > 0) {
            set({
              boards: importedBoards,
              activeBoardId: importedBoards[0].id,
              hasInitialized: true,
            });
          } else {
            const defaultBoard = createDefaultBoard();
            set({
              boards: [defaultBoard],
              activeBoardId: defaultBoard.id,
              hasInitialized: true,
            });
          }
        } catch (error) {
          console.error(
            "Error loading initial soundboards, creating default:",
            error
          );
          const defaultBoard = createDefaultBoard();
          set({
            boards: [defaultBoard],
            activeBoardId: defaultBoard.id,
            hasInitialized: true,
          });
        }
      },

      addNewBoard: () => {
        const newBoard = createDefaultBoard();
        set((state) => ({
          boards: [...state.boards, newBoard],
          activeBoardId: newBoard.id,
        }));
      },

      updateBoardName: (boardId, name) => {
        set((state) => ({
          boards: state.boards.map((board) =>
            board.id === boardId ? { ...board, name } : board
          ),
        }));
      },

      deleteBoard: (boardId) => {
        set((state) => {
          const newBoards = state.boards.filter((b) => b.id !== boardId);
          let newActiveBoardId = state.activeBoardId;
          if (state.activeBoardId === boardId) {
            newActiveBoardId = newBoards.length > 0 ? newBoards[0].id : null;
          }
          return { boards: newBoards, activeBoardId: newActiveBoardId };
        });
      },

      setActiveBoardId: (boardId) => set({ activeBoardId: boardId }),

      setSelectedDeviceId: (deviceId) => {
        set({ selectedDeviceId: deviceId });
      },

      updateSlot: (boardId, slotIndex, updates) => {
        set((state) => ({
          boards: state.boards.map((board) => {
            if (board.id === boardId) {
              const newSlots = [...board.slots];
              const currentSlot = newSlots[slotIndex] || {};
              newSlots[slotIndex] = { ...currentSlot, ...updates };
              if ("waveform" in updates) {
                // Ensure non-serializable data isn't persisted
                delete (newSlots[slotIndex] as { waveform?: unknown }).waveform;
              }
              return { ...board, slots: newSlots };
            }
            return board;
          }),
        }));
      },

      deleteSlot: (boardId, slotIndex) => {
        get().updateSlot(boardId, slotIndex, {
          audioData: null,
          emoji: undefined,
          title: undefined,
        });
      },

      setSlotPlaybackState: (slotIndex, isPlaying, isRecording) => {
        set((state) => {
          const newPlaybackStates = [...state.playbackStates];
          const currentState = newPlaybackStates[slotIndex] || {
            isPlaying: false,
            isRecording: false,
          };
          newPlaybackStates[slotIndex] = {
            isPlaying,
            isRecording:
              isRecording === undefined
                ? currentState.isRecording
                : isRecording,
          };
          return { playbackStates: newPlaybackStates };
        });
      },

      resetSoundboardStore: () => {
        const defaultBoard = createDefaultBoard();
        set({
          boards: [defaultBoard],
          activeBoardId: defaultBoard.id,
          playbackStates: Array(9).fill({
            isRecording: false,
            isPlaying: false,
          }),
          selectedDeviceId: null,
          hasInitialized: true, // Mark as initialized after reset
        });
      },

      _setBoards_internal: (boards) => set({ boards }),
    }),
    {
      name: SOUNDBOARD_STORE_NAME,
      version: SOUNDBOARD_STORE_VERSION,

      partialize: (state) => ({
        boards: state.boards,
        activeBoardId: state.activeBoardId,
        selectedDeviceId: state.selectedDeviceId,
        hasInitialized: state.hasInitialized,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          try {
            if (error) {
              console.error("Error rehydrating soundboard store:", error);
            } else if (state) {
              // Don't auto-initialize - wait for the app to open
              // Just fix any data inconsistencies
              if (state.boards && state.boards.length > 0) {
                if (
                  state.activeBoardId &&
                  !state.boards.find((b) => b.id === state.activeBoardId)
                ) {
                  state.activeBoardId = state.boards[0].id;
                } else if (!state.activeBoardId) {
                  state.activeBoardId = state.boards[0].id;
                }
              }

              // Ensure playbackStates are properly initialized
              if (
                !state.playbackStates ||
                state.playbackStates.length !== 9 ||
                !state.playbackStates.every(
                  (ps) =>
                    typeof ps === "object" &&
                    "isPlaying" in ps &&
                    "isRecording" in ps
                )
              ) {
                state.playbackStates = Array(9).fill({
                  isRecording: false,
                  isPlaying: false,
                });
              }
            }
          } catch (storageError) {
            console.error("Storage error during rehydration:", storageError);
            // Continue without persistence if storage fails
          }
        };
      },
    }
  )
);
