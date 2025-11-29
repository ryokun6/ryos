import { Command, CommandResult } from "../types";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { track } from "@vercel/analytics";
import { TERMINAL_ANALYTICS } from "@/utils/analytics";

export const aiCommand: Command = {
  name: "ai",
  description: "Enter AI chat mode with ryo",
  usage: "ai [initial prompt]",
  handler: (args: string[]): CommandResult => {
    // Get terminal store instance
    const terminalStore = useTerminalStore.getState();

    // Enter AI chat mode
    terminalStore.setIsInAiMode(true);

    // Track chat start
    track(TERMINAL_ANALYTICS.CHAT_START);

    // Reset AI messages (system message is handled on backend)
    const chatsStore = useChatsStore.getState();
    chatsStore.setAiMessages([]);

    // If there's an initial prompt, we'll need to handle it in the component
    if (args.length > 0) {
      const initialPrompt = args.join(" ");

      // Track AI command
      track(TERMINAL_ANALYTICS.AI_COMMAND, { prompt: initialPrompt });

      // Store the initial prompt for the component to process
      terminalStore.setInitialAiPrompt(initialPrompt);

      return {
        output: `ask ryo anything. type 'exit' to return to terminal.\n→ from your command: ${initialPrompt}`,
        isError: false,
      };
    }

    return {
      output: `ask ryo anything. type 'exit' to return to terminal.`,
      isError: false,
    };
  },
};

// Create aliases for the AI command
export const chatCommand: Command = {
  ...aiCommand,
  name: "chat",
};

export const ryoCommand: Command = {
  ...aiCommand,
  name: "ryo",
};
