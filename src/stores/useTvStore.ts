import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHANNEL_ID } from "@/apps/tv/data/channels";

interface TvStoreState {
  currentChannelId: string;
  lastVideoIndexByChannel: Record<string, number>;
  isPlaying: boolean;
  setCurrentChannelId: (id: string) => void;
  setVideoIndex: (channelId: string, index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
}

export const useTvStore = create<TvStoreState>()(
  persist(
    (set) => ({
      currentChannelId: DEFAULT_CHANNEL_ID,
      lastVideoIndexByChannel: {},
      isPlaying: false,
      setCurrentChannelId: (id) => set({ currentChannelId: id }),
      setVideoIndex: (channelId, index) =>
        set((s) => ({
          lastVideoIndexByChannel: {
            ...s.lastVideoIndexByChannel,
            [channelId]: index,
          },
        })),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
    }),
    {
      name: "ryos:tv",
      version: 2,
      // The video order is freshly shuffled each time a channel is tuned
      // (see `useTvLogic`'s `currentChannel` memo), so a persisted index
      // would point at an unrelated video on reload. Persist channel
      // selection only; in-session position is tracked in memory.
      partialize: (s) => ({
        currentChannelId: s.currentChannelId,
      }),
    }
  )
);
