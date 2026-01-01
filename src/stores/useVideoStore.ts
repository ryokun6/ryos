import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

export interface Video {
  id: string;
  url: string;
  title: string;
  artist?: string;
}

export const DEFAULT_VIDEOS: Video[] = [
  {
    id: "0pP3ZjMDzF4",
    url: "https://youtu.be/0pP3ZjMDzF4",
    title: "Make Something Wonderful",
    artist: "Steve Jobs",
  },
  {
    id: "3vq9p00T08I",
    url: "https://youtu.be/3vq9p00T08I",
    title: "Macintosh (1984)",
    artist: "Apple Computer",
  },
  {
    id: "2B-XwPjn9YY",
    url: "https://youtu.be/2B-XwPjn9YY",
    title: "Macintosh Introduction (1984)",
    artist: "Steve Jobs",
  },
  {
    id: "VFP-VZtgb0s",
    url: "https://youtu.be/VFP-VZtgb0s",
    title: "iMac G3 vs PC Simplicity (1998)",
    artist: "Apple Computer",
  },
  {
    id: "dtaSDVpAo4c",
    url: "https://youtu.be/dtaSDVpAo4c",
    title: "Apple Back on Track (1998)",
    artist: "Steve Jobs",
  },
  {
    id: "Ko4V3G4NqII",
    url: "https://youtu.be/Ko4V3G4NqII",
    title: "Mac OS X Introduction Part 1 (2000)",
    artist: "Steve Jobs",
  },
  {
    id: "6-fkYFV7rOY",
    url: "https://youtu.be/6-fkYFV7rOY",
    title: "Mac OS X Introduction Part 2 (2000)",
    artist: "Steve Jobs",
  },
  {
    id: "mE_bDNaYAr8",
    url: "https://youtu.be/mE_bDNaYAr8",
    title: "iPod Ad (2001)",
    artist: "Apple Computer",
  },
  {
    id: "Mc_FiHTITHE",
    url: "https://youtu.be/Mc_FiHTITHE",
    title: "iPod Introduction (2001)",
    artist: "Steve Jobs",
  },
  {
    id: "b5P3QDm61go",
    url: "https://youtu.be/b5P3QDm61go",
    title: 'iMac G4 "Lamp" Ad (2002)',
    artist: "Apple Computer",
  },
  {
    id: "TDVYfgRoVAo",
    url: "https://youtu.be/TDVYfgRoVAo",
    title: "iMac G4 Introduction (2002)",
    artist: "Steve Jobs",
  },
  {
    id: "9AJ1oSXlzCo",
    url: "https://youtu.be/9AJ1oSXlzCo",
    title: "iPod Nano Ad (2005)",
    artist: "Apple Computer",
  },
  {
    id: "VQKMoT-6XSg",
    url: "https://youtu.be/VQKMoT-6XSg?si=XzKqJ_mnXDH_P4zH",
    title: "iPhone Introduction (2007)",
    artist: "Steve Jobs",
  },
  {
    id: "dMBW1G4U54g",
    url: "https://youtu.be/dMBW1G4U54g",
    title: "MacBook Air Ad (2008)",
    artist: "Apple Computer",
  },
  {
    id: "KEaLJpFxR9Q",
    url: "https://www.youtube.com/watch?v=KEaLJpFxR9Q",
    title: "iPhone 4 Ad (2010)",
    artist: "Apple Computer",
  },
  {
    id: "b6-yFqenAy4",
    url: "https://www.youtube.com/watch?v=b6-yFqenAy4",
    title: "iPhone 4 Introduction (2010)",
    artist: "Steve Jobs",
  },
  {
    id: "EKBVLzOZyLw",
    url: "https://youtu.be/EKBVLzOZyLw",
    title: "On Focus",
    artist: "Jony Ive",
  },
  {
    id: "wLb9g_8r-mE",
    url: "https://youtu.be/wLb9g_8r-mE",
    title: "A Conversation with Jony Ive",
    artist: "Jony Ive",
  },
  {
    id: "TQhv6Wol6Ns",
    url: "https://www.youtube.com/watch?v=TQhv6Wol6Ns&t=26s",
    title: "Our designer built an OS with Cursor",
    artist: "Cursor",
  },
];

interface VideoStoreState extends PersistedStoreMeta {
  videos: Video[];
  currentVideoId: string | null;
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  // actions
  setVideos: (videos: Video[] | ((prev: Video[]) => Video[])) => void;
  setCurrentVideoId: (videoId: string | null) => void;
  setLoopAll: (val: boolean) => void;
  setLoopCurrent: (val: boolean) => void;
  setIsShuffled: (val: boolean) => void;
  togglePlay: () => void;
  setIsPlaying: (val: boolean) => void;
  // derived state helpers
  getCurrentIndex: () => number;
  getCurrentVideo: () => Video | null;
}

const CURRENT_VIDEO_STORE_VERSION = 8; // Clean ID-based version

const getInitialState = () => ({
  videos: DEFAULT_VIDEOS,
  currentVideoId: DEFAULT_VIDEOS.length > 0 ? DEFAULT_VIDEOS[0].id : null,
  loopAll: true,
  loopCurrent: false,
  isShuffled: false,
  isPlaying: false,
  _updatedAt: Date.now(),
});

export const useVideoStore = create<VideoStoreState>()(
  createPersistedStore(
    (set, get) => ({
      ...getInitialState(),

      setVideos: (videosOrUpdater) => {
        set((state) => {
          const newVideos =
            typeof videosOrUpdater === "function"
              ? (videosOrUpdater as (prev: Video[]) => Video[])(state.videos)
              : videosOrUpdater;

          // Validate currentVideoId when videos change
          let currentVideoId = state.currentVideoId;
          if (
            currentVideoId &&
            !newVideos.find((v) => v.id === currentVideoId)
          ) {
            currentVideoId = newVideos.length > 0 ? newVideos[0].id : null;
          }

          return {
            videos: newVideos,
            currentVideoId,
            _updatedAt: Date.now(),
          };
        });
      },
      setCurrentVideoId: (videoId) =>
        set((state) => {
          // Ensure videoId exists in videos array
          const validVideoId =
            videoId && state.videos.find((v) => v.id === videoId)
              ? videoId
              : null;
          return { currentVideoId: validVideoId, _updatedAt: Date.now() };
        }),
      setLoopAll: (val) => set({ loopAll: val, _updatedAt: Date.now() }),
      setLoopCurrent: (val) => set({ loopCurrent: val, _updatedAt: Date.now() }),
      setIsShuffled: (val) => set({ isShuffled: val, _updatedAt: Date.now() }),
      togglePlay: () =>
        set((state) => ({ isPlaying: !state.isPlaying, _updatedAt: Date.now() })),
      setIsPlaying: (val) => set({ isPlaying: val, _updatedAt: Date.now() }),

      // Derived state helpers
      getCurrentIndex: () => {
        const state = get();
        return state.currentVideoId
          ? state.videos.findIndex((v) => v.id === state.currentVideoId)
          : -1;
      },
      getCurrentVideo: () => {
        const state = get();
        return state.currentVideoId
          ? state.videos.find((v) => v.id === state.currentVideoId) || null
          : null;
      },
    }),
    {
      name: "ryos:videos",
      version: CURRENT_VIDEO_STORE_VERSION,
      migrate: () => {
        console.log(
          `Migrating video store to clean ID-based version ${CURRENT_VIDEO_STORE_VERSION}`
        );
        // Always reset to defaults for clean start
        return getInitialState();
      },
      // Persist videos array to prevent ID-based errors
      partialize: (state) => ({
        videos: state.videos,
        currentVideoId: state.currentVideoId,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        _updatedAt: state._updatedAt,
      }),
    }
  )
);
