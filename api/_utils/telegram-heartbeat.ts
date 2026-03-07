import type { DailyNote, DailyNoteEntry } from "./_memory.js";
import type { TelegramConversationMessage } from "./telegram-link.js";

export const TELEGRAM_HEARTBEAT_TARGET_USERNAME = "ryo";
export const TELEGRAM_HEARTBEAT_INTERVAL_MINUTES = 30;
export const TELEGRAM_HEARTBEAT_CRON_PATH = "/api/cron/telegram-heartbeat";
export const TELEGRAM_HEARTBEAT_CRON_SCHEDULE = "*/30 * * * *";
export const TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TELEGRAM_HEARTBEAT_TIME_ZONE = "America/Los_Angeles";
export const TELEGRAM_HEARTBEAT_LOG_PREFIX = "[telegram heartbeat]";
export const TELEGRAM_HEARTBEAT_SKIP_TOKEN = "NO_HEARTBEAT";

export function getTelegramHeartbeatAuthSecret(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const cronSecret = env.CRON_SECRET?.trim();
  return cronSecret || null;
}

export function getTelegramHeartbeatSlot(date: Date = new Date()): number {
  const intervalMs = TELEGRAM_HEARTBEAT_INTERVAL_MINUTES * 60 * 1000;
  return Math.floor(date.getTime() / intervalMs);
}

export function buildTelegramHeartbeatRedisKey(
  username: string,
  date: Date = new Date()
): string {
  return `telegram:heartbeat:${username.toLowerCase()}:${getTelegramHeartbeatSlot(date)}`;
}

export interface TelegramHeartbeatNoteContext {
  actionableEntries: DailyNoteEntry[];
  logEntries: DailyNoteEntry[];
  latestActionableTimestamp: number | null;
  latestLogTimestamp: number | null;
}

export interface TelegramHeartbeatGateDecision {
  shouldSend: boolean;
  reason: string;
  code:
    | "no-current-signals"
    | "no-new-signals"
    | "send";
}

export interface TelegramHeartbeatPromptOptions {
  dailyNoteSnapshot: string;
  heartbeatLogSnapshot: string;
  recentTelegramSnapshot: string;
}

export interface TelegramHeartbeatResult {
  shouldSend: boolean;
  replyText: string | null;
  reason: string | null;
}

export interface TelegramHeartbeatConversationContext {
  recentMessages: TelegramConversationMessage[];
  latestUserTimestamp: number | null;
  latestMessageTimestamp: number | null;
}

function normalizeHeartbeatText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateHeartbeatText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function isTelegramHeartbeatLogEntry(content: string): boolean {
  return content.trim().toLowerCase().startsWith(TELEGRAM_HEARTBEAT_LOG_PREFIX);
}

export function splitTelegramHeartbeatEntries(
  note: DailyNote | null | undefined
): TelegramHeartbeatNoteContext {
  const entries = note?.entries ?? [];
  const actionableEntries = entries.filter(
    (entry) => !isTelegramHeartbeatLogEntry(entry.content)
  );
  const logEntries = entries.filter((entry) =>
    isTelegramHeartbeatLogEntry(entry.content)
  );

  return {
    actionableEntries,
    logEntries,
    latestActionableTimestamp:
      actionableEntries.length > 0
        ? Math.max(...actionableEntries.map((entry) => entry.timestamp))
        : null,
    latestLogTimestamp:
      logEntries.length > 0
        ? Math.max(...logEntries.map((entry) => entry.timestamp))
        : null,
  };
}

function formatHeartbeatMessageTimestamp(message: TelegramConversationMessage): string {
  return new Date(message.createdAt).toISOString();
}

export function buildTelegramHeartbeatConversationContext(
  history: TelegramConversationMessage[],
  maxMessages: number = 8
): TelegramHeartbeatConversationContext {
  const recentMessages = history.slice(-Math.max(0, maxMessages));
  const latestUserTimestamp =
    recentMessages
      .filter((message) => message.role === "user")
      .reduce<number | null>(
        (latest, message) =>
          latest === null || message.createdAt > latest ? message.createdAt : latest,
        null
      );
  const latestMessageTimestamp =
    recentMessages.length > 0
      ? Math.max(...recentMessages.map((message) => message.createdAt))
      : null;

  return {
    recentMessages,
    latestUserTimestamp,
    latestMessageTimestamp,
  };
}

export function formatTelegramConversationEntries(
  messages: TelegramConversationMessage[],
  maxEntries: number = 8
): string {
  if (messages.length === 0) {
    return "(none)";
  }

  return messages
    .slice(-maxEntries)
    .map((message) => {
      const label = message.role === "assistant" ? "assistant" : "user";
      const content = message.imageUrl
        ? `[image] ${message.content}`
        : message.content;
      return `- ${formatHeartbeatMessageTimestamp(message)} ${label}: ${content}`;
    })
    .join("\n");
}

function getLatestSignalTimestamp(
  noteContext: TelegramHeartbeatNoteContext,
  conversationContext?: TelegramHeartbeatConversationContext
): number | null {
  return [noteContext.latestActionableTimestamp, conversationContext?.latestUserTimestamp ?? null]
    .filter((value): value is number => typeof value === "number")
    .reduce<number | null>(
      (latest, value) => (latest === null || value > latest ? value : latest),
      null
    );
}

export function shouldSendTelegramHeartbeat(
  noteContext: TelegramHeartbeatNoteContext,
  conversationContext?: TelegramHeartbeatConversationContext
): TelegramHeartbeatGateDecision {
  const latestSignalTimestamp = getLatestSignalTimestamp(
    noteContext,
    conversationContext
  );

  if (latestSignalTimestamp === null) {
    return {
      shouldSend: false,
      reason: "nothing current in daily notes or recent telegram chats needs attention",
      code: "no-current-signals",
    };
  }

  if (
    noteContext.latestLogTimestamp !== null &&
    latestSignalTimestamp <= noteContext.latestLogTimestamp
  ) {
    return {
      shouldSend: false,
      reason: "no new daily-note items or telegram task signals since the last heartbeat check",
      code: "no-new-signals",
    };
  }

  return {
    shouldSend: true,
    reason: "daily notes or recent telegram chats contain something new that may need attention",
    code: "send",
  };
}

export function formatTelegramHeartbeatEntries(
  entries: DailyNoteEntry[],
  maxEntries: number = 6
): string {
  if (entries.length === 0) {
    return "(none)";
  }

  return entries
    .slice(-maxEntries)
    .map((entry) => {
      const timestamp = entry.localTime || entry.isoTimestamp || String(entry.timestamp);
      return `- ${timestamp}: ${entry.content}`;
    })
    .join("\n");
}

export function buildTelegramHeartbeatPrompt({
  dailyNoteSnapshot,
  heartbeatLogSnapshot,
  recentTelegramSnapshot,
}: TelegramHeartbeatPromptOptions): string {
  return [
    "Read today's daily-note snapshot and the recent Telegram chat snapshot first.",
    "Use those two snapshots together to infer the user's current open tasks, blockers, and likely next actions.",
    "Treat the recent Telegram chat snapshot as the record of what has already been said, suggested, answered, or completed.",
    "Do not infer, resurrect, or repeat stale tasks when the recent chat or today's notes suggest they were already handled.",
    "Only continue the conversation naturally if you can add net-new value grounded in today's notes or recent Telegram chats.",
    "Before replying, internally extract: (1) open tasks that still need attention, (2) tasks already done or already acknowledged, and (3) ideas the assistant already suggested.",
    "If a task is already complete, already answered, or you do not have a fresh angle, skip the message.",
    "If a full note or memory would help, use memoryRead before deciding.",
    "Use other available Telegram-safe tools only when they help with one concrete, current need from today's notes or recent Telegram chats.",
    `If nothing currently needs attention, reply exactly ${TELEGRAM_HEARTBEAT_SKIP_TOKEN} or ${TELEGRAM_HEARTBEAT_SKIP_TOKEN}: <brief reason>.`,
    "If you do send a message, keep it concise, personal, and focused on one timely point.",
    "Every sent message must contribute at least one fresh insight, synthesis, next step, dependency reminder, or concise new fact.",
    "Do not paraphrase or lightly rewrite something already present in the recent Telegram chat snapshot or heartbeat log.",
    "Do not mention that this message is automated, scheduled, or a heartbeat.",
    "",
    "TODAY'S DAILY NOTES:",
    dailyNoteSnapshot || "(none)",
    "",
    "RECENT TELEGRAM CHAT:",
    recentTelegramSnapshot || "(none)",
    "",
    "RECENT HEARTBEAT LOG:",
    heartbeatLogSnapshot || "(none)",
  ].join("\n");
}

export function parseTelegramHeartbeatResult(text: string): TelegramHeartbeatResult {
  const normalized = text.trim();
  const match = normalized.match(
    new RegExp(`^${TELEGRAM_HEARTBEAT_SKIP_TOKEN}(?::\\s*(.+))?$`, "i")
  );

  if (match) {
    return {
      shouldSend: false,
      replyText: null,
      reason: match[1]?.trim() || "nothing needs attention right now",
    };
  }

  return {
    shouldSend: true,
    replyText: normalized,
    reason: null,
  };
}

export function buildTelegramHeartbeatLogEntry(args: {
  sent: boolean;
  reason?: string | null;
  replyText?: string | null;
}): string {
  const detail = args.sent
    ? args.replyText
      ? truncateHeartbeatText(normalizeHeartbeatText(args.replyText), 220)
      : "sent a proactive check-in"
    : truncateHeartbeatText(
        normalizeHeartbeatText(args.reason || "nothing needed attention"),
        220
      );

  return `${TELEGRAM_HEARTBEAT_LOG_PREFIX} ${
    args.sent ? "sent" : "skipped"
  } - ${detail}`;
}

function normalizeHeartbeatComparisonText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRepeatedTelegramHeartbeatReply(
  replyText: string,
  history: TelegramConversationMessage[],
  maxAssistantMessages: number = 6
): boolean {
  const normalizedReply = normalizeHeartbeatComparisonText(replyText);
  if (!normalizedReply) {
    return false;
  }

  return history
    .filter((message) => message.role === "assistant")
    .slice(-Math.max(0, maxAssistantMessages))
    .some((message) => {
      const normalizedMessage = normalizeHeartbeatComparisonText(message.content);
      if (!normalizedMessage) {
        return false;
      }

      return (
        normalizedReply === normalizedMessage ||
        normalizedReply.includes(normalizedMessage) ||
        normalizedMessage.includes(normalizedReply)
      );
    });
}
