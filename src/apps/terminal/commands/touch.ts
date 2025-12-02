import { Command } from "../types";

export const touchCommand: Command = {
  name: "touch",
  description: "apps.terminal.commands.touch",
  usage: "touch <filename>",
  handler: async (args, context) => {
    if (args.length === 0) {
      return {
        output: "usage: touch <filename>",
        isError: true,
      };
    }

    const newFileName = args[0];

    // Check if file already exists
    if (context.files.find((f) => f.name === newFileName)) {
      return {
        output: `file already exists: ${newFileName}`,
        isError: true,
      };
    }

    // Create empty file
    await context.saveFile({
      name: newFileName,
      path: `${context.currentPath}/${newFileName}`,
      content: "",
      type: "text",
      icon: "/icons/file-text.png",
    });

    return {
      output: `created file: ${newFileName}`,
      isError: false,
    };
  },
};