import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    title: "iMac G4 \"Lamp\" Ad (2002)",
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
];

interface VideoStoreState {
  videos: Video[];
  currentIndex: number;
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  isPlaying: boolean;
  // actions
  setVideos: (videos: Video[] | ((prev: Video[]) => Video[])) => void;
  setCurrentIndex: (index: number) => void;
  setLoopAll: (val: boolean) => void;
  setLoopCurrent: (val: boolean) => void;
  setIsShuffled: (val: boolean) => void;
  togglePlay: () => void;
  setIsPlaying: (val: boolean) => void;
}

const CURRENT_VIDEO_STORE_VERSION = 5; // Define the current version

const getInitialState = () => ({
  videos: DEFAULT_VIDEOS,
  currentIndex: 0,
  loopAll: true,
  loopCurrent: false,
  isShuffled: false,
  isPlaying: false,
});

export const useVideoStore = create<VideoStoreState>()(
  persist(
    (set) => ({
      ...getInitialState(),

      setVideos: (videosOrUpdater) => {
        set((state) => {
          const newVideos =
            typeof videosOrUpdater === "function"
              ? (videosOrUpdater as (prev: Video[]) => Video[])(state.videos)
              : videosOrUpdater;
          return { videos: newVideos } as Partial<VideoStoreState>;
        });
      },
      setCurrentIndex: (index) => set({ currentIndex: index }),
      setLoopAll: (val) => set({ loopAll: val }),
      setLoopCurrent: (val) => set({ loopCurrent: val }),
      setIsShuffled: (val) => set({ isShuffled: val }),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setIsPlaying: (val) => set({ isPlaying: val }),
    }),
    {
      name: "ryos:videos",
      version: CURRENT_VIDEO_STORE_VERSION, // Set the current version
      migrate: (persistedState, version) => {
        let state = persistedState as Partial<VideoStoreState>; // Type assertion

        // If the persisted version is older than the current version, update defaults
        if (version < CURRENT_VIDEO_STORE_VERSION) {
          console.log(
            `Migrating video store from version ${version} to ${CURRENT_VIDEO_STORE_VERSION}`
          );
          state = {
            ...state, // Keep other persisted state
            videos: DEFAULT_VIDEOS, // Update to new defaults
            currentIndex: 0, // Reset index
            // isPlaying is not persisted, so no need to reset here
          };
        }

        // Ensure the returned state matches the latest partialized structure
        const partializedState = {
          videos: state.videos,
          currentIndex: state.currentIndex,
          loopAll: state.loopAll,
          loopCurrent: state.loopCurrent,
          isShuffled: state.isShuffled,
        };

        return partializedState as VideoStoreState; // Return the potentially migrated state
      },
      // Optional: Re-add partialize here if you want to exclude videos AFTER migration
      // if they match defaults and you want to save space
      partialize: (state) => ({
        currentIndex: state.currentIndex,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        // Exclude videos if it matches defaults to save space,
        // Requires a check or assume defaults are handled by initial state/migration
      }),
    }
  )
); 