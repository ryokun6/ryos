import { BaseApp } from "../base/types";
import { WorkIntelAppComponent } from "./components/WorkIntelAppComponent";

export const helpItems = [
  {
    icon: "📝",
    title: "Rich Editing",
    description: "Type, copy, cut, paste, undo & redo your text with ease",
  },
  {
    icon: "🎨",
    title: "Formatting",
    description: "Bold, italic, underline, headings & alignment options",
  },
  {
    icon: "📋",
    title: "Lists & Tasks",
    description: "Create bullet, numbered & check-box task lists",
  },
  {
    icon: "📄",
    title: "Markdown Support",
    description: "Write in markdown with live preview and syntax highlighting",
  },
  {
    icon: "👁️",
    title: "Preview Mode",
    description: "Toggle between edit and preview modes to see rendered markdown",
  },
  {
    icon: "💾",
    title: "File Management",
    description:
      "Create, open, save, and export files (HTML, MD, TXT) with auto-save",
  },
  {
    icon: "🎤",
    title: "Voice Dictation",
    description: "Dictate text hands-free right into the document",
  },
  {
    icon: "⚡",
    title: "Slash Commands",
    description: "Type / for quick actions or let Ryo AI edit lines remotely",
  },
];

export const appMetadata = {
  name: "WorkIntel",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/workintel.png",
};

export const WorkIntelApp: BaseApp = {
  id: "workintel",
  name: "WorkIntel",
  icon: { type: "image", src: appMetadata.icon },
  description: "A markdown-enabled rich text editor with live preview",
  component: WorkIntelAppComponent,
  helpItems,
  metadata: appMetadata,
}; 