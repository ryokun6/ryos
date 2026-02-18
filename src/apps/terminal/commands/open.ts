import { Command, CommandContext, CommandResult } from "../types";
import { appIds, AppId } from "@/config/appRegistryData";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import i18n from "@/lib/i18n";

// App name aliases for convenience
const APP_ALIASES: Record<string, AppId> = {
  // Common aliases
  ie: "internet-explorer",
  browser: "internet-explorer",
  explorer: "internet-explorer",
  chat: "chats",
  text: "textedit",
  edit: "textedit",
  editor: "textedit",
  music: "ipod",
  player: "ipod",
  video: "videos",
  movie: "videos",
  settings: "control-panels",
  preferences: "control-panels",
  prefs: "control-panels",
  applets: "applet-viewer",
  store: "applet-viewer",
  vm: "pc",
  virtualpc: "pc",
  cam: "photo-booth",
  camera: "photo-booth",
  photos: "photo-booth",
  mine: "minesweeper",
  mines: "minesweeper",
  sound: "soundboard",
  sounds: "soundboard",
  synth: "synth",
  synthesizer: "synth",
  keyboard: "synth",
  term: "terminal",
  cli: "terminal",
  shell: "terminal",
  files: "finder",
  file: "finder",
};

// Get app ID from name or alias
function getAppId(name: string): AppId | null {
  const lowerName = name.toLowerCase();
  
  // Direct match with app IDs
  if (appIds.includes(lowerName as AppId)) {
    return lowerName as AppId;
  }
  
  // Check aliases
  if (APP_ALIASES[lowerName]) {
    return APP_ALIASES[lowerName];
  }
  
  // Try partial matching for app IDs
  const partialMatch = appIds.find(id => 
    id.includes(lowerName) || lowerName.includes(id.replace("-", ""))
  );
  if (partialMatch) {
    return partialMatch;
  }
  
  return null;
}

export const openCommand: Command = {
  name: "open",
  description: "apps.terminal.commands.open",
  usage: "open <app|file|path>",
  handler: async (
    args: string[],
    context: CommandContext
  ): Promise<CommandResult> => {
    if (args.length === 0) {
      return {
        output: `usage: open <app|file|path>\n\n${i18n.t("apps.terminal.output.openExamples")}:\n  open finder\n  open textedit\n  open myfile.txt\n  open /Applets/my-applet.app`,
        isError: true,
      };
    }

    const target = args.join(" ");
    
    // 1. Try to open as an app first
    const appId = getAppId(target);
    if (appId) {
      context.launchApp(appId);
      context.playCommandSound();
      return {
        output: i18n.t("apps.terminal.output.openedApp", { app: appId }),
        isError: false,
      };
    }

    // 2. Try to find the file in current directory
    const fileInCurrentDir = context.files.find(
      (f) => f.name.toLowerCase() === target.toLowerCase()
    );

    if (fileInCurrentDir) {
      // Handle directories - navigate to them via Finder
      if (fileInCurrentDir.isDirectory) {
        context.launchApp("finder", { initialData: { path: fileInCurrentDir.path } });
        context.playCommandSound();
        return {
          output: i18n.t("apps.terminal.output.openedFolder", { folder: fileInCurrentDir.name }),
          isError: false,
        };
      }

      // Handle files based on their type/location
      return await openFile(fileInCurrentDir.path, fileInCurrentDir.name, context);
    }

    // 3. Try to interpret as an absolute path
    if (target.startsWith("/")) {
      const fileStore = useFilesStore.getState();
      const fileMetadata = fileStore.getItem(target);
      
      if (fileMetadata) {
        if (fileMetadata.isDirectory) {
          context.launchApp("finder", { initialData: { path: target } });
          context.playCommandSound();
          return {
            output: i18n.t("apps.terminal.output.openedFolder", { folder: fileMetadata.name }),
            isError: false,
          };
        }
        return await openFile(target, fileMetadata.name, context);
      }
    }

    // 4. Try to find file by partial name match
    const partialMatch = context.files.find(
      (f) => f.name.toLowerCase().includes(target.toLowerCase())
    );
    
    if (partialMatch) {
      if (partialMatch.isDirectory) {
        context.launchApp("finder", { initialData: { path: partialMatch.path } });
        context.playCommandSound();
        return {
          output: i18n.t("apps.terminal.output.openedFolder", { folder: partialMatch.name }),
          isError: false,
        };
      }
      return await openFile(partialMatch.path, partialMatch.name, context);
    }

    // Not found
    context.playErrorSound();
    return {
      output: i18n.t("apps.terminal.output.openNotFound", { target }),
      isError: true,
    };
  },
};

async function openFile(
  path: string,
  name: string,
  context: CommandContext
): Promise<CommandResult> {
  const fileStore = useFilesStore.getState();
  const fileMetadata = fileStore.getItem(path);

  // Handle applications
  if (path.startsWith("/Applications/") && fileMetadata?.appId) {
    context.launchApp(fileMetadata.appId);
    context.playCommandSound();
    return {
      output: i18n.t("apps.terminal.output.openedApp", { app: fileMetadata.appId }),
      isError: false,
    };
  }

  // Handle documents
  if (path.startsWith("/Documents/")) {
    let content = "";
    
    if (fileMetadata?.uuid) {
      try {
        const contentData = await dbOperations.get<DocumentContent>(
          STORES.DOCUMENTS,
          fileMetadata.uuid
        );
        if (contentData?.content) {
          if (contentData.content instanceof Blob) {
            content = await contentData.content.text();
          } else if (typeof contentData.content === "string") {
            content = contentData.content;
          }
        }
      } catch (error) {
        console.error("[open] Error reading document:", error);
      }
    }
    
    context.launchApp("textedit", {
      initialData: { path, content },
    });
    context.playCommandSound();
    return {
      output: i18n.t("apps.terminal.output.openedFile", { file: name }),
      isError: false,
    };
  }

  // Handle images
  if (path.startsWith("/Images/")) {
    let content: Blob | undefined;
    
    if (fileMetadata?.uuid) {
      try {
        const contentData = await dbOperations.get<DocumentContent>(
          STORES.IMAGES,
          fileMetadata.uuid
        );
        if (contentData?.content instanceof Blob) {
          content = contentData.content;
        }
      } catch (error) {
        console.error("[open] Error reading image:", error);
      }
    }
    
    context.launchApp("paint", {
      initialData: { path, content },
    });
    context.playCommandSound();
    return {
      output: i18n.t("apps.terminal.output.openedFile", { file: name }),
      isError: false,
    };
  }

  // Handle applets
  if (path.startsWith("/Applets/") && (path.endsWith(".app") || path.endsWith(".html"))) {
    let content = "";
    
    if (fileMetadata?.uuid) {
      try {
        const contentData = await dbOperations.get<DocumentContent>(
          STORES.APPLETS,
          fileMetadata.uuid
        );
        if (contentData?.content) {
          if (contentData.content instanceof Blob) {
            content = await contentData.content.text();
          } else if (typeof contentData.content === "string") {
            content = contentData.content;
          }
        }
      } catch (error) {
        console.error("[open] Error reading applet:", error);
      }
    }
    
    context.launchApp("applet-viewer", {
      initialData: { path, content },
    });
    context.playCommandSound();
    return {
      output: i18n.t("apps.terminal.output.openedApplet", { applet: name.replace(/\.(app|html)$/i, "") }),
      isError: false,
    };
  }

  // Default: try to open with Finder for unknown types
  context.launchApp("finder", { initialData: { path: path.substring(0, path.lastIndexOf("/")) || "/" } });
  context.playCommandSound();
  return {
    output: i18n.t("apps.terminal.output.openedFile", { file: name }),
    isError: false,
  };
}



