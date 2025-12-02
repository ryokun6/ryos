import { Command } from "../types";

export const echoCommand: Command = {
  name: "echo",
  description: "apps.terminal.commands.echo",
  usage: "echo <text>",
  handler: (args) => ({
    output: args.join(" "),
    isError: false,
  }),
};