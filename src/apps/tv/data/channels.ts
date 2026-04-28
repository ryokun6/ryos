import type { Video } from "@/stores/useVideoStore";
import { TAIWAN_PLAYLIST_VIDEOS } from "./taiwanVideos.generated";

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
    name: "Ryo TV",
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
  {
    id: "taiwan",
    number: 3,
    name: "台視",
    description:
      "https://www.youtube.com/playlist?list=PL0Pdneoq-nmx0FsYKLjFijtcifhPCTylI",
    videos: TAIWAN_PLAYLIST_VIDEOS,
  },
];

export const DEFAULT_CHANNEL_ID = DEFAULT_CHANNELS[0]?.id ?? "ryos-picks";
