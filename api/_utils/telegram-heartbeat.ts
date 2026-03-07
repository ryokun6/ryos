import type { DailyNote, DailyNoteEntry } from "./_memory.js";

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
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    return webhookSecret;
  }

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
  code: "no-actionable-notes" | "no-new-actionable-notes" | "send";
}

export interface TelegramHeartbeatPromptOptions {
  dailyNoteSnapshot: string;
  heartbeatLogSnapshot: string;
}

export interface TelegramHeartbeatResult {
  shouldSend: boolean;
  replyText: string | null;
  reason: string | null;
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

export function shouldSendTelegramHeartbeat(
  noteContext: TelegramHeartbeatNoteContext
): TelegramHeartbeatGateDecision {
  if (noteContext.actionableEntries.length === 0) {
    return {
      shouldSend: false,
      reason: "nothing in today's daily notes needs attention",
      code: "no-actionable-notes",
    };
  }

  if (
    noteContext.latestActionableTimestamp !== null &&
    noteContext.latestLogTimestamp !== null &&
    noteContext.latestActionableTimestamp <= noteContext.latestLogTimestamp
  ) {
    return {
      shouldSend: false,
      reason: "no new daily-note items since the last heartbeat check",
      code: "no-new-actionable-notes",
    };
  }

  return {
    shouldSend: true,
    reason: "daily notes contain something new that may need attention",
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
}: TelegramHeartbeatPromptOptions): string {
  return [
    "Read today's daily-note snapshot first. Treat it as the source of truth for what currently needs attention.",
    "Do not infer, resurrect, or repeat old tasks from prior Telegram chats unless today's daily notes explicitly show they still need attention.",
    "Continue the conversation naturally only if today's daily notes contain something current and actionable.",
    "If a full note or memory would help, use memoryRead before deciding.",
    "Use other available Telegram-safe tools only when they help with one concrete, current need from today's daily notes.",
    `If nothing currently needs attention, reply exactly ${TELEGRAM_HEARTBEAT_SKIP_TOKEN} or ${TELEGRAM_HEARTBEAT_SKIP_TOKEN}: <brief reason>.`,
    "If you do send a message, keep it concise, personal, and focused on one timely point.",
    "Do not mention that this message is automated, scheduled, or a heartbeat.",
    "",
    "TODAY'S DAILY NOTES:",
    dailyNoteSnapshot || "(none)",
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
