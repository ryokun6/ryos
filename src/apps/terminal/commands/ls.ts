import { Command } from "../types";
import i18n from "@/lib/i18n";

export const lsCommand: Command = {
  name: "ls",
  description: "apps.terminal.commands.ls",
  handler: (_, context) => {
    if (context.files.length === 0) {
      return { output: i18n.t("apps.terminal.output.noFilesFound"), isError: false };
    }
    return {
      output: context.files
        .map((file) => (file.isDirectory ? file.name : file.name))
        .join("\n"),
      isError: false,
    };
  },
};