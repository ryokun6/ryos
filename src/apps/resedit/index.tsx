import { ResEditAppComponent } from "./components/ResEditAppComponent";
import { BaseApp } from "@/apps/base/types";

export const appMetadata = {
  name: "ResEdit",
  version: "1.0",
  creator: {
    name: "ryOS Team",
    url: "https://github.com/ryos",
  },
  github: "https://github.com/ryos",
  icon: "resedit.png",
};

export const helpItems = [
  {
    icon: "🔧",
    title: "What is ResEdit?",
    description: "ResEdit is a resource editor that allows you to create, edit, and manage application resources like icons, sounds, menus, and other system resources.",
  },
  {
    icon: "➕",
    title: "Creating Resources",
    description: "To create a new resource, click the '+' button in the resource list or use Resource > Add Resource from the menu. You can specify the resource type, name, and data.",
  },
  {
    icon: "📁",
    title: "Resource Types",
    description: "Common resource types include ICON (icons), PICT (pictures), SND (sounds), MENU (menus), DLOG (dialogs), ALRT (alerts), WIND (windows), STR (strings), and more.",
  },
  {
    icon: "✏️",
    title: "Editing Resources",
    description: "Select a resource from the list to edit its properties. You can modify the type, name, and data. Changes are automatically marked as modified.",
  },
  {
    icon: "💾",
    title: "Saving Files",
    description: "Use File > Save or File > Save As to save your resource file. Files are saved in JSON format and can be loaded back into ResEdit.",
  },
  {
    icon: "⌨️",
    title: "Keyboard Shortcuts",
    description: "⌘N: New file\n⌘O: Open file\n⌘S: Save file\n⌘R: Add resource\n⌘W: Close window",
  },
];

export const ResEditApp: BaseApp = {
  id: "resedit",
  name: "ResEdit",
  component: ResEditAppComponent,
  metadata: appMetadata,
  icon: {
    type: "image",
    src: "/icons/resedit.png",
  },
  description: "Resource Editor for ryOS",
};

export default ResEditAppComponent; 