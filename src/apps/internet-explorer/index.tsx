import { BaseApp, InternetExplorerInitialData } from "../base/types";
import { InternetExplorerBrowser as InternetExplorerAppComponent } from "./components/InternetExplorerBrowser";

export const helpItems = [
  {
    icon: "🌐",
    title: "Browse the Web",
    description:
      "Enter URLs and use navigation buttons (Back, Forward, Refresh, Stop).",
  },
  // Time-travel features removed: this app is now a standard web browser.
  {
    icon: "⭐",
    title: "Save Favorites",
    description:
      "Add sites and specific years to your Favorites bar for easy access.",
  },
  // Removed time node / sharing descriptions.
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
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
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
