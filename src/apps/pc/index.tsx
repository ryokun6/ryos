import { BaseApp } from "../base/types";
import { PcAppComponent } from "./components/PcAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const PcApp: BaseApp = {
  id: "pc",
  name: "Virtual PC",
  icon: { type: "image", src: "/icons/default/pc.png" },
  description: "DOSBox Emulator",
  component: PcAppComponent,
  windowConstraints: {
    minWidth: 640,
    minHeight: 480,
  },
  helpItems,
  metadata: appMetadata,
};
