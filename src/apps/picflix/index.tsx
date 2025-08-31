import type { BaseApp } from "@/apps/base/types";
import { PicflixAppComponent } from "./components/PicflixAppComponent";

interface PicflixInitialData {
  url?: string;
}

export const helpItems = [
  {
    icon: "📺",
    title: "Open PICFLIX",
    description: "Browse the PICFLIX site inside this window.",
  },
  {
    icon: "🔁",
    title: "Reload",
    description: "Refresh the page if it's not loading properly.",
  },
  {
    icon: "🔗",
    title: "Open Externally",
    description: "Open PICFLIX in a new browser tab.",
  },
];

export const appMetadata = {
  name: "PICFLIX",
  version: "1.0.0",
  creator: { name: "auxe-os", url: "https://github.com/auxe-os" },
  github: "https://github.com/auxe-os/auxOSv1",
  icon: "/icons/default/mac-classic.png",
};

export const PicflixApp: BaseApp<PicflixInitialData> = {
  id: "picflix",
  name: "PICFLIX",
  description: "Embedded PICFLIX site",
  icon: { type: "image", src: appMetadata.icon },
  component: PicflixAppComponent,
  helpItems,
  metadata: appMetadata,
};

export default PicflixApp;
