import { BaseApp, IpodInitialData } from "../base/types";
import { KaraokeAppComponent } from "./components/KaraokeAppComponent";

export const helpItems = [
  {
    icon: "🔍",
    title: "Add & Search Songs",
    description: "Search YouTube for songs, or paste a URL to add to your library.",
  },
  {
    icon: "⏱️",
    title: "Sync Lyrics Timing",
    description: "Use [ ] keys, mouse wheel, or drag up/down to adjust lyrics offset.",
  },
  {
    icon: "🎨",
    title: "Style & Layout",
    description: "Change fonts, layouts (focus/center/alternating), and translate lyrics.",
  },
  {
    icon: "🎵",
    title: "Synced with iPod",
    description: "Shares the same music library as iPod. Add songs in either app.",
  },
  {
    icon: "💬",
    title: "Works with Chats",
    description: "Ask Ryo to play songs, control playback, or adjust settings via chat.",
  },
  {
    icon: "⌨️",
    title: "Keyboard Shortcuts",
    description: "Space to play/pause, arrow keys to seek and change tracks.",
  },
];

export const appMetadata = {
  name: "Karaoke",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/karaoke.png",
};

// Karaoke uses the same initial data as iPod (videoId)
export const KaraokeApp: BaseApp<IpodInitialData> = {
  id: "karaoke",
  name: "Karaoke",
  icon: { type: "image", src: appMetadata.icon },
  description: "Karaoke player with synced lyrics",
  component: KaraokeAppComponent,
  helpItems,
  metadata: appMetadata,
};
