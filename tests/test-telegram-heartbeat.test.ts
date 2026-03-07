import type { DailyNote } from "../api/_utils/_memory";
import { describe, expect, test } from "bun:test";
import {
  buildTelegramHeartbeatLogEntry,
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  formatTelegramHeartbeatEntries,
  getTelegramHeartbeatAuthSecret,
  getTelegramHeartbeatSlot,
  parseTelegramHeartbeatResult,
  shouldSendTelegramHeartbeat,
  splitTelegramHeartbeatEntries,
  TELEGRAM_HEARTBEAT_CRON_PATH,
  TELEGRAM_HEARTBEAT_CRON_SCHEDULE,
  TELEGRAM_HEARTBEAT_SKIP_TOKEN,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
} from "../api/_utils/telegram-heartbeat";
import { prepareRyoConversationModelInput } from "../api/_utils/ryo-conversation";

const sampleDailyNote: DailyNote = {
  date: "2026-03-07",
  entries: [
    {
      timestamp: 100,
      localTime: "09:00:00",
      content: "follow up on the onboarding doc edits",
    },
    {
      timestamp: 200,
      localTime: "09:30:00",
      content: "[telegram heartbeat] sent - checking in about the onboarding doc edits",
    },
    {
      timestamp: 300,
      localTime: "10:15:00",
      content: "need to review the latest cron behavior",
    },
  ],
  processedForMemories: false,
  updatedAt: 300,
};

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
    const prompt = buildTelegramHeartbeatPrompt({
      dailyNoteSnapshot: "- 10:15:00: need to review the latest cron behavior",
      heartbeatLogSnapshot:
        "- 09:30:00: [telegram heartbeat] sent - checking in about the onboarding doc edits",
    });

    expect(prompt).toContain("Read today's daily-note snapshot first");
    expect(prompt).toContain("use memoryRead");
    expect(prompt).toContain("Telegram-safe tools");
    expect(prompt).toContain("Do not infer, resurrect, or repeat old tasks");
    expect(prompt).toContain("Do not mention that this message is automated");
    expect(prompt).toContain(TELEGRAM_HEARTBEAT_SKIP_TOKEN);
  });

  test("splits actionable note entries from heartbeat log entries", () => {
    const noteContext = splitTelegramHeartbeatEntries(sampleDailyNote);

    expect(noteContext.actionableEntries).toHaveLength(2);
    expect(noteContext.logEntries).toHaveLength(1);
    expect(noteContext.latestActionableTimestamp).toBe(300);
    expect(noteContext.latestLogTimestamp).toBe(200);
  });

  test("skips when no actionable notes or no new notes exist", () => {
    expect(
      shouldSendTelegramHeartbeat(
        splitTelegramHeartbeatEntries({
          ...sampleDailyNote,
          entries: sampleDailyNote.entries.filter((entry) =>
            entry.content.startsWith("[telegram heartbeat]")
          ),
        })
      )
    ).toEqual({
      shouldSend: false,
      reason: "nothing in today's daily notes needs attention",
      code: "no-actionable-notes",
    });

    expect(
      shouldSendTelegramHeartbeat(
        splitTelegramHeartbeatEntries({
          ...sampleDailyNote,
          entries: [
            {
              timestamp: 100,
              localTime: "09:00:00",
              content: "follow up on the onboarding doc edits",
            },
            {
              timestamp: 200,
              localTime: "09:30:00",
              content:
                "[telegram heartbeat] skipped - no new daily-note items since the last heartbeat check",
            },
          ],
        })
      )
    ).toEqual({
      shouldSend: false,
      reason: "no new daily-note items since the last heartbeat check",
      code: "no-new-actionable-notes",
    });
  });

  test("formats entries, parses skip decisions, and builds log lines", () => {
    expect(formatTelegramHeartbeatEntries(sampleDailyNote.entries.slice(0, 1))).toContain(
      "09:00:00: follow up on the onboarding doc edits"
    );
    expect(parseTelegramHeartbeatResult("NO_HEARTBEAT: nothing needs attention")).toEqual({
      shouldSend: false,
      replyText: null,
      reason: "nothing needs attention",
    });
    expect(parseTelegramHeartbeatResult("hey, want me to review the cron changes?")).toEqual({
      shouldSend: true,
      replyText: "hey, want me to review the cron changes?",
      reason: null,
    });
    expect(
      buildTelegramHeartbeatLogEntry({
        sent: false,
        reason: "nothing in today's daily notes needs attention",
      })
    ).toContain("[telegram heartbeat] skipped");
  });

  test("uses CRON_SECRET for heartbeat auth", () => {
    expect(
      getTelegramHeartbeatAuthSecret({
        CRON_SECRET: "cron-secret",
      } as NodeJS.ProcessEnv)
    ).toBe("cron-secret");
  });

  test("ignores telegram webhook secret and requires CRON_SECRET", () => {
    expect(
      getTelegramHeartbeatAuthSecret({
        TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
        CRON_SECRET: "cron-secret",
      } as NodeJS.ProcessEnv)
    ).toBe("cron-secret");
    expect(
      getTelegramHeartbeatAuthSecret({
        TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
      } as NodeJS.ProcessEnv)
    ).toBeNull();
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
          content: buildTelegramHeartbeatPrompt({
            dailyNoteSnapshot: "- 10:15:00: need to review the latest cron behavior",
            heartbeatLogSnapshot:
              "- 09:30:00: [telegram heartbeat] sent - checking in about the onboarding doc edits",
          }),
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
