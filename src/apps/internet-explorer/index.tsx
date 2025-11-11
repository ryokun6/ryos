import { BaseApp, InternetExplorerInitialData } from "../base/types";
import { InternetExplorerAppComponent } from "./components/InternetExplorerAppComponent";

export const helpItems = [
  {
    icon: "🌐",
    title: "Browse the Web",
    description:
      "Enter URLs and use navigation buttons (Back, Forward, Refresh, Stop).",
  },
  {
    icon: "🌌",
    title: "Travel Through Time",
    description:
      "Select a year from the dropdown to view websites from the past or future.",
  },
  {
    icon: "✨",
    title: "History Reimagined",
    description:
      "AI reconstructs very old sites (pre-1996) and imagines future web experiences.",
  },
  {
    icon: "⭐",
    title: "Save Favorites",
    description:
      "Add sites and specific years to your Favorites bar for easy access.",
  },
  {
    icon: "🔮",
    title: "Explore Time Nodes",
    description:
      "Click the clock icon in the address bar to see available snapshots of the current site across time.",
  },
  {
    icon: "🔗",
    title: "Share Your Journey",
    description:
      "Use the Share button to generate a link to the exact page and year you're viewing.",
  },
];

export const appMetadata = {
  version: "1.02",
  name: "Internet Explorer",
  creator: {
    name: "Zihan Huang",
    url: "https://bravohenry.com",
  },
  github: "https://github.com/bravohenry/ziOS",
  icon: "/icons/default/ie.png",
};

export const InternetExplorerApp: BaseApp<InternetExplorerInitialData> = {
  id: "internet-explorer",
  name: "Internet Explorer",
  icon: { type: "image", src: appMetadata.icon },
  description: "Browse the web like it's 1999",
  component: InternetExplorerAppComponent,
  helpItems,
  metadata: appMetadata,
};
