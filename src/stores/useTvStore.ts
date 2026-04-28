import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHANNEL_ID, type Channel } from "@/apps/tv/data/channels";
import type { Video } from "@/stores/useVideoStore";

export interface CustomChannel extends Channel {
  /** Original user description used to seed AI generation. */
  prompt?: string;
  /** Search queries returned by the planner — handy for "regenerate". */
  queries?: string[];
  /** Wall-clock ms timestamp the channel was created. */
  createdAt: number;
}

/** Wire-format for sharing custom channels across devices / users. */
export interface CustomChannelExport {
  /** Schema version so we can evolve the format safely later. */
  version: 1;
  exportedAt: number;
  channels: CustomChannel[];
}

export interface ImportChannelsResult {
  added: number;
  skipped: number;
}

interface TvStoreState {
  currentChannelId: string;
  lastVideoIndexByChannel: Record<string, number>;
  isPlaying: boolean;
  customChannels: CustomChannel[];
  setCurrentChannelId: (id: string) => void;
  setVideoIndex: (channelId: string, index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  addCustomChannel: (
    channel: Omit<CustomChannel, "id" | "number" | "createdAt"> & {
      id?: string;
      number?: number;
    }
  ) => CustomChannel;
  removeCustomChannel: (id: string) => void;
  /** Patch a custom channel's name/description/etc. by id. */
  updateCustomChannel: (
    id: string,
    patch: Partial<Pick<CustomChannel, "name" | "description" | "videos">>
  ) => CustomChannel | null;
  /** Append a video to a custom channel; dedupes by video id. */
  addVideoToCustomChannel: (
    id: string,
    video: Video
  ) => { channel: CustomChannel | null; added: boolean };
  /** Remove a video from a custom channel by video id. */
  removeVideoFromCustomChannel: (
    id: string,
    videoId: string
  ) => { channel: CustomChannel | null; removed: boolean };
  /** Append imported channels to the user's library. Returns a summary. */
  importChannels: (json: string) => ImportChannelsResult;
  /** Serialize the user's custom channels to a JSON string. */
  exportChannels: () => string;
}

function generateChannelId(): string {
  // crypto.randomUUID is available in evergreen browsers and Node 19+.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export const useTvStore = create<TvStoreState>()(
  persist(
    (set, get) => ({
      currentChannelId: DEFAULT_CHANNEL_ID,
      lastVideoIndexByChannel: {},
      isPlaying: false,
      customChannels: [],
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
      addCustomChannel: (channel) => {
        const existing = get().customChannels;
        // Channel numbers start above the built-in lineup (currently 3).
        // Pick the next free integer so the keypad feel stays tight.
        const usedNumbers = new Set(existing.map((c) => c.number));
        let nextNumber = 4;
        while (usedNumbers.has(nextNumber)) nextNumber += 1;

        const created: CustomChannel = {
          ...channel,
          id: channel.id ?? generateChannelId(),
          number: channel.number ?? nextNumber,
          createdAt: Date.now(),
        };
        set({ customChannels: [...existing, created] });
        return created;
      },
      removeCustomChannel: (id) =>
        set((s) => {
          const next = s.customChannels.filter((c) => c.id !== id);
          // If the deleted channel was selected, fall back to the first
          // built-in channel so the player doesn't render an empty state.
          const fallbackId =
            s.currentChannelId === id ? DEFAULT_CHANNEL_ID : s.currentChannelId;
          return {
            customChannels: next,
            currentChannelId: fallbackId,
          };
        }),
      updateCustomChannel: (id, patch) => {
        let updated: CustomChannel | null = null;
        set((s) => {
          const next = s.customChannels.map((c) => {
            if (c.id !== id) return c;
            const merged: CustomChannel = {
              ...c,
              ...(patch.name !== undefined ? { name: patch.name } : null),
              ...(patch.description !== undefined
                ? { description: patch.description }
                : null),
              ...(patch.videos !== undefined ? { videos: patch.videos } : null),
            };
            updated = merged;
            return merged;
          });
          return { customChannels: next };
        });
        return updated;
      },
      addVideoToCustomChannel: (id, video) => {
        let result: { channel: CustomChannel | null; added: boolean } = {
          channel: null,
          added: false,
        };
        set((s) => {
          const next = s.customChannels.map((c) => {
            if (c.id !== id) return c;
            const exists = c.videos.some((v) => v.id === video.id);
            if (exists) {
              result = { channel: c, added: false };
              return c;
            }
            const merged: CustomChannel = {
              ...c,
              videos: [...c.videos, video],
            };
            result = { channel: merged, added: true };
            return merged;
          });
          return { customChannels: next };
        });
        return result;
      },
      removeVideoFromCustomChannel: (id, videoId) => {
        let result: { channel: CustomChannel | null; removed: boolean } = {
          channel: null,
          removed: false,
        };
        set((s) => {
          const next = s.customChannels.map((c) => {
            if (c.id !== id) return c;
            const filtered = c.videos.filter((v) => v.id !== videoId);
            if (filtered.length === c.videos.length) {
              result = { channel: c, removed: false };
              return c;
            }
            const merged: CustomChannel = {
              ...c,
              videos: filtered,
            };
            result = { channel: merged, removed: true };
            return merged;
          });
          return { customChannels: next };
        });
        return result;
      },
      importChannels: (json) => {
        const parsed = JSON.parse(json) as
          | CustomChannelExport
          | CustomChannel[];

        // Accept either the wrapped export envelope (preferred — carries
        // the schema version) or a raw array (handy for hand-rolled JSON).
        const incoming: unknown = Array.isArray(parsed)
          ? parsed
          : parsed?.channels;
        if (!Array.isArray(incoming)) {
          throw new Error("Invalid channel library format");
        }

        const existing = get().customChannels;
        const existingIds = new Set(existing.map((c) => c.id));
        const usedNumbers = new Set(existing.map((c) => c.number));

        const merged: CustomChannel[] = [...existing];
        let added = 0;
        let skipped = 0;

        for (const raw of incoming as unknown[]) {
          if (!raw || typeof raw !== "object") {
            skipped += 1;
            continue;
          }
          const candidate = raw as Partial<CustomChannel>;
          if (
            typeof candidate.name !== "string" ||
            !candidate.name.trim() ||
            !Array.isArray(candidate.videos) ||
            candidate.videos.length === 0
          ) {
            skipped += 1;
            continue;
          }
          // Validate every video has the minimum fields ReactPlayer needs.
          const validVideos = candidate.videos.filter(
            (v) =>
              v &&
              typeof v === "object" &&
              typeof (v as { id?: unknown }).id === "string" &&
              typeof (v as { url?: unknown }).url === "string" &&
              typeof (v as { title?: unknown }).title === "string"
          );
          if (validVideos.length === 0) {
            skipped += 1;
            continue;
          }

          // Re-issue ids when they collide with existing ones so a user
          // re-importing a previously exported file gets new entries
          // rather than silently overwriting.
          let id =
            typeof candidate.id === "string" && !existingIds.has(candidate.id)
              ? candidate.id
              : generateChannelId();
          while (existingIds.has(id)) id = generateChannelId();
          existingIds.add(id);

          let nextNumber = 4;
          while (usedNumbers.has(nextNumber)) nextNumber += 1;
          usedNumbers.add(nextNumber);

          merged.push({
            id,
            number: nextNumber,
            name: candidate.name.trim().slice(0, 24),
            description:
              typeof candidate.description === "string"
                ? candidate.description
                : undefined,
            videos: validVideos,
            prompt:
              typeof candidate.prompt === "string"
                ? candidate.prompt
                : undefined,
            queries: Array.isArray(candidate.queries)
              ? candidate.queries.filter(
                  (q): q is string => typeof q === "string"
                )
              : undefined,
            createdAt:
              typeof candidate.createdAt === "number"
                ? candidate.createdAt
                : Date.now(),
          });
          added += 1;
        }

        set({ customChannels: merged });
        return { added, skipped };
      },
      exportChannels: () => {
        const payload: CustomChannelExport = {
          version: 1,
          exportedAt: Date.now(),
          channels: get().customChannels,
        };
        return JSON.stringify(payload, null, 2);
      },
    }),
    {
      name: "ryos:tv",
      version: 3,
      // The video order is freshly shuffled each time a channel is tuned
      // (see `useTvLogic`'s `currentChannel` memo), so a persisted index
      // would point at an unrelated video on reload. Persist channel
      // selection + user-created channels; in-session position is tracked
      // in memory.
      partialize: (s) => ({
        currentChannelId: s.currentChannelId,
        customChannels: s.customChannels,
      }),
    }
  )
);
