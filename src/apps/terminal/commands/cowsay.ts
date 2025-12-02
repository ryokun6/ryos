import { Command } from "../types";

const cowsay = (message: string): string => {
  const messageLength = message.length;
  const topBorder = ` ${"_".repeat(messageLength + 2)} `;
  const bottomBorder = ` ${"-".repeat(messageLength + 2)} `;

  const cow = `        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`;

  return `${topBorder}
< ${message} >
${bottomBorder}
${cow}`;
};

export const cowsayCommand: Command = {
  name: "cowsay",
  description: "apps.terminal.commands.cowsay",
  usage: "cowsay <text>",
  handler: (args, context) => {
    const message = args.join(" ") || "Moo!";
    // Play moo sound if available
    if (context.playMooSound) {
      context.playMooSound();
    }
    return {
      output: cowsay(message),
      isError: false,
    };
  },
};