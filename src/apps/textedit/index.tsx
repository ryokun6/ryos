import { BaseApp } from "../base/types";
import { TextEditAppComponent } from "./components/TextEditAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const TextEditApp: BaseApp = {
  id: "textedit",
  name: "TextEdit",
  icon: { type: "image", src: appMetadata.icon },
  description: "A simple rich text editor",
  component: TextEditAppComponent,
  helpItems,
  metadata: appMetadata,
};
