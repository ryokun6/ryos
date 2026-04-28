import { BaseApp } from "../base/types";
import { TvAppComponent } from "./components/TvAppComponent";

export { appMetadata, helpItems } from "./metadata";
import { appMetadata, helpItems } from "./metadata";

export const TvApp: BaseApp = {
  id: "tv",
  name: "TV",
  icon: { type: "image", src: appMetadata.icon },
  description: "Channel surf YouTube playlists",
  component: TvAppComponent,
  helpItems,
  metadata: appMetadata,
};
