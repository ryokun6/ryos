import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Soundboard, SoundSlot, PlaybackState } from "@/types/types";
import i18n from "@/lib/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { base64FromBlob } from "@/utils/audio";
import { STORES } from "@/utils/indexedDB";
import {
  createSplitIndexedDBPersistStorage,
  type SplitPersistSnapshot,
} from "@/utils/splitIndexedDBPersistStorage";

// Helper to create a default soundboard
const createDefaultBoard = (): Soundboard => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  name: i18n.t("apps.soundboard.newSoundboardDefault"),
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

type SoundboardPersistedState = Pick<
  SoundboardStoreState,
  "boards" | "activeBoardId" | "selectedDeviceId" | "hasInitialized"
>;

const audioBlobFromBase64 = (audioData: string, format?: string): Blob => {
  const binary = atob(audioData);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], {
    type: format ? `audio/${format}` : "application/octet-stream",
  });
};

const soundboardAudioKey = (boardId: string, slotIndex: number): string =>
  `${boardId}:${slotIndex}`;

const splitSoundboardState = (
  state: SoundboardPersistedState
): SplitPersistSnapshot<SoundboardPersistedState> => {
  const rows = state.boards.flatMap((board) =>
    board.slots.flatMap((slot, slotIndex) => {
      if (!slot.audioData) return [];
      const audioData = slot.audioData;
      return [
        {
          key: soundboardAudioKey(board.id, slotIndex),
          value: {
            boardId: board.id,
            slotIndex,
            format: slot.audioFormat,
          },
          materialize: () => ({
            boardId: board.id,
            slotIndex,
            format: slot.audioFormat,
            audio: audioBlobFromBase64(audioData, slot.audioFormat),
          }),
          revision: audioData,
          secondaryRevision: slot.audioFormat,
        },
      ];
    })
  );

  return {
    metadata: {
      ...state,
      boards: state.boards.map((board) => ({
        ...board,
        slots: board.slots.map((slot) => ({
          audioData: null,
          audioFormat: slot.audioFormat,
          emoji: slot.emoji,
          title: slot.title,
        })),
      })),
    },
    rows: { [STORES.SOUNDBOARD_AUDIO]: rows },
  };
};

const mergeSoundboardState = async (
  metadata: SoundboardPersistedState,
  rows: Readonly<
    Record<
      string,
      readonly { key: string; value: Record<string, unknown> }[]
    >
  >
): Promise<SoundboardPersistedState> => {
  const audioRows = new Map(
    (rows[STORES.SOUNDBOARD_AUDIO] ?? []).map((row) => [row.key, row.value])
  );
  const boards = await Promise.all(
    metadata.boards.map(async (board) => ({
      ...board,
      slots: await Promise.all(
        board.slots.map(async (slot, slotIndex): Promise<SoundSlot> => {
          const row = audioRows.get(soundboardAudioKey(board.id, slotIndex));
          const audio = row?.audio;
          const audioData =
            audio instanceof Blob
              ? await base64FromBlob(audio)
              : typeof row?.audioData === "string"
                ? row.audioData
                : null;
          return {
            ...slot,
            audioData,
            audioFormat:
              typeof row?.format === "string"
                ? (row.format as SoundSlot["audioFormat"])
                : slot.audioFormat,
          };
        })
      ),
    }))
  );
  return { ...metadata, boards };
};

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
          const response = await abortableFetch("/data/soundboards.json", {
            timeout: 15000,
            retry: { maxAttempts: 2, initialDelayMs: 500 },
          });
          // IndexedDB persistence hydrates asynchronously, so a slow boot could
          // have finished rehydrating the user's saved boards while this fetch
          // was in flight. Re-check before seeding defaults to avoid clobbering
          // restored data.
          if (get().hasInitialized || get().boards.length > 0) {
            const existing = get().boards;
            set({
              hasInitialized: true,
              activeBoardId: get().activeBoardId ?? existing[0]?.id ?? null,
            });
            return;
          }
          const data = await response.json();
          const importedBoardsRaw =
            data.boards || (Array.isArray(data) ? data : [data]);

          const importedBoards = importedBoardsRaw.map((boardData: Partial<Soundboard>) => ({
            id:
              boardData.id ||
              Date.now().toString() + Math.random().toString(36).slice(2),
            name: boardData.name || i18n.t("apps.soundboard.importedSoundboard"),
            slots: (boardData.slots || Array(9).fill(null)).map(
              (slotData: Partial<SoundSlot>) => ({
                audioData: slotData?.audioData || null,
                audioFormat: slotData?.audioFormat || undefined,
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
          audioFormat: undefined,
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
      // Runtime slots retain base64 for playback/export compatibility, while
      // persistence moves each recording into `soundboard_audio` as a Blob.
      // Existing inline snapshots migrate transparently on first hydration.
      storage: createSplitIndexedDBPersistStorage<SoundboardPersistedState>({
        stores: [STORES.SOUNDBOARD_AUDIO],
        layoutVersion: 1,
        persistVersion: SOUNDBOARD_STORE_VERSION,
        split: splitSoundboardState,
        merge: mergeSoundboardState,
      }),
      partialize: (state) => ({
        boards: state.boards,
        activeBoardId: state.activeBoardId,
        selectedDeviceId: state.selectedDeviceId,
        hasInitialized: state.hasInitialized,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
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
        };
      },
    }
  )
);
