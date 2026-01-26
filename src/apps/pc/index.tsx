import { BaseApp } from "../base/types";
import { PcAppComponent } from "./components/PcAppComponent";

export const appMetadata = {
  name: "Virtual PC",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/pc.png",
};

export const helpItems = [
  {
    icon: "🎮",
    title: "PC Emulator",
    description: "Runs classic DOS games & apps right in your browser",
  },
  {
    icon: "⌨️",
    title: "Keyboard Controls",
    description: "Use your physical keyboard for in-game input",
  },
  {
    icon: "🖱️",
    title: "Mouse Capture",
    description: "Click inside the window to capture / release the mouse",
  },
  {
    icon: "⛶",
    title: "Full-Screen Mode",
    description: "Toggle Controls ▸ Full Screen for an immersive display",
  },
  {
    icon: "🔄",
    title: "Reset & Load",
    description: "Use File ▸ Reset to restart, or Load Game to switch games",
  },
  {
    icon: "🔳",
    title: "Aspect Ratio",
    description: "Switch between 4∶3 or widescreen to fit your monitor",
  },
];

export const PcApp: BaseApp = {
  id: "pc",
  name: "Virtual PC",
  icon: { type: "image", src: "/icons/default/pc.png" },
  description: "DOSBox Emulator",
  component: PcAppComponent,
  windowConstraints: {
    minWidth: 640,
    minHeight: 480,
  },
  helpItems,
  metadata: appMetadata,
};
