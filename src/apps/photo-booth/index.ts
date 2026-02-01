import { BaseApp } from "../base/types";
import { PhotoBoothComponent } from "./components/PhotoBoothComponent";

// Re-export metadata from separate file to avoid eager loading of components
export { appMetadata, helpItems } from "./metadata";

// Import for local use
import { appMetadata, helpItems } from "./metadata";

export const PhotoBoothApp: BaseApp = {
  id: "photo-booth",
  name: "Photo Booth",
  icon: { type: "image", src: "/icons/default/photo-booth.png" },
  description: "Take photos with your camera and apply fun effects",
  component: PhotoBoothComponent,
  helpItems,
  metadata: appMetadata,
};
