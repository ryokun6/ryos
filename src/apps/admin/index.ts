import { BaseApp } from "../base/types";
import { AdminAppComponent } from "./components/AdminAppComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const AdminApp: BaseApp = {
  id: "admin",
  name: "Admin",
  icon: { type: "image", src: appMetadata.icon },
  description: "System administration panel",
  component: AdminAppComponent,
  helpItems,
  metadata: appMetadata,
};
