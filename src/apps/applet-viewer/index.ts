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
    icon: "🤖",
    title: "Built-in AI",
    description:
        "Inside your applet, call fetch('/api/applet-ai') with JSON { prompt: \"...\" } for Gemini text or { mode: \"image\", prompt: \"...\", images: [{ mediaType: \"image/png\", data: \"<base64>\" }] } to stream or edit Gemini image previews. ryOS injects your X-Username and Authorization headers automatically when available, so you can call the endpoint directly.",
  },
  {
    icon: "📂",
    title: "Open from Finder",
    description:
      "Use the File menu's 'Open...' option to browse applets in the Finder.",
  },
];

export const appMetadata = {
  name: "Applet Store",
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
  name: "Applet Store",
  icon: { type: "image", src: appMetadata.icon },
  description: "View HTML applets",
  component: AppletViewerAppComponent,
  helpItems,
  metadata: appMetadata,
};
