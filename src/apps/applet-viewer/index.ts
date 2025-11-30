export const helpItems = [
  {
    icon: "🛒",
    title: "Applet Store",
    description: "Browse and install applets from the community. Open the Store menu to discover new apps.",
  },
  {
    icon: "💬",
    title: "Create with ryOS Chat",
    description: "Ask ryOS Chat to create custom apps and applets for you. Share your ideas and get working apps instantly.",
  },
  {
    icon: "📄",
    title: "View Applets",
    description: "Open and run applets saved from ryOS Chat or downloaded from the store.",
  },
  {
    icon: "📤",
    title: "Share Applets",
    description: "Share your favorite applets with others using the Share Applet option in the File menu.",
  },
  {
    icon: "📂",
    title: "Open from Finder",
    description: "Browse and open applets saved on your system using the File menu.",
  },
  {
    icon: "🔄",
    title: "Keep Updated",
    description: "Check for updates in the Store menu to get the latest versions of your installed applets.",
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
