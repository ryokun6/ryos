import { describe, expect, mock, test } from "bun:test";
import { createChatTools, TOOL_DESCRIPTIONS } from "../api/chat/tools/index.js";
import { TELEGRAM_CHAT_INSTRUCTIONS } from "../api/_utils/_aiPrompts.js";

describe("telegram mapsSearchPlaces tool profile", () => {
  const context = {
    log: mock(() => {}),
    logError: mock(() => {}),
    env: {},
    username: "ryo",
    timeZone: "America/Los_Angeles",
  };

  test("telegram profile uses Telegram-specific description for mapsSearchPlaces", () => {
    const tools = createChatTools(context, { profile: "telegram" });
    expect(tools.mapsSearchPlaces.description).toBe(
      TOOL_DESCRIPTIONS.mapsSearchPlacesTelegram
    );
    expect(tools.mapsSearchPlaces.description).toContain("appleMapsUrl");
    expect(tools.mapsSearchPlaces.description).toContain("Telegram");
  });

  test("chat (all) profile keeps ryOS place-card wording for mapsSearchPlaces", () => {
    const tools = createChatTools(context, { profile: "all" });
    expect(tools.mapsSearchPlaces.description).toBe(TOOL_DESCRIPTIONS.mapsSearchPlaces);
    expect(tools.mapsSearchPlaces.description).toContain("rich card");
    expect(tools.mapsSearchPlaces.description).not.toContain("Telegram DM");
    expect(tools.mapsSearchPlaces.description).not.toContain(
      "There is no rich place card in Telegram"
    );
  });
});

describe("telegram chat instructions for maps", () => {
  test("instructs listing appleMapsUrl for each mentioned place", () => {
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain("appleMapsUrl");
    expect(TELEGRAM_CHAT_INSTRUCTIONS).toContain("https://maps.apple.com/");
  });
});
