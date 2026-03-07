import { describe, expect, test } from "bun:test";
import {
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  getTelegramHeartbeatAuthSecret,
  getTelegramHeartbeatSlot,
  TELEGRAM_HEARTBEAT_CRON_PATH,
  TELEGRAM_HEARTBEAT_CRON_SCHEDULE,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
} from "../api/_utils/telegram-heartbeat";
import { prepareRyoConversationModelInput } from "../api/_utils/ryo-conversation";

describe("telegram heartbeat helpers", () => {
  test("builds stable slot keys for 30-minute windows", () => {
    const firstWindow = new Date("2026-03-07T18:00:00.000Z");
    const sameWindow = new Date("2026-03-07T18:29:59.999Z");
    const nextWindow = new Date("2026-03-07T18:30:00.000Z");

    expect(getTelegramHeartbeatSlot(firstWindow)).toBe(
      getTelegramHeartbeatSlot(sameWindow)
    );
    expect(getTelegramHeartbeatSlot(nextWindow)).toBe(
      getTelegramHeartbeatSlot(firstWindow) + 1
    );
    expect(buildTelegramHeartbeatRedisKey("Ryo", firstWindow)).toBe(
      buildTelegramHeartbeatRedisKey("ryo", sameWindow)
    );
    expect(buildTelegramHeartbeatRedisKey("ryo", nextWindow)).not.toBe(
      buildTelegramHeartbeatRedisKey("ryo", firstWindow)
    );
  });

  test("keeps the heartbeat prompt proactive and tool-aware", () => {
    const prompt = buildTelegramHeartbeatPrompt();

    expect(prompt).toContain("Continue the ongoing conversation naturally");
    expect(prompt).toContain("use memoryRead");
    expect(prompt).toContain("Telegram-safe tools");
    expect(prompt).toContain("Do not mention that this message is automated");
  });

  test("prefers the telegram webhook secret for heartbeat auth", () => {
    expect(
      getTelegramHeartbeatAuthSecret({
        TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
        CRON_SECRET: "cron-secret",
      } as NodeJS.ProcessEnv)
    ).toBe("telegram-secret");
  });

  test("falls back to CRON_SECRET when no telegram webhook secret exists", () => {
    expect(
      getTelegramHeartbeatAuthSecret({
        CRON_SECRET: "cron-secret",
      } as NodeJS.ProcessEnv)
    ).toBe("cron-secret");
    expect(getTelegramHeartbeatAuthSecret({} as NodeJS.ProcessEnv)).toBeNull();
  });

  test("heartbeat conversations keep telegram-safe tools available", async () => {
    const prepared = await prepareRyoConversationModelInput({
      channel: "telegram",
      username: TELEGRAM_HEARTBEAT_TARGET_USERNAME,
      model: "gpt-5.4",
      messages: [
        {
          id: "heartbeat-1",
          role: "user",
          content: buildTelegramHeartbeatPrompt(),
        },
      ],
    });

    expect("memoryRead" in prepared.tools).toBe(true);
    expect("memoryWrite" in prepared.tools).toBe(true);
    expect("calendarControl" in prepared.tools).toBe(true);
    expect("stickiesControl" in prepared.tools).toBe(true);
    expect("web_search" in prepared.tools).toBe(true);
  });
});

describe("vercel cron wiring", () => {
  test("registers the telegram heartbeat cron every 30 minutes", async () => {
    const config = await Bun.file(new URL("../vercel.json", import.meta.url)).json();
    expect(config).toHaveProperty("crons");

    const crons = Array.isArray(config.crons) ? config.crons : [];
    expect(crons).toContainEqual({
      path: TELEGRAM_HEARTBEAT_CRON_PATH,
      schedule: TELEGRAM_HEARTBEAT_CRON_SCHEDULE,
    });
  });
});
