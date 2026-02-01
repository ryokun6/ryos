import { BaseApp } from "../base/types";
import { SoundboardAppComponent } from "./components/SoundboardAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const SoundboardApp: BaseApp = {
  id: "soundboard",
  name: "Soundboard",
  icon: { type: "image", src: appMetadata.icon },
  description: "A simple soundboard app",
  component: SoundboardAppComponent,
  helpItems,
  metadata: appMetadata,
};
