import { BaseApp } from "../base/types";
import { AdminAppComponent } from "./components/AdminAppComponent";

export const helpItems = [
  {
    icon: "👑",
    title: "Admin Access",
    description: "This app is only accessible to the admin user (ryo).",
  },
  {
    icon: "👥",
    title: "User Management",
    description: "View, search, and manage registered users.",
  },
  {
    icon: "💬",
    title: "Room Management",
    description: "View and manage chat rooms, delete inappropriate content.",
  },
  {
    icon: "🎵",
    title: "Song Library",
    description: "Import, export, and manage the cached song library.",
  },
  {
    icon: "🔍",
    title: "Search & Filter",
    description: "Search users or songs by name to quickly find entries.",
  },
  {
    icon: "📊",
    title: "Statistics",
    description: "View system statistics and usage metrics.",
  },
];

export const appMetadata = {
  name: "Admin",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/mac-classic.png",
};

export const AdminApp: BaseApp = {
  id: "admin",
  name: "Admin",
  icon: { type: "image", src: appMetadata.icon },
  description: "System administration panel",
  component: AdminAppComponent,
  helpItems,
  metadata: appMetadata,
};
