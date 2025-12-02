import { Command } from "../types";

export const dateCommand: Command = {
  name: "date",
  description: "apps.terminal.commands.date",
  handler: () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      timeZoneName: "short",
    };
    return {
      output: now.toLocaleString("en-US", options),
      isError: false,
    };
  },
};