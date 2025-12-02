import { Command } from "../types";

export const clearCommand: Command = {
  name: "clear",
  description: "apps.terminal.commands.clear",
  handler: () => ({
    output: "",
    isError: false,
  }),
};