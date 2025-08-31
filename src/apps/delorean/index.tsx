import type { BaseApp } from "@/apps/base/types";
import { DeloreanAppComponent } from "./components/DeloreanAppComponent";

export const DeloreanApp: BaseApp<{}> = {
  id: "delorean" as any,
  name: "auxOS – DeLorean",
  description: "Open the DeLorean live site",
  icon: { type: "image", src: "/icons/default/mac-classic.png" },
  component: DeloreanAppComponent,
  helpItems: [
    {
      icon: "🚗",
      title: "Drive",
      description: "Navigate the DeLorean live site inside this window.",
    },
  ],
  metadata: {
    name: "auxOS – DeLorean",
    version: "0.1.0",
    creator: { name: "auxe-os", url: "https://github.com/auxe-os" },
    github: "",
    icon: "/icons/default/mac-classic.png",
  },
};

export default DeloreanApp;
