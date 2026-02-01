import { BaseApp } from "../base/types";
import { SynthAppComponent } from "./components/SynthAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const SynthApp: BaseApp = {
  id: "synth",
  name: "Synth",
  icon: { type: "image", src: appMetadata.icon },
  description: "A virtual synthesizer with retro aesthetics",
  component: SynthAppComponent,
  helpItems,
  metadata: appMetadata,
};
