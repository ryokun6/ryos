import { Command } from "../types";

export const aboutCommand: Command = {
  name: "about",
  description: "apps.terminal.commands.about",
  handler: (_, context) => {
    setTimeout(() => context.setIsAboutDialogOpen(true), 100);
    return {
      output: "opening about dialog...",
      isError: false,
    };
  },
};