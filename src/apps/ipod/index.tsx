import { BaseApp, IpodInitialData } from "../base/types";
import { IpodAppComponent } from "./components/IpodAppComponent";

export const helpItems = [
  {
    icon: "🎵",
    title: "Add Songs",
    description: "Paste YouTube URLs to add music to your iPod.",
  },
  {
    icon: "🔄",
    title: "Wheel Navigation",
    description: "Use the click wheel to browse menus and your music library.",
  },
  {
    icon: "⏯️",
    title: "Playback Controls",
    description: "Play, pause, skip tracks, and control your current song.",
  },
  {
    icon: "🎤",
    title: "Lyrics & Pronunciation",
    description: "View synced lyrics with translations, furigana, romaji, and pinyin.",
  },
  {
    icon: "⚙️",
    title: "Playback Modes",
    description: "Enable shuffle, repeat songs or playlists, and more.",
  },
  {
    icon: "📺",
    title: "Display & Fullscreen",
    description: "Adjust backlight, themes, and switch to fullscreen video.",
  },
];

export const appMetadata = {
  name: "iPod",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/ipod.png",
};

export const IpodApp: BaseApp<IpodInitialData> = {
  id: "ipod",
  name: "iPod",
  icon: { type: "image", src: appMetadata.icon },
  description: "1st Generation iPod music player with YouTube integration",
  component: IpodAppComponent,
  helpItems,
  metadata: appMetadata,
};
