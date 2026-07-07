import { describe, expect, mock, test } from "bun:test";
import {
  getLocationSchema,
  getWeatherSchema,
} from "../api/chat/tools/schemas.js";
import { createChatTools, TOOL_DESCRIPTIONS } from "../api/chat/tools/index.js";
import { resolveStaleToolApprovals } from "../api/_utils/ryo-conversation.js";
import {
  celsiusToFahrenheit,
  describeWeatherCode,
} from "../src/shared/tools/weather.js";
import { APPROVAL_GATED_TOOL_NAME_SET } from "../src/shared/tools/approvalGated.js";
import { SERVER_EXECUTED_TOOL_NAME_SET } from "../src/shared/tools/serverExecuted.js";
import { sendAutomaticallyWhenApprovalsSettled } from "../src/apps/chats/tools/toolApprovals.js";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe("getWeatherSchema", () => {
  test("accepts empty input (server falls back to IP geolocation)", () => {
    expect(getWeatherSchema.safeParse({}).success).toBe(true);
  });

  test("accepts a place name", () => {
    const parsed = getWeatherSchema.safeParse({ location: "Tokyo" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location).toBe("Tokyo");
  });

  test("accepts a latitude/longitude pair", () => {
    const parsed = getWeatherSchema.safeParse({
      latitude: 37.7749,
      longitude: -122.4194,
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects latitude without longitude (and vice versa)", () => {
    expect(getWeatherSchema.safeParse({ latitude: 37.7749 }).success).toBe(
      false
    );
    expect(getWeatherSchema.safeParse({ longitude: -122.4194 }).success).toBe(
      false
    );
  });

  test("rejects out-of-range coordinates", () => {
    expect(
      getWeatherSchema.safeParse({ latitude: 91, longitude: 0 }).success
    ).toBe(false);
    expect(
      getWeatherSchema.safeParse({ latitude: 0, longitude: 181 }).success
    ).toBe(false);
  });

  test("normalizes a blank location to undefined", () => {
    const parsed = getWeatherSchema.safeParse({ location: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location).toBeUndefined();
  });
});

describe("getLocationSchema", () => {
  test("accepts empty input", () => {
    expect(getLocationSchema.safeParse({}).success).toBe(true);
  });

  test("accepts a short reason", () => {
    const parsed = getLocationSchema.safeParse({
      reason: "to check the weather near you",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reason).toBe("to check the weather near you");
    }
  });

  test("rejects an oversized reason", () => {
    expect(
      getLocationSchema.safeParse({ reason: "x".repeat(201) }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

describe("weather helpers", () => {
  test("celsiusToFahrenheit rounds to whole degrees", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(22)).toBe(72);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });

  test("describeWeatherCode maps WMO codes to readable conditions", () => {
    expect(describeWeatherCode(0)).toBe("Clear sky");
    expect(describeWeatherCode(2)).toBe("Partly cloudy");
    expect(describeWeatherCode(63)).toBe("Rain");
    expect(describeWeatherCode(95)).toBe("Thunderstorm");
    expect(describeWeatherCode(12345)).toBe("Unknown");
  });
});

describe("tool execution metadata", () => {
  test("getWeather is server-executed; getLocation is not", () => {
    expect(SERVER_EXECUTED_TOOL_NAME_SET.has("getWeather")).toBe(true);
    expect(SERVER_EXECUTED_TOOL_NAME_SET.has("getLocation")).toBe(false);
  });

  test("getLocation is approval-gated; getWeather is not", () => {
    expect(APPROVAL_GATED_TOOL_NAME_SET.has("getLocation")).toBe(true);
    expect(APPROVAL_GATED_TOOL_NAME_SET.has("getWeather")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tool registration / profiles
// ---------------------------------------------------------------------------

describe("createChatTools weather/location registration", () => {
  const context = {
    log: mock(() => {}),
    logError: mock(() => {}),
    env: {},
    username: "ryo",
    timeZone: "America/Los_Angeles",
  };

  test("all profile registers getWeather (server execute) and getLocation (needsApproval, client)", () => {
    const tools = createChatTools(context, { profile: "all" }) as Record<
      string,
      { description?: string; execute?: unknown; needsApproval?: boolean }
    >;
    expect(tools.getWeather).toBeDefined();
    expect(typeof tools.getWeather.execute).toBe("function");
    expect(tools.getWeather.description).toBe(TOOL_DESCRIPTIONS.getWeather);

    expect(tools.getLocation).toBeDefined();
    expect(tools.getLocation.needsApproval).toBe(true);
    // Client-executed after user approval — the server must not execute it.
    expect(tools.getLocation.execute).toBeUndefined();
  });

  test("telegram profile keeps getWeather but omits getLocation (no browser geolocation)", () => {
    const tools = createChatTools(context, { profile: "telegram" }) as Record<
      string,
      unknown
    >;
    expect(tools.getWeather).toBeDefined();
    expect(tools.getLocation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Approval auto-send predicate
// ---------------------------------------------------------------------------

function assistantMessage(parts: unknown[]): UIMessage {
  return { id: "a1", role: "assistant", parts } as unknown as UIMessage;
}

describe("sendAutomaticallyWhenApprovalsSettled", () => {
  test("does not send while an approval request is unanswered", () => {
    const messages = [
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "approval-requested",
          input: {},
          approval: { id: "appr-1" },
        },
      ]),
    ];
    expect(sendAutomaticallyWhenApprovalsSettled({ messages })).toBe(false);
  });

  test("holds the send for an APPROVED getLocation until the client posts output", () => {
    const messages = [
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "approval-responded",
          input: {},
          approval: { id: "appr-1", approved: true },
        },
      ]),
    ];
    expect(sendAutomaticallyWhenApprovalsSettled({ messages })).toBe(false);
  });

  test("sends once the approved tool has output", () => {
    const messages = [
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "output-available",
          input: {},
          output: { success: true },
          approval: { id: "appr-1", approved: true },
        },
      ]),
    ];
    expect(sendAutomaticallyWhenApprovalsSettled({ messages })).toBe(true);
  });

  test("sends immediately on denial (server converts it to execution-denied)", () => {
    const messages = [
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "approval-responded",
          input: {},
          approval: { id: "appr-1", approved: false, reason: "declined" },
        },
      ]),
    ];
    expect(sendAutomaticallyWhenApprovalsSettled({ messages })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Server-side stale approval sanitation
// ---------------------------------------------------------------------------

describe("resolveStaleToolApprovals", () => {
  test("converts an unanswered approval request into output-denied", () => {
    const [sanitized] = resolveStaleToolApprovals([
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "approval-requested",
          input: {},
          approval: { id: "appr-1" },
        },
      ]),
    ]);
    const part = (sanitized.parts as Array<Record<string, unknown>>)[0];
    expect(part.state).toBe("output-denied");
    expect(part.approval).toMatchObject({ id: "appr-1", approved: false });
  });

  test("converts an approved-but-never-executed call into output-denied", () => {
    const [sanitized] = resolveStaleToolApprovals([
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "approval-responded",
          input: {},
          approval: { id: "appr-1", approved: true },
        },
      ]),
    ]);
    const part = (sanitized.parts as Array<Record<string, unknown>>)[0];
    expect(part.state).toBe("output-denied");
    expect(part.approval).toMatchObject({ id: "appr-1", approved: false });
  });

  test("leaves resolved and denial parts untouched", () => {
    const original = [
      assistantMessage([
        {
          type: "tool-getLocation",
          toolCallId: "call-1",
          state: "output-available",
          input: {},
          output: { success: true },
          approval: { id: "appr-1", approved: true },
        },
        {
          type: "tool-getLocation",
          toolCallId: "call-2",
          state: "approval-responded",
          input: {},
          approval: { id: "appr-2", approved: false },
        },
        { type: "text", text: "hello" },
      ]),
    ];
    const [sanitized] = resolveStaleToolApprovals(original);
    expect(sanitized).toBe(original[0]);
  });
});
