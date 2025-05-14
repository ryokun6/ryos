import { BaseApp } from "../base/types";
import { IpodAppComponent } from "./components/IpodAppComponent";

export const helpItems = [
  {
    icon: "🎵",
    title: "Add Songs",
    description: "Paste any YouTube URL to add to your iPod",
  },
  {
    icon: "🔄",
    title: "Navigation",
    description:
      "Use the click wheel to navigate menus and browse your library",
  },
  {
    icon: "⏯️",
    title: "Playback Controls",
    description:
      "Play/pause, skip tracks, and toggle video display during playback",
  },
  {
    icon: "🔀",
    title: "Playback Settings",
    description: "Shuffle your library and loop tracks or entire playlist",
  },
  {
    icon: "💡",
    title: "Display Options",
    description: "Toggle backlight, switch between Classic and Black themes",
  },
  {
    icon: "📋",
    title: "Library Management",
    description: "Create playlists and organize your music collection",
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
  icon: "/icons/ipod.png",
};

export const IpodApp: BaseApp = {
  id: "ipod",
  name: "iPod",
  icon: { type: "image", src: appMetadata.icon },
  description: "1st Generation iPod music player with YouTube integration",
  component: IpodAppComponent,
  helpItems,
  metadata: appMetadata,
};
