import { BaseApp, IpodInitialData } from "../base/types";
import { KaraokeAppComponent } from "./components/KaraokeAppComponent";

export const helpItems = [
  {
    icon: "🎤",
    title: "Karaoke Mode",
    description: "Full-screen video player with synced lyrics overlay.",
  },
  {
    icon: "🎵",
    title: "Shared Library",
    description: "Uses the same music library as iPod.",
  },
  {
    icon: "🌐",
    title: "Instant Translations",
    description: "Translate lyrics to multiple languages on the fly.",
  },
  {
    icon: "⌨️",
    title: "Keyboard Controls",
    description: "Space to play/pause, arrows to seek and change tracks.",
  },
  {
    icon: "📐",
    title: "Layout Options",
    description: "Choose between focus, center, and alternating lyrics layouts.",
  },
  {
    icon: "⏱️",
    title: "Offset Adjustment",
    description: "Use [ ] keys, mouse wheel, or drag up/down to adjust lyrics timing.",
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
