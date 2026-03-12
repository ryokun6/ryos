import type { Redis } from "../api/_utils/redis.js";
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
  getCurrentBriefingType,
  getTelegramConversationSinceLastHeartbeat,
  getTelegramHeartbeatAuthSecret,
  getTelegramHeartbeatSlot,
  isTelegramHeartbeatLegacyNoteEntry,
  parseTelegramHeartbeatResult,
  shouldSendTelegramHeartbeat,
  TELEGRAM_BRIEFING_MORNING_HOUR,
  TELEGRAM_BRIEFING_EVENING_HOUR,
  TELEGRAM_HEARTBEAT_CRON_PATH,
  TELEGRAM_HEARTBEAT_CRON_SCHEDULE,
  TELEGRAM_HEARTBEAT_SKIP_TOKEN,
  TELEGRAM_HEARTBEAT_TOPIC,
  TELEGRAM_HEARTBEAT_TARGET_USERNAME,
} from "../api/_utils/telegram-heartbeat";
import { TELEGRAM_DEFAULT_MODEL } from "../api/_utils/_aiModels.js";
import { getTelegramModel } from "../api/cron/telegram-heartbeat.js";
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
  test("defaults heartbeat conversations to gpt-5.3 when TELEGRAM_BOT_MODEL is unset", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      {}
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(model).toBe("gpt-5.3");
    expect(logMessages).toHaveLength(0);
  });

  test("falls back heartbeat conversations to gpt-5.3 for unsupported TELEGRAM_BOT_MODEL", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      { TELEGRAM_BOT_MODEL: "not-a-real-model" }
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(logMessages).toEqual([
      'Unsupported TELEGRAM_BOT_MODEL "not-a-real-model", falling back to gpt-5.3',
    ]);
  });

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

  test("returns full telegram history when no heartbeat has been recorded yet", () => {
    expect(
      getTelegramConversationSinceLastHeartbeat(sampleConversationHistory, null)
    ).toEqual(sampleConversationHistory);
  });

  test("processes telegram chat starting from the first new user message after the last heartbeat", () => {
    const delta = getTelegramConversationSinceLastHeartbeat(
      [
        {
          role: "assistant" as const,
          content: "earlier proactive nudge",
          createdAt: 350,
        },
        ...sampleConversationHistory,
        {
          role: "assistant" as const,
          content: "i can review the cron behavior next",
          createdAt: 550,
        },
      ],
      375
    );

    expect(delta).toEqual([
      sampleConversationHistory[0],
      sampleConversationHistory[1],
      sampleConversationHistory[2],
      {
        role: "assistant",
        content: "i can review the cron behavior next",
        createdAt: 550,
      },
    ]);
  });

  test("ignores assistant-only activity after the last heartbeat", () => {
    expect(
      getTelegramConversationSinceLastHeartbeat(
        [
          {
            role: "assistant",
            content: "earlier proactive nudge",
            createdAt: 600,
          },
        ],
        500
      )
    ).toEqual([]);
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

  test("heartbeat conversations enable Google search grounding on gemini flash", async () => {
    const prepared = await prepareRyoConversationModelInput({
      channel: "telegram",
      username: TELEGRAM_HEARTBEAT_TARGET_USERNAME,
      model: "gemini-3-flash",
      messages: [
        {
          id: "heartbeat-2",
          role: "user",
          content: buildTelegramHeartbeatPrompt({
            dailyNoteSnapshot: "- 10:15:00: check the latest release notes",
            recentTelegramSnapshot:
              "- 2026-03-07T18:00:00.000Z user: what changed in the new release?",
            heartbeatLogSnapshot: "",
          }),
        },
      ],
    });

    expect("google_search" in prepared.tools).toBe(true);
    expect("web_search" in prepared.tools).toBe(false);
  });

  test("detects morning briefing window in the configured timezone", () => {
    const morningStart = new Date("2026-03-11T15:00:00.000Z"); // 8:00 AM PT
    const morningMid = new Date("2026-03-11T15:15:00.000Z"); // 8:15 AM PT
    const morningEnd = new Date("2026-03-11T15:30:00.000Z"); // 8:30 AM PT
    const afternoon = new Date("2026-03-11T21:00:00.000Z"); // 2:00 PM PT

    expect(getCurrentBriefingType(morningStart, "America/Los_Angeles")).toBe("morning");
    expect(getCurrentBriefingType(morningMid, "America/Los_Angeles")).toBe("morning");
    expect(getCurrentBriefingType(morningEnd, "America/Los_Angeles")).toBeNull();
    expect(getCurrentBriefingType(afternoon, "America/Los_Angeles")).toBeNull();
  });

  test("detects evening briefing window in the configured timezone", () => {
    const eveningStart = new Date("2026-03-12T02:00:00.000Z"); // 7:00 PM PT
    const eveningMid = new Date("2026-03-12T02:20:00.000Z"); // 7:20 PM PT
    const eveningEnd = new Date("2026-03-12T02:30:00.000Z"); // 7:30 PM PT
    const night = new Date("2026-03-12T05:00:00.000Z"); // 10:00 PM PT

    expect(getCurrentBriefingType(eveningStart, "America/Los_Angeles")).toBe("evening");
    expect(getCurrentBriefingType(eveningMid, "America/Los_Angeles")).toBe("evening");
    expect(getCurrentBriefingType(eveningEnd, "America/Los_Angeles")).toBeNull();
    expect(getCurrentBriefingType(night, "America/Los_Angeles")).toBeNull();
  });

  test("returns null for non-briefing hours", () => {
    const noon = new Date("2026-03-11T19:00:00.000Z"); // 12:00 PM PT
    const earlyMorning = new Date("2026-03-11T13:00:00.000Z"); // 6:00 AM PT

    expect(getCurrentBriefingType(noon, "America/Los_Angeles")).toBeNull();
    expect(getCurrentBriefingType(earlyMorning, "America/Los_Angeles")).toBeNull();
  });

  test("briefing type constants match expected hours", () => {
    expect(TELEGRAM_BRIEFING_MORNING_HOUR).toBe(8);
    expect(TELEGRAM_BRIEFING_EVENING_HOUR).toBe(19);
  });

  test("always sends during a briefing window even with no signals", () => {
    const emptyHistory = buildTelegramHeartbeatHistoryContext([]);
    const emptyNoteContext = buildTelegramHeartbeatNoteContext(null);
    const emptyConversation = buildTelegramHeartbeatConversationContext([]);

    expect(
      shouldSendTelegramHeartbeat(emptyNoteContext, emptyHistory, emptyConversation, "morning")
    ).toEqual({
      shouldSend: true,
      reason: "scheduled morning briefing",
      code: "briefing",
    });

    expect(
      shouldSendTelegramHeartbeat(emptyNoteContext, emptyHistory, emptyConversation, "evening")
    ).toEqual({
      shouldSend: true,
      reason: "scheduled evening briefing",
      code: "briefing",
    });
  });

  test("briefing bypasses no-new-signals gate", () => {
    const noteContext = buildTelegramHeartbeatNoteContext({
      ...sampleDailyNote,
      entries: [
        {
          timestamp: 100,
          localTime: "09:00:00",
          content: "follow up on the onboarding doc edits",
        },
      ],
    });
    const historyContext = buildTelegramHeartbeatHistoryContext([
      {
        id: "hb-1",
        timestamp: 200,
        shouldSend: false,
        topic: TELEGRAM_HEARTBEAT_TOPIC,
        message: null,
        skipReason: "no new daily-note items since the last heartbeat check",
        stateSummary: "decision=no-new-signals",
      },
    ]);

    expect(
      shouldSendTelegramHeartbeat(noteContext, historyContext, undefined, null)
    ).toEqual({
      shouldSend: false,
      reason: "no new daily-note items or telegram task signals since the last heartbeat check",
      code: "no-new-signals",
    });

    expect(
      shouldSendTelegramHeartbeat(noteContext, historyContext, undefined, "morning")
    ).toEqual({
      shouldSend: true,
      reason: "scheduled morning briefing",
      code: "briefing",
    });
  });

  test("morning briefing prompt includes day-planning instructions", () => {
    const prompt = buildTelegramHeartbeatPrompt({
      dailyNoteSnapshot: "- 08:00:00: team standup at 10am",
      recentTelegramSnapshot: "(none)",
      heartbeatLogSnapshot: "(none)",
      briefingType: "morning",
    });

    expect(prompt).toContain("MORNING BRIEFING");
    expect(prompt).toContain("plan their day");
    expect(prompt).toContain("must always send a message");
    expect(prompt).not.toContain(TELEGRAM_HEARTBEAT_SKIP_TOKEN);
  });

  test("evening briefing prompt includes reflection instructions", () => {
    const prompt = buildTelegramHeartbeatPrompt({
      dailyNoteSnapshot: "- 10:00:00: finished code review",
      recentTelegramSnapshot: "(none)",
      heartbeatLogSnapshot: "(none)",
      briefingType: "evening",
    });

    expect(prompt).toContain("EVENING BRIEFING");
    expect(prompt).toContain("Reflect on today");
    expect(prompt).toContain("must always send a message");
    expect(prompt).not.toContain(TELEGRAM_HEARTBEAT_SKIP_TOKEN);
  });

  test("regular heartbeat prompt still contains skip token when no briefing", () => {
    const prompt = buildTelegramHeartbeatPrompt({
      dailyNoteSnapshot: "(none)",
      recentTelegramSnapshot: "(none)",
      heartbeatLogSnapshot: "(none)",
      briefingType: null,
    });

    expect(prompt).toContain(TELEGRAM_HEARTBEAT_SKIP_TOKEN);
    expect(prompt).not.toContain("MORNING BRIEFING");
    expect(prompt).not.toContain("EVENING BRIEFING");
  });

  test("heartbeat can keep long-term memories without duplicating shared daily notes", async () => {
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
              "- 2026-03-07T18:00:00.000Z user: done with the onboarding doc",
            heartbeatLogSnapshot: "- 09:30:00: sent - earlier check-in",
          }),
        },
      ],
      preloadedMemoryContext: {
        userMemories: {
          version: 1,
          memories: [
            {
              key: "projects",
              summary: "User is actively iterating on ryOS ambient agent behavior.",
              updatedAt: 123,
            },
          ],
        },
        dailyNotesText: null,
        userTimeZone: "America/Los_Angeles",
      },
    });

    expect(prepared.dynamicSystemPrompt).toContain("## LONG-TERM MEMORIES");
    expect(prepared.dynamicSystemPrompt).toContain("projects: User is actively iterating");
    expect(prepared.dynamicSystemPrompt).not.toContain("## DAILY NOTES (recent journal)");
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
