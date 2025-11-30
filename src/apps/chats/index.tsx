import { BaseApp } from "../base/types";
import { ChatsAppComponent } from "./components/ChatsAppComponent";

export const helpItems = [
  {
    icon: "📦",
    title: "Create & Edit Files & Applets",
    description:
      "Generate HTML applets, create/edit markdown documents, read/write files, search Applets Store.",
  },
  {
    icon: "🎮",
    title: "System Control",
    description:
      "Launch/close apps, switch themes, control iPod playback, full ryOS integration.",
  },
  {
    icon: "#️⃣",
    title: "Chat Rooms & @ryo Mentions",
    description:
      "Join public/private rooms, mention @ryo for AI responses in IRC-style chat.",
  },
  {
    icon: "🎤",
    title: "Voice & Speech",
    description:
      "Push-to-talk voice messages with transcription, text-to-speech with word highlighting.",
  },
  {
    icon: "👋",
    title: "Nudge & DJ Mode",
    description:
      "👋 nudge for context-aware interactions, ryOS FM DJ mode when music is playing.",
  },
  {
    icon: "📁",
    title: "File System Management",
    description:
      "List/search files, open from Applets Store/Documents/Music, manage virtual file system.",
  },
];

export const appMetadata = {
  name: "Chats",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/question.png",
};

export const ChatsApp: BaseApp = {
  id: "chats",
  name: "Chats",
  icon: { type: "image", src: appMetadata.icon },
  description: "Chat with Ryo, your personal AI assistant",
  component: ChatsAppComponent,
  helpItems,
  metadata: appMetadata,
};
