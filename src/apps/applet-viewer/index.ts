export const helpItems = [
  {
    icon: "🛒",
    title: "Browse the Store",
    description: "Open the Store tab to discover community-built apps and install them in one click",
  },
  {
    icon: "💬",
    title: "Create with Chats",
    description: "Ask Ryo in Chats to build a custom applet — get a working HTML app instantly",
  },
  {
    icon: "📄",
    title: "Run Anything",
    description: "Sandboxed runner executes any HTML applet saved on your system safely",
  },
  {
    icon: "📤",
    title: "Share via Code",
    description: "Use File ▸ Share Applet to copy a link or short code others can paste in",
  },
  {
    icon: "📂",
    title: "Open from Finder",
    description: "Drop .app or .gz applet bundles into Finder and they appear in /Applets",
  },
  {
    icon: "🔄",
    title: "Auto Update Check",
    description: "Store ▸ Check for Updates pulls the latest versions of your installed applets",
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
