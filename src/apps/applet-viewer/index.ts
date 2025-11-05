import { BaseApp } from "../base/types";
import { AppletViewerAppComponent } from "./components/AppletViewerAppComponent";

export const helpItems = [
  {
    icon: "📄",
    title: "View Applets",
    description: "Open and view applets saved from Ryo chats.",
  },
  {
    icon: "📐",
    title: "Window Size Memory",
    description:
      "Each applet remembers its last window size and restores it when opened.",
  },
  {
    icon: "📂",
    title: "Open from Finder",
    description:
      "Use the File menu's 'Open...' option to browse applets in the Finder.",
  },
];

export const appMetadata = {
  name: "Applet Viewer",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/app.png",
};

export interface AppletViewerInitialData {
  path: string;
  content: string;
  shareCode?: string;
  icon?: string;
  name?: string;
}

export const AppletViewerApp: BaseApp<AppletViewerInitialData> = {
  id: "applet-viewer",
  name: "Applet Viewer",
  icon: { type: "image", src: appMetadata.icon },
  description: "View HTML applets",
  component: AppletViewerAppComponent,
  helpItems,
  metadata: appMetadata,
};
