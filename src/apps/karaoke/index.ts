import { BaseApp, IpodInitialData } from "../base/types";
import { KaraokeAppComponent } from "./components/KaraokeAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

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
