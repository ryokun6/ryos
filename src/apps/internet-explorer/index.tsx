import { BaseApp, InternetExplorerInitialData } from "../base/types";
import { InternetExplorerAppComponent } from "./components/InternetExplorerAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const InternetExplorerApp: BaseApp<InternetExplorerInitialData> = {
  id: "internet-explorer",
  name: "Internet Explorer",
  icon: { type: "image", src: appMetadata.icon },
  description: "Browse the web like it's 1999",
  component: InternetExplorerAppComponent,
  helpItems,
  metadata: appMetadata,
};
