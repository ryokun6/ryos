import { Command, CommandContext, CommandResult } from "../types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";

// Helpers
const normalizePath = (path: string): string => {
  const segments = path.split("/").filter(Boolean);
  const stack: string[] = [];

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      stack.pop();
    } else {
      stack.push(segment);
    }
  }

  return "/" + stack.join("/");
};

const resolvePath = (input: string, currentPath: string): string => {
  if (input.startsWith("/")) {
    return normalizePath(input);
  }
  const base = currentPath === "/" ? "" : currentPath;
  return normalizePath(`${base}/${input}`);
};

const getStoreForPath = (path: string): string | null => {
  if (path.startsWith("/Documents/")) return STORES.DOCUMENTS;
  if (path.startsWith("/Images/")) return STORES.IMAGES;
  if (path.startsWith("/Applets/")) return STORES.APPLETS;
  return null;
};

export const vimCommand: Command = {
  name: "vim",
  description: "apps.terminal.commands.vim",
  usage: "vim <filename>",
  handler: async (
    args: string[],
    context: CommandContext
  ): Promise<CommandResult> => {
    if (args.length === 0) {
      return {
        output: "usage: vim <filename>",
        isError: true,
      };
    }

    const targetInput = args[0];
    const resolvedPath = resolvePath(targetInput, context.currentPath);

    // Get terminal store instance
    const terminalStore = useTerminalStore.getState();
    const fileStore = useFilesStore.getState();
    const fileMetadata = fileStore.getItem(resolvedPath);
    const contextFile =
      context.files.find((f) => f.path === resolvedPath) ||
      context.files.find((f) => f.name === fileName);
    const fileName =
      fileMetadata?.name || resolvedPath.split("/").filter(Boolean).pop() || targetInput;

    // Directory guard
    if (fileMetadata?.isDirectory || contextFile?.isDirectory) {
      return {
        output: `${fileName} is a directory, not a file`,
        isError: true,
      };
    }

    // Load file content if it exists
    let fileContent = "";
    let isNewFile = false;

    try {
      if (fileMetadata || contextFile) {
        // Attempt to load content from IndexedDB when possible
        if (fileMetadata?.uuid) {
          const storeName = getStoreForPath(resolvedPath);
          if (storeName) {
            const contentData = await dbOperations.get<DocumentContent>(
              storeName,
              fileMetadata.uuid
            );

            if (contentData?.content) {
              if (contentData.content instanceof Blob) {
                fileContent = await contentData.content.text();
              } else if (typeof contentData.content === "string") {
                fileContent = contentData.content;
              }
            }
          }
        }

        // Fallback to any in-memory content on the item
        if (!fileContent && typeof fileMetadata?.content === "string") {
          fileContent = fileMetadata.content;
        } else if (!fileContent && typeof contextFile?.content === "string") {
          fileContent = contextFile.content;
        }
      } else {
        // New buffer
        isNewFile = true;
      }
    } catch (error) {
      console.error("Error reading file for vim:", error);
    }

    // Enter vim mode
    terminalStore.setIsInVimMode(true);
    terminalStore.setVimFile({
      name: fileName,
      content: fileContent || "",
    });
    terminalStore.setVimFilePath(resolvedPath);
    terminalStore.setVimOriginalContent(fileContent || "");
    terminalStore.setVimIsDirty(false);
    terminalStore.setVimIsNewFile(isNewFile);
    terminalStore.setVimPosition(0);
    terminalStore.setVimCursorLine(0);
    terminalStore.setVimCursorColumn(0);
    terminalStore.setVimMode("normal");

    return {
      output: `opening ${resolvedPath} in vim...`,
      isError: false,
    };
  },
};
