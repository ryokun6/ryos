import { Command } from "../types";

export const mkdirCommand: Command = {
  name: "mkdir",
  description: "apps.terminal.commands.mkdir",
  usage: "mkdir <dir>",
  handler: () => ({
    output: "command not implemented: mkdir requires filesystem write access",
    isError: true,
  }),
};