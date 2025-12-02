import { Command, CommandContext, CommandResult } from "../types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";

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

    const fileName = args[0];
    const file = context.files.find((f) => f.name === fileName);

    if (!file) {
      return {
        output: `file not found: ${fileName}`,
        isError: true,
      };
    }

    if (file.isDirectory) {
      return {
        output: `${fileName} is a directory, not a file`,
        isError: true,
      };
    }

    // Get terminal store instance
    const terminalStore = useTerminalStore.getState();

    // Load file content
    let fileContent = "";

    try {
      // Check if this is a real file (in Documents or Images)
      if (
        file.path.startsWith("/Documents/") ||
        file.path.startsWith("/Images/")
      ) {
        // Get file metadata from the store to find UUID
        const fileStore = useFilesStore.getState();
        const fileMetadata = fileStore.getItem(file.path);

        if (fileMetadata && fileMetadata.uuid) {
          // Determine store based on file path
          const storeName = file.path.startsWith("/Documents/")
            ? STORES.DOCUMENTS
            : STORES.IMAGES;

          const contentData = await dbOperations.get<DocumentContent>(
            storeName,
            fileMetadata.uuid
          );

          if (contentData && contentData.content) {
            // Convert content to text
            if (contentData.content instanceof Blob) {
              fileContent = await contentData.content.text();
            } else if (typeof contentData.content === "string") {
              fileContent = contentData.content;
            }
          }
        }
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
    terminalStore.setVimPosition(0);
    terminalStore.setVimCursorLine(0);
    terminalStore.setVimCursorColumn(0);
    terminalStore.setVimMode("normal");

    return {
      output: `opening ${fileName} in vim...`,
      isError: false,
    };
  },
};
