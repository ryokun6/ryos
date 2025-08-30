import type { BaseApp } from "@/apps/base/types";
import { EmbedAppComponent } from "./components/EmbedAppComponent";

export const EmbedApp: BaseApp<{ url?: string; title?: string }> = {
  id: "embed" as any, // not in BaseApp union; registry uses AppId typing elsewhere
  name: "Embed",
  description: "Open a website in a sandboxed window",
  icon: "/icons/default/internet.png",
  component: EmbedAppComponent,
  helpItems: [
    {
      icon: "🌐",
      title: "Load URLs",
      description: "Type a URL or domain and press Go to load it in the window.",
    },
    {
      icon: "🪟",
      title: "Sandboxed",
      description: "Content loads in an iframe with restrictive sandbox by default.",
    },
  ],
  metadata: {
    name: "Embed",
    version: "0.1.0",
    creator: { name: "auxOS", url: "https://github.com/auxe-os" },
    github: "https://github.com/auxe-os/auxOSv1",
    icon: "/icons/default/internet.png",
  },
};

export default EmbedApp;
