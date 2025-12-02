import { Command } from "../types";

export const whoamiCommand: Command = {
  name: "whoami",
  description: "apps.terminal.commands.whoami",
  handler: (_, context) => ({
    output: context.username || "you",
    isError: false,
  }),
};