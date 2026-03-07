export const TELEGRAM_HEARTBEAT_TARGET_USERNAME = "ryo";
export const TELEGRAM_HEARTBEAT_INTERVAL_MINUTES = 30;
export const TELEGRAM_HEARTBEAT_CRON_PATH = "/api/cron/telegram-heartbeat";
export const TELEGRAM_HEARTBEAT_CRON_SCHEDULE = "*/30 * * * *";
export const TELEGRAM_HEARTBEAT_SLOT_TTL_SECONDS = 7 * 24 * 60 * 60;

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

export function buildTelegramHeartbeatPrompt(): string {
  return [
    "Send a proactive Telegram check-in to ryo.",
    "Continue the ongoing conversation naturally from the recent Telegram history.",
    "Ground yourself in the available memories and recent notes before replying.",
    "If a full memory or note would help, use memoryRead.",
    "Use other available Telegram-safe tools when they help you surface one concrete insight or useful offer of help.",
    "Focus on one timely, specific thread instead of giving a generic status ping.",
    "If nothing stands out, send a short warm check-in that still feels personal.",
    "Do not mention that this message is automated, scheduled, or a heartbeat.",
  ].join(" ");
}
