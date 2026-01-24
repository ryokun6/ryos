import { Command } from "../types";

// Track when the terminal "booted"
const bootTime = Date.now();

export const uptimeCommand: Command = {
  name: "uptime",
  description: "apps.terminal.commands.uptime",
  usage: "uptime",
  handler: () => {
    const now = Date.now();
    const uptimeMs = now - bootTime;

    const seconds = Math.floor(uptimeMs / 1000) % 60;
    const minutes = Math.floor(uptimeMs / (1000 * 60)) % 60;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60)) % 24;
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));

    const currentTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    let uptimeStr = "";
    if (days > 0) uptimeStr += `${days} day${days !== 1 ? "s" : ""}, `;
    if (hours > 0) uptimeStr += `${hours}:${minutes.toString().padStart(2, "0")}`;
    else uptimeStr += `${minutes} min${minutes !== 1 ? "s" : ""}`;

    return {
      output: ` ${currentTime}  up ${uptimeStr}, ${seconds} sec`,
      isError: false,
    };
  },
};
