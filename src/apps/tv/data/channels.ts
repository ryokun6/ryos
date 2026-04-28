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
    videos: [
      {
        id: "TQhv6Wol6Ns",
        url: "https://www.youtube.com/watch?v=TQhv6Wol6Ns",
        title: "Our designer built an OS with Cursor",
        artist: "Cursor",
      },
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
        id: "2B-XwPjn9YY",
        url: "https://youtu.be/2B-XwPjn9YY",
        title: "Macintosh Introduction (1984)",
        artist: "Steve Jobs",
      },
      {
        id: "VQKMoT-6XSg",
        url: "https://youtu.be/VQKMoT-6XSg",
        title: "iPhone Introduction (2007)",
        artist: "Steve Jobs",
      },
    ],
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
