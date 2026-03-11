import type { DailyNote, DailyNoteEntry } from "./_memory.js";
import type { HeartbeatRecord } from "./heartbeats.js";
import type { TelegramConversationMessage } from "./telegram-link.js";

export const TELEGRAM_HEARTBEAT_TARGET_USERNAME = "ryo";
export const TELEGRAM_HEARTBEAT_INTERVAL_MINUTES = 30;
export const TELEGRAM_HEARTBEAT_CRON_PATH = "/api/cron/telegram-heartbeat";
export const TELEGRAM_HEARTBEAT_CRON_SCHEDULE = "*/30 * * * *";
export const TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TELEGRAM_HEARTBEAT_TIME_ZONE = "America/Los_Angeles";
export const TELEGRAM_HEARTBEAT_TOPIC = "telegram-heartbeat";
export const TELEGRAM_HEARTBEAT_LOG_PREFIX = "[telegram heartbeat]";
export const TELEGRAM_HEARTBEAT_SKIP_TOKEN = "NO_HEARTBEAT";
export const TELEGRAM_HEARTBEAT_HISTORY_LOOKBACK_DAYS = 7;

export const TELEGRAM_BRIEFING_MORNING_HOUR = 8;
export const TELEGRAM_BRIEFING_EVENING_HOUR = 19;

export type TelegramBriefingType = "morning" | "evening" | null;

export function getCurrentBriefingType(
  date: Date = new Date(),
  timeZone: string = TELEGRAM_HEARTBEAT_TIME_ZONE
): TelegramBriefingType {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(
    parts.find((p) => p.type === "hour")?.value ?? "-1",
    10
  );
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "-1",
    10
  );

  if (hour === TELEGRAM_BRIEFING_MORNING_HOUR && minute < 30) return "morning";
  if (hour === TELEGRAM_BRIEFING_EVENING_HOUR && minute < 30) return "evening";
  return null;
}

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
  entries: DailyNoteEntry[];
  latestActionableTimestamp: number | null;
}

export interface TelegramHeartbeatHistoryContext {
  entries: HeartbeatRecord[];
  latestHeartbeatTimestamp: number | null;
}

export interface TelegramHeartbeatGateDecision {
  shouldSend: boolean;
  reason: string;
  code:
    | "no-current-signals"
    | "no-new-signals"
    | "send"
    | "briefing";
}

export interface TelegramHeartbeatPromptOptions {
  dailyNoteSnapshot: string;
  heartbeatLogSnapshot: string;
  recentTelegramSnapshot: string;
  briefingType?: TelegramBriefingType;
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

export function getTelegramConversationSinceLastHeartbeat(
  history: TelegramConversationMessage[],
  latestHeartbeatTimestamp: number | null
): TelegramConversationMessage[] {
  if (history.length === 0) {
    return [];
  }

  if (latestHeartbeatTimestamp === null) {
    return history.slice();
  }

  const firstNewUserIndex = history.findIndex(
    (message) =>
      message.role === "user" && message.createdAt > latestHeartbeatTimestamp
  );

  if (firstNewUserIndex === -1) {
    return [];
  }

  return history.slice(firstNewUserIndex);
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

export function isTelegramHeartbeatLegacyNoteEntry(content: string): boolean {
  return content.trim().toLowerCase().startsWith(TELEGRAM_HEARTBEAT_LOG_PREFIX);
}

export function buildTelegramHeartbeatNoteContext(
  note: DailyNote | null | undefined
): TelegramHeartbeatNoteContext {
  const entries = (note?.entries ?? []).filter(
    (entry) => !isTelegramHeartbeatLegacyNoteEntry(entry.content)
  );

  return {
    entries,
    latestActionableTimestamp:
      entries.length > 0
        ? Math.max(...entries.map((entry) => entry.timestamp))
        : null,
  };
}

export function buildTelegramHeartbeatHistoryContext(
  records: HeartbeatRecord[]
): TelegramHeartbeatHistoryContext {
  const entries = records
    .filter((record) => record.topic === TELEGRAM_HEARTBEAT_TOPIC)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    entries,
    latestHeartbeatTimestamp:
      entries.length > 0
        ? Math.max(...entries.map((entry) => entry.timestamp))
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
  historyContext: TelegramHeartbeatHistoryContext,
  conversationContext?: TelegramHeartbeatConversationContext,
  briefingType?: TelegramBriefingType
): TelegramHeartbeatGateDecision {
  if (briefingType) {
    return {
      shouldSend: true,
      reason: `scheduled ${briefingType} briefing`,
      code: "briefing",
    };
  }

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
    historyContext.latestHeartbeatTimestamp !== null &&
    latestSignalTimestamp <= historyContext.latestHeartbeatTimestamp
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

export function formatTelegramHeartbeatDailyNoteEntries(
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

function formatTelegramHeartbeatHistoryDetail(entry: HeartbeatRecord): string {
  const detail = entry.shouldSend
    ? entry.message || "sent a proactive check-in"
    : entry.skipReason || "nothing needed attention";

  return `${entry.shouldSend ? "sent" : "skipped"} - ${truncateHeartbeatText(
    normalizeHeartbeatText(detail),
    220
  )}`;
}

export function formatTelegramHeartbeatHistoryEntries(
  entries: HeartbeatRecord[],
  maxEntries: number = 6
): string {
  if (entries.length === 0) {
    return "(none)";
  }

  return entries
    .slice(-maxEntries)
    .map((entry) => {
      const timestamp = entry.localTime || entry.isoTimestamp || String(entry.timestamp);
      return `- ${timestamp}: ${formatTelegramHeartbeatHistoryDetail(entry)}`;
    })
    .join("\n");
}

function formatStateSummaryTimestamp(timestamp: number | null): string {
  return timestamp === null ? "(none)" : new Date(timestamp).toISOString();
}

export function buildTelegramHeartbeatStateSummary(args: {
  noteContext?: TelegramHeartbeatNoteContext;
  historyContext?: TelegramHeartbeatHistoryContext;
  conversationContext?: TelegramHeartbeatConversationContext;
  decisionCode: string;
}): string {
  return [
    `decision=${args.decisionCode}`,
    `note_entries=${args.noteContext?.entries.length ?? 0}`,
    `recent_messages=${args.conversationContext?.recentMessages.length ?? 0}`,
    `heartbeat_entries=${args.historyContext?.entries.length ?? 0}`,
    `latest_note=${formatStateSummaryTimestamp(
      args.noteContext?.latestActionableTimestamp ?? null
    )}`,
    `latest_user=${formatStateSummaryTimestamp(
      args.conversationContext?.latestUserTimestamp ?? null
    )}`,
    `latest_heartbeat=${formatStateSummaryTimestamp(
      args.historyContext?.latestHeartbeatTimestamp ?? null
    )}`,
  ].join("; ");
}

function buildBriefingInstructions(briefingType: "morning" | "evening"): string[] {
  if (briefingType === "morning") {
    return [
      "This is a MORNING BRIEFING. You must always send a message — never skip.",
      "Summarize today's open tasks, upcoming calendar events, and any pending items from recent conversations.",
      "Help the user plan their day ahead with a concise overview of what needs attention.",
      "If there are no specific tasks or updates, send a warm good-morning message and ask about their plans for the day.",
      "Use memoryRead and calendarControl proactively to gather context for the briefing.",
      "Keep the tone warm, energetic, and forward-looking.",
    ];
  }

  return [
    "This is an EVENING BRIEFING. You must always send a message — never skip.",
    "Reflect on today's activities: summarize what was accomplished, note what's still open, and highlight anything that needs follow-up tomorrow.",
    "If there are no specific tasks or updates, send a warm evening check-in — acknowledge the day and wish them a good evening.",
    "Use memoryRead proactively to recall what happened today.",
    "Keep the tone warm, reflective, and supportive.",
  ];
}

export function buildTelegramHeartbeatPrompt({
  dailyNoteSnapshot,
  heartbeatLogSnapshot,
  recentTelegramSnapshot,
  briefingType,
}: TelegramHeartbeatPromptOptions): string {
  const isBriefing = briefingType === "morning" || briefingType === "evening";

  const baseInstructions = isBriefing
    ? buildBriefingInstructions(briefingType)
    : [
        "Read today's daily-note snapshot and the recent Telegram chat snapshot first.",
        "Use those two snapshots together to infer the user's current open tasks, blockers, and likely next actions.",
        "Only continue the conversation naturally if you can add net-new value grounded in today's notes or recent Telegram chats.",
        "Before replying, internally extract: (1) open tasks that still need attention, (2) tasks already done or already acknowledged, and (3) ideas the assistant already suggested.",
        "If a task is already complete, already answered, or you do not have a fresh angle, skip the message.",
        "Pay special attention to the latest proactive heartbeat or check-in already sent by the assistant.",
        "If that earlier heartbeat did not get a user response, do not send another similar nudge unless you have materially new information, a clearly better angle, or a concrete next step the user has not already seen.",
        "If a full note or memory would help, use memoryRead before deciding.",
        "You may also use calendarControl, stickiesControl, and web_search when one of those tools would help with a concrete, current need from today's notes or recent Telegram chats.",
        `If nothing currently needs attention, reply exactly ${TELEGRAM_HEARTBEAT_SKIP_TOKEN} or ${TELEGRAM_HEARTBEAT_SKIP_TOKEN}: <brief reason>.`,
      ];

  const sharedInstructions = [
    "Treat the recent Telegram chat snapshot as the record of what has already been said, suggested, answered, or completed.",
    "Do not infer, resurrect, or repeat stale tasks when the recent chat or today's notes suggest they were already handled.",
    "If you do send a message, keep it concise, personal, and focused on one timely point.",
    "Every sent message must contribute at least one fresh insight, synthesis, next step, dependency reminder, or concise new fact.",
    "Do not paraphrase or lightly rewrite something already present in the recent Telegram chat snapshot or heartbeat log.",
    "Do not mention that this message is automated, scheduled, or a heartbeat.",
  ];

  return [
    ...baseInstructions,
    ...sharedInstructions,
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
