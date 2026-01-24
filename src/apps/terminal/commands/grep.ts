import { Command } from "../types";

export const grepCommand: Command = {
  name: "grep",
  description: "apps.terminal.commands.grep",
  usage: "grep <pattern> <filename>",
  handler: (args, context) => {
    if (args.length < 2) {
      return {
        output: "usage: grep <pattern> <filename>",
        isError: true,
      };
    }

    const pattern = args[0];
    const fileName = args[1];
    const file = context.files.find(
      (f: { name: string }) => f.name === fileName
    );

    if (!file) {
      return {
        output: `grep: ${fileName}: No such file or directory`,
        isError: true,
      };
    }

    if (file.isDirectory) {
      return {
        output: `grep: ${fileName}: Is a directory`,
        isError: true,
      };
    }

    // For virtual files without content, show a message
    if (!file.content) {
      return {
        output: `grep: ${fileName}: cannot read file`,
        isError: true,
      };
    }

    const content =
      typeof file.content === "string" ? file.content : "";
    
    try {
      const regex = new RegExp(pattern, "gi");
      const lines = content.split("\n");
      const matches = lines.filter((line: string) => regex.test(line));

      if (matches.length === 0) {
        return {
          output: "",
          isError: false,
        };
      }

      return {
        output: matches.join("\n"),
        isError: false,
      };
    } catch {
      // If regex is invalid, fall back to simple string matching
      const lines = content.split("\n");
      const matches = lines.filter((line: string) =>
        line.toLowerCase().includes(pattern.toLowerCase())
      );

      if (matches.length === 0) {
        return {
          output: "",
          isError: false,
        };
      }

      return {
        output: matches.join("\n"),
        isError: false,
      };
    }
  },
};
