import { BaseApp } from "../base/types";
import { AdminAppComponent } from "./components/AdminAppComponent";

export const helpItems = [
  {
    icon: "👑",
    titleKey: "adminAccess",
    descriptionKey: "adminAccess",
  },
  {
    icon: "👥",
    titleKey: "userManagement",
    descriptionKey: "userManagement",
  },
  {
    icon: "💬",
    titleKey: "roomManagement",
    descriptionKey: "roomManagement",
  },
  {
    icon: "📊",
    titleKey: "statistics",
    descriptionKey: "statistics",
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
  icon: "/icons/default/apple.png",
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
