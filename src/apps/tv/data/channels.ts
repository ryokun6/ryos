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

/**
 * Channel-bug logos for the built-in channels, keyed by channel id.
 * Files live at `public/assets/tv-channel-logos/NN.png` and follow the
 * `DEFAULT_CHANNELS` order (01 = RyoTV, 02 = MTV, 03 = taiwan, …).
 * Custom channels intentionally have no entry — only built-ins ship with
 * branded artwork.
 */
export const DEFAULT_CHANNEL_LOGOS: Readonly<Record<string, string>> = {
  "ryos-picks": "/assets/tv-channel-logos/01.png",
  mtv: "/assets/tv-channel-logos/02.png",
  taiwan: "/assets/tv-channel-logos/03.png",
  "cctv-archives": "/assets/tv-channel-logos/04.png",
  "tokki-mix": "/assets/tv-channel-logos/05.png",
  "y2k-cinema": "/assets/tv-channel-logos/06.png",
  "silicon-pulse": "/assets/tv-channel-logos/07.png",
  "heisei-melody": "/assets/tv-channel-logos/08.png",
  "animal-world": "/assets/tv-channel-logos/09.png",
  "velvet-signal": "/assets/tv-channel-logos/10.png",
  "mandarin-comedy": "/assets/tv-channel-logos/11.png",
  "matte-black": "/assets/tv-channel-logos/12.png",
  "showa-vision": "/assets/tv-channel-logos/13.png",
  "taiwan-variety": "/assets/tv-channel-logos/14.png",
  "finance-decode": "/assets/tv-channel-logos/15.png",
  "childhood-animation": "/assets/tv-channel-logos/16.png",
};

export function getChannelLogo(channelId: string | undefined): string | undefined {
  if (!channelId) return undefined;
  return DEFAULT_CHANNEL_LOGOS[channelId];
}

/**
 * Deterministic logo corner per channel — same channel always lands in
 * the same corner so users build muscle memory, but the corner varies
 * across channels for visual variety. Skips bottom-left because the LCD
 * info bar's "channel down" ghost overlap reads worst there.
 */
export type ChannelLogoCorner = "top-left" | "top-right" | "bottom-right";

const CHANNEL_LOGO_CORNERS: ChannelLogoCorner[] = [
  "top-left",
  "top-right",
  "bottom-right",
];

export function getChannelLogoCorner(channelId: string | undefined): ChannelLogoCorner {
  if (!channelId) return "top-right";
  let hash = 0;
  for (let i = 0; i < channelId.length; i++) {
    hash = (hash * 31 + channelId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CHANNEL_LOGO_CORNERS.length;
  return CHANNEL_LOGO_CORNERS[index];
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
