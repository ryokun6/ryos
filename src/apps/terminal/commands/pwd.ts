import { Command } from "../types";

export const pwdCommand: Command = {
  name: "pwd",
  description: "apps.terminal.commands.pwd",
  handler: (_, context) => ({
    output: context.currentPath,
    isError: false,
  }),
};