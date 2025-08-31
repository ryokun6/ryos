import type { BaseApp } from "@/apps/base/types";
import { DeloreanAppComponent } from "./components/DeloreanAppComponent";

interface DeloreanInitialData {
  url?: string;
}

export const helpItems = [
  {
    icon: "🚗",
    title: "Drive the DeLorean",
    description: "Navigate the DeLorean live site inside this window.",
  },
  {
    icon: "🔄",
    title: "Reload",
    description: "Refresh the page if it's not loading properly.",
  },
  {
    icon: "�",
    title: "Open Externally",
    description: "Open the DeLorean site in a new browser tab.",
  },
];

export const appMetadata = {
  name: "auxOS – DeLorean",
  version: "1.0.0",
  creator: { name: "auxe-os", url: "https://github.com/auxe-os" },
  github: "https://github.com/auxe-os/auxOSv1",
  icon: "/icons/default/mac-classic.png",
};

export const DeloreanApp: BaseApp<DeloreanInitialData> = {
  id: "delorean",
  name: "auxOS – DeLorean",
  description: "Access the DeLorean live site with enhanced functionality",
  icon: { type: "image", src: appMetadata.icon },
  component: DeloreanAppComponent,
  helpItems,
  metadata: appMetadata,
};

export default DeloreanApp;
