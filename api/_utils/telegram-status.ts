import {
  deleteTelegramMessage,
  editTelegramMessageText,
  sendTelegramChatAction,
  sendTelegramMessage,
} from "./telegram.js";

export function getTelegramToolStatusText(
  toolName: string,
  input: unknown
): string {
  switch (toolName) {
    case "web_search":
    case "webSearch":
      return "Searching the web...";
    case "memoryRead":
      return "Checking memory...";
    case "memoryWrite":
      return "Saving to memory...";
    case "memoryDelete":
      return "Removing memory...";
    case "documentsControl":
      return getTelegramDocumentsStatusText(input);
    case "calendarControl":
      return getTelegramCalendarStatusText(input);
    case "stickiesControl":
      return getTelegramStickiesStatusText(input);
    default:
      return "Using a tool...";
  }
}

function getTelegramDocumentsStatusText(input: unknown): string {
  const action =
    input && typeof input === "object" && "action" in input
      ? String((input as { action?: unknown }).action || "")
      : "";

  switch (action) {
    case "list":
      return "Checking documents...";
    case "read":
      return "Reading document...";
    case "write":
      return "Saving document...";
    case "edit":
      return "Editing document...";
    default:
      return "Using documents...";
  }
}

function getTelegramCalendarStatusText(input: unknown): string {
  const action =
    input && typeof input === "object" && "action" in input
      ? String((input as { action?: unknown }).action || "")
      : "";

  switch (action) {
    case "list":
    case "listTodos":
      return "Checking calendar...";
    case "create":
    case "createTodo":
      return "Adding to calendar...";
    case "update":
    case "toggleTodo":
      return "Updating calendar...";
    case "delete":
    case "deleteTodo":
      return "Removing from calendar...";
    default:
      return "Using calendar...";
  }
}

function getTelegramStickiesStatusText(input: unknown): string {
  const action =
    input && typeof input === "object" && "action" in input
      ? String((input as { action?: unknown }).action || "")
      : "";

  switch (action) {
    case "list":
      return "Checking stickies...";
    case "create":
      return "Creating sticky note...";
    case "update":
      return "Updating sticky note...";
    case "delete":
      return "Deleting sticky note...";
    case "clear":
      return "Clearing sticky notes...";
    default:
      return "Using stickies...";
  }
}

type StatusReporterDeps = {
  sendMessage?: typeof sendTelegramMessage;
  editMessage?: typeof editTelegramMessageText;
  deleteMessage?: typeof deleteTelegramMessage;
  sendChatAction?: typeof sendTelegramChatAction;
};

type StatusReporterOptions = {
  botToken: string;
  chatId: string;
  logWarn?: (message: string, details?: unknown) => void;
  typingRefreshMs?: number;
  deps?: StatusReporterDeps;
};

export function createTelegramStatusReporter({
  botToken,
  chatId,
  logWarn,
  typingRefreshMs = 4000,
  deps = {},
}: StatusReporterOptions) {
  const sendMessage = deps.sendMessage ?? sendTelegramMessage;
  const editMessage = deps.editMessage ?? editTelegramMessageText;
  const deleteMessage = deps.deleteMessage ?? deleteTelegramMessage;
  const sendChatAction = deps.sendChatAction ?? sendTelegramChatAction;

  let statusMessageId: number | null = null;
  let lastStatusText: string | null = null;
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let queue = Promise.resolve();

  const logStatusWarning = (message: string, error: unknown) => {
    logWarn?.(message, {
      error: error instanceof Error ? error.message : String(error),
      chatId,
    });
  };

  const enqueue = async (operation: () => Promise<void>) => {
    queue = queue
      .then(operation)
      .catch((error) => logStatusWarning("Telegram status update failed", error));
    await queue;
  };

  const sendTyping = async () => {
    try {
      await sendChatAction({
        botToken,
        chatId,
        action: "typing",
      });
    } catch (error) {
      logStatusWarning("Telegram chat action failed", error);
    }
  };

  const updateStatus = async (text: string) => {
    if (text === lastStatusText) {
      return;
    }

    await enqueue(async () => {
      if (statusMessageId == null) {
        const messageId = await sendMessage({
          botToken,
          chatId,
          text,
          disableNotification: true,
        });
        if (typeof messageId === "number") {
          statusMessageId = messageId;
          lastStatusText = text;
        }
        return;
      }

      await editMessage({
        botToken,
        chatId,
        messageId: statusMessageId,
        text,
      });
      lastStatusText = text;
    });
  };

  return {
    async start() {
      await sendTyping();
      if (typingTimer == null) {
        typingTimer = setInterval(() => {
          void sendTyping();
        }, typingRefreshMs);
        typingTimer.unref?.();
      }
    },

    async markTool(toolName: string, input: unknown) {
      await updateStatus(getTelegramToolStatusText(toolName, input));
    },

    async markThinking() {
      // Keep the most recent tool status visible while typing continues.
    },

    async dispose() {
      if (typingTimer != null) {
        clearInterval(typingTimer);
        typingTimer = null;
      }

      await enqueue(async () => {
        if (statusMessageId == null) {
          return;
        }

        try {
          await deleteMessage({
            botToken,
            chatId,
            messageId: statusMessageId,
          });
        } finally {
          statusMessageId = null;
          lastStatusText = null;
        }
      });
    },
  };
}
