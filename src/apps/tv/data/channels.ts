import type { Video } from "@/stores/useVideoStore";
import { PREPOPULATED_TV_CHANNELS } from "./prepopulatedChannels.generated";

export interface Channel {
  id: string;
  number: number;
  name: string;
  description?: string;
  videos: Video[];
}

export const DEFAULT_CHANNELS: Channel[] = [
  {
    id: "ryos-picks",
    number: 1,
    name: "RyoTV",
    description: "Plays from your Videos app library",
    videos: [],
  },
  {
    id: "mtv",
    number: 2,
    name: "MTV",
    description: "Plays from your iPod music library",
    videos: [],
  },
  ...PREPOPULATED_TV_CHANNELS.map((channel, index) => ({
    ...channel,
    number: index + 3,
  })),
];

export const DEFAULT_CHANNEL_ID = DEFAULT_CHANNELS[0]?.id ?? "ryos-picks";

export function isDefaultChannelId(id: string): boolean {
  return DEFAULT_CHANNELS.some((channel) => channel.id === id);
}

/** Built-ins first, then custom channels; channel numbers are list order (1-based). */
export function buildTvChannelLineup(
  customChannels: ReadonlyArray<
    Omit<Channel, "number"> & Partial<Pick<Channel, "number">>
  >,
  hiddenDefaultChannelIds: ReadonlyArray<string> = []
): Channel[] {
  const hiddenDefaults = new Set(hiddenDefaultChannelIds);
  return [
    ...DEFAULT_CHANNELS.filter((ch) => !hiddenDefaults.has(ch.id)),
    ...customChannels,
  ].map((ch, index) => ({
    ...ch,
    number: index + 1,
  }));
}
