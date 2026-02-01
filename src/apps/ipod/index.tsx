import { BaseApp, IpodInitialData } from "../base/types";
import { IpodAppComponent } from "./components/IpodAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const IpodApp: BaseApp<IpodInitialData> = {
  id: "ipod",
  name: "iPod",
  icon: { type: "image", src: appMetadata.icon },
  description: "1st Generation iPod music player with YouTube integration",
  component: IpodAppComponent,
  helpItems,
  metadata: appMetadata,
};
