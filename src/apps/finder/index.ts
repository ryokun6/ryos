import { BaseApp, FinderInitialData } from "../base/types";
import { FinderAppComponent } from "./components/FinderAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use in FinderApp export
import { appMetadata, helpItems } from "./metadata";

export const FinderApp: BaseApp<FinderInitialData> = {
  id: "finder",
  name: "Finder",
  description: "Browse and manage files",
  icon: {
    type: "image",
    src: "/icons/mac.png",
  },
  component: FinderAppComponent,
  helpItems,
  metadata: appMetadata,
};
