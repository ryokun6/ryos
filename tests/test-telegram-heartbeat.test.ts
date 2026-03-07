import type { Redis } from "@upstash/redis";
import type { DailyNote } from "../api/_utils/_memory";
import { describe, expect, test } from "bun:test";
import {
  appendHeartbeatRecord,
  getHeartbeatRecordsForDate,
} from "../api/_utils/heartbeats";
import {
  buildTelegramHeartbeatHistoryContext,
  buildTelegramHeartbeatNoteContext,
  buildTelegramHeartbeatConversationContext,
  buildTelegramHeartbeatPrompt,
  buildTelegramHeartbeatRedisKey,
  buildTelegramHeartbeatStateSummary,
  formatTelegramConversationEntries,
  formatTelegramHeartbeatDailyNoteEntries,
  formatTelegramHeartbeatHistoryEntries,
  getTelegramHeartbeatAuthSecret,
  getTelegramHeartbeatSlot,
  isTelegramHeartbeatLegacyNoteEntry,
  parseTelegramHeartbeatResult,
  shouldSendTelegramHeartbeat,
  TELEGRAM_HEARTBEAT_CRON_PATH,
  TELEGRAM_HEARTBEAT_CRON_SCHEDULE,
  TELEGRAM_HEARTBEAT_SKIP_TOKEN,
  TELEGRAM_HEARTBEAT_TOPIC,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
} from "../api/_utils/telegram-heartbeat";
import { prepareRyoConversationModelInput } from "../api/_utils/ryo-conversation";

class FakeRedis {
  private readonly store = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }

  async set(key: string, value: unknown): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

function makeRedis(): Redis {
  return new FakeRedis() as unknown as Redis;
}

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

const sampleConversationHistory = [
  {
    role: "user" as const,
    content: "i still need to send the onboarding doc",
    createdAt: 400,
  },
  {
    role: "assistant" as const,
    content: "want me to draft the onboarding doc follow-up?",
    createdAt: 450,
  },
  {
    role: "user" as const,
    content: "done with that, now i need to review the cron behavior",
    createdAt: 500,
  },
];

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
      recentTelegramSnapshot:
        "- 2026-03-07T18:00:00.000Z user: done with the onboarding doc\n- 2026-03-07T18:05:00.000Z assistant: want me to review the cron behavior next?",
      heartbeatLogSnapshot:
        "- 09:30:00: [telegram heartbeat] sent - checking in about the onboarding doc edits",
    });

    expect(prompt).toContain("recent Telegram chat snapshot");
    expect(prompt).toContain("use memoryRead");
    expect(prompt).toContain("calendarControl");
    expect(prompt).toContain("stickiesControl");
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("Do not infer, resurrect, or repeat stale tasks");
    expect(prompt).toContain("fresh insight");
    expect(prompt).toContain("did not get a user response");
    expect(prompt).toContain("Do not mention that this message is automated");
    expect(prompt).toContain("RECENT TELEGRAM CHAT:");
    expect(prompt).toContain(TELEGRAM_HEARTBEAT_SKIP_TOKEN);
  });

  test("keeps daily-note context clean by ignoring legacy heartbeat strings", () => {
    const noteContext = buildTelegramHeartbeatNoteContext(sampleDailyNote);

    expect(isTelegramHeartbeatLegacyNoteEntry(sampleDailyNote.entries[1].content)).toBe(true);
    expect(noteContext.entries).toHaveLength(2);
    expect(noteContext.latestActionableTimestamp).toBe(300);
    expect(noteContext.entries.some((entry) => entry.content.startsWith("[telegram heartbeat]"))).toBe(
      false
    );
  });

  test("stores heartbeat executions in the dedicated heartbeats store", async () => {
    const redis = makeRedis();
    const timestamp = Date.UTC(2026, 2, 7, 18, 30, 0);

    await appendHeartbeatRecord(redis, "ryo", {
      timestamp,
      shouldSend: false,
      topic: TELEGRAM_HEARTBEAT_TOPIC,
      skipReason: "no-new-signals",
      stateSummary: "decision=no-new-signals",
      timeZone: "UTC",
    });
    await appendHeartbeatRecord(redis, "ryo", {
      timestamp: timestamp + 1,
      shouldSend: true,
      topic: "other-agent",
      message: "sent from another topic",
      stateSummary: "decision=sent",
      timeZone: "UTC",
    });

    const heartbeatRecords = await getHeartbeatRecordsForDate(
      redis,
      "ryo",
      "2026-03-07",
      TELEGRAM_HEARTBEAT_TOPIC
    );

    expect(heartbeatRecords).toHaveLength(1);
    expect(heartbeatRecords[0]).toMatchObject({
      shouldSend: false,
      topic: TELEGRAM_HEARTBEAT_TOPIC,
      skipReason: "no-new-signals",
      stateSummary: "decision=no-new-signals",
    });
  });

  test("skips when no current or no new signals exist", () => {
    const emptyHistory = buildTelegramHeartbeatHistoryContext([]);

    expect(
      shouldSendTelegramHeartbeat(
        buildTelegramHeartbeatNoteContext({
          ...sampleDailyNote,
          entries: sampleDailyNote.entries.filter((entry) =>
            entry.content.startsWith("[telegram heartbeat]")
          ),
        }),
        emptyHistory,
        buildTelegramHeartbeatConversationContext([])
      )
    ).toEqual({
      shouldSend: false,
      reason: "nothing current in daily notes or recent telegram chats needs attention",
      code: "no-current-signals",
    });

    expect(
      shouldSendTelegramHeartbeat(
        buildTelegramHeartbeatNoteContext({
          ...sampleDailyNote,
          entries: [
            {
              timestamp: 100,
              localTime: "09:00:00",
              content: "follow up on the onboarding doc edits",
            },
          ],
        }),
        buildTelegramHeartbeatHistoryContext([
          {
            id: "hb-1",
            timestamp: 200,
            shouldSend: false,
            topic: TELEGRAM_HEARTBEAT_TOPIC,
            message: null,
            skipReason: "no new daily-note items since the last heartbeat check",
            stateSummary: "decision=no-new-signals",
          },
        ]),
        buildTelegramHeartbeatConversationContext([
          {
            role: "user",
            content: "can you remind me about the onboarding doc?",
            createdAt: 150,
          },
        ])
      )
    ).toEqual({
      shouldSend: false,
      reason: "no new daily-note items or telegram task signals since the last heartbeat check",
      code: "no-new-signals",
    });
  });

  test("sends when recent telegram chat has a newer signal than the last heartbeat log", () => {
    const noteContext = buildTelegramHeartbeatNoteContext({
      ...sampleDailyNote,
      entries: sampleDailyNote.entries.filter((entry) =>
        entry.content.startsWith("[telegram heartbeat]")
      ),
    });

    expect(
      shouldSendTelegramHeartbeat(
        noteContext,
        buildTelegramHeartbeatHistoryContext([
          {
            id: "hb-1",
            timestamp: 350,
            shouldSend: true,
            topic: TELEGRAM_HEARTBEAT_TOPIC,
            message: "checking in about the onboarding doc edits",
            skipReason: null,
            stateSummary: "decision=sent",
          },
        ]),
        buildTelegramHeartbeatConversationContext(sampleConversationHistory)
      )
    ).toEqual({
      shouldSend: true,
      reason: "daily notes or recent telegram chats contain something new that may need attention",
      code: "send",
    });
  });

  test("formats entries, parses skip decisions, and builds state snapshots", () => {
    expect(formatTelegramHeartbeatDailyNoteEntries(sampleDailyNote.entries.slice(0, 1))).toContain(
      "09:00:00: follow up on the onboarding doc edits"
    );
    expect(
      formatTelegramHeartbeatHistoryEntries([
        {
          id: "hb-1",
          timestamp: 200,
          localTime: "09:30:00",
          shouldSend: false,
          topic: TELEGRAM_HEARTBEAT_TOPIC,
          message: null,
          skipReason: "nothing in today's daily notes needs attention",
          stateSummary: "decision=no-current-signals",
        },
      ])
    ).toContain("09:30:00: skipped - nothing in today's daily notes needs attention");
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
      buildTelegramHeartbeatStateSummary({
        noteContext: buildTelegramHeartbeatNoteContext(sampleDailyNote),
        historyContext: buildTelegramHeartbeatHistoryContext([
          {
            id: "hb-1",
            timestamp: 200,
            shouldSend: false,
            topic: TELEGRAM_HEARTBEAT_TOPIC,
            message: null,
            skipReason: "nothing in today's daily notes needs attention",
            stateSummary: "decision=no-current-signals",
          },
        ]),
        conversationContext: buildTelegramHeartbeatConversationContext(
          sampleConversationHistory
        ),
        decisionCode: "send",
      })
    ).toContain("decision=send");
  });

  test("formats recent telegram chats for prompt context", () => {
    expect(formatTelegramConversationEntries(sampleConversationHistory)).toContain(
      "user: done with that, now i need to review the cron behavior"
    );
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
            recentTelegramSnapshot:
              "- 2026-03-07T18:00:00.000Z user: done with the onboarding doc\n- 2026-03-07T18:05:00.000Z assistant: want me to review the cron behavior next?",
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
