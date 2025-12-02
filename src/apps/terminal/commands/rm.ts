import { Command } from "../types";

export const rmCommand: Command = {
  name: "rm",
  description: "apps.terminal.commands.rm",
  usage: "rm <filename>",
  handler: (args, context) => {
    if (args.length === 0) {
      return {
        output: "usage: rm <filename>",
        isError: true,
      };
    }

    const fileToDelete = args[0];
    const fileObj = context.files.find((f) => f.name === fileToDelete);

    if (!fileObj) {
      return {
        output: `file not found: ${fileToDelete}`,
        isError: true,
      };
    }

    context.moveToTrash(fileObj);
    return {
      output: `moved to trash: ${fileToDelete}`,
      isError: false,
    };
  },
};