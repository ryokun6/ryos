import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  buildTvChannelLineup,
  DEFAULT_CHANNEL_ID,
  isDefaultChannelId,
  type Channel,
} from "@/apps/tv/data/channels";
import type { Video } from "@/stores/useVideoStore";

/** Persisted custom channel; `number` is assigned at runtime from lineup order. */
export interface CustomChannel extends Omit<Channel, "number"> {
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
  hiddenDefaultChannelIds: string[];
  /** Whether the persistent CRT scanline / vignette overlay is on. */
  lcdFilterOn: boolean;
  /** MTV (and similar) word-timed lyric captions over the picture. */
  closedCaptionsOn: boolean;
  setCurrentChannelId: (id: string) => void;
  setVideoIndex: (channelId: string, index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  toggleLcdFilter: () => void;
  setLcdFilterOn: (on: boolean) => void;
  toggleClosedCaptions: () => void;
  setClosedCaptionsOn: (on: boolean) => void;
  addCustomChannel: (
    channel: Omit<CustomChannel, "id" | "createdAt"> & { id?: string }
  ) => CustomChannel;
  removeChannel: (id: string) => void;
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
  /** Wipe all user-created channels and tune back to the default channel. */
  resetChannels: () => void;
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
      hiddenDefaultChannelIds: [],
      lcdFilterOn: true,
      closedCaptionsOn: true,
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
      toggleLcdFilter: () =>
        set((s) => ({ lcdFilterOn: !s.lcdFilterOn })),
      setLcdFilterOn: (on) => set({ lcdFilterOn: on }),
      toggleClosedCaptions: () =>
        set((s) => ({ closedCaptionsOn: !s.closedCaptionsOn })),
      setClosedCaptionsOn: (on) => set({ closedCaptionsOn: on }),
      addCustomChannel: (channel) => {
        const existing = get().customChannels;
        const created: CustomChannel = {
          ...channel,
          id: channel.id ?? generateChannelId(),
          createdAt: Date.now(),
        };
        set({ customChannels: [...existing, created] });
        return created;
      },
      removeChannel: (id) =>
        set((s) => {
          const isDefault = isDefaultChannelId(id);
          const customChannels = isDefault
            ? s.customChannels
            : s.customChannels.filter((c) => c.id !== id);
          const hiddenDefaultChannelIds =
            isDefault && !s.hiddenDefaultChannelIds.includes(id)
              ? [...s.hiddenDefaultChannelIds, id]
              : s.hiddenDefaultChannelIds;
          const fallbackId =
            s.currentChannelId === id
              ? buildTvChannelLineup(customChannels, hiddenDefaultChannelIds)[0]
                  ?.id ?? DEFAULT_CHANNEL_ID
              : s.currentChannelId;
          return {
            customChannels,
            hiddenDefaultChannelIds,
            currentChannelId: fallbackId,
          };
        }),
      removeCustomChannel: (id) => get().removeChannel(id),
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

          merged.push({
            id,
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
      resetChannels: () =>
        set({
          customChannels: [],
          hiddenDefaultChannelIds: [],
          currentChannelId: DEFAULT_CHANNEL_ID,
          lastVideoIndexByChannel: {},
        }),
    }),
    {
      name: "ryos:tv",
      version: 4,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") {
          return persisted as typeof persisted;
        }
        const state = persisted as {
          customChannels?: CustomChannel[];
          hiddenDefaultChannelIds?: unknown;
        };
        if (version < 4 && Array.isArray(state.customChannels)) {
          state.customChannels = state.customChannels.map((entry) => {
            const { number: _n, ...rest } = entry as CustomChannel & {
              number?: number;
            };
            return rest as CustomChannel;
          });
        }
        if (!Array.isArray(state.hiddenDefaultChannelIds)) {
          state.hiddenDefaultChannelIds = [];
        }
        return state as typeof persisted;
      },
      // Channel lineup rotation uses an in-memory per-channel shuffle (see
      // `useTvLogic`); persisted indices would drift after reload.
      partialize: (s) => ({
        currentChannelId: s.currentChannelId,
        customChannels: s.customChannels,
        hiddenDefaultChannelIds: s.hiddenDefaultChannelIds,
        lcdFilterOn: s.lcdFilterOn,
        closedCaptionsOn: s.closedCaptionsOn,
      }),
    }
  )
);
