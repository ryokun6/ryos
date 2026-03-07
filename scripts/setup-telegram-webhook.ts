#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTelegramBotProfile,
  getTelegramBotUsername,
  setTelegramWebhook,
} from "../api/_utils/telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

async function loadEnvFile(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;

      const normalizedValue =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
          ? value.slice(1, -1)
          : value;

      process.env[key] = normalizedValue;
    }
  } catch {
    // Optional env file.
  }
}

function getArg(name: string): string | null {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function normalizeWebhookUrl(input: string): string {
  const trimmed = input.trim().replace(/\/$/, "");
  if (trimmed.endsWith("/api/webhooks/telegram")) {
    return trimmed;
  }
  return `${trimmed}/api/webhooks/telegram`;
}

await loadEnvFile(path.join(WORKSPACE_ROOT, ".env"));
await loadEnvFile(path.join(WORKSPACE_ROOT, ".env.local"));

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const rawWebhookUrl =
  getArg("url") ||
  process.env.TELEGRAM_WEBHOOK_URL ||
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

if (!secretToken) {
  console.error("Missing TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}

if (!rawWebhookUrl) {
  console.error(
    "Missing webhook URL. Pass --url https://your-app.example.com or set TELEGRAM_WEBHOOK_URL."
  );
  process.exit(1);
}

const webhookUrl = normalizeWebhookUrl(rawWebhookUrl);

try {
  const profile = await getTelegramBotProfile({ botToken });
  await setTelegramWebhook({
    botToken,
    webhookUrl,
    secretToken,
    allowedUpdates: ["message"],
  });

  console.log(`Webhook configured for @${profile.username || "unknown"}`);
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`ryOS deep-link bot username: @${getTelegramBotUsername()}`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Failed to configure Telegram webhook"
  );
  process.exit(1);
}
