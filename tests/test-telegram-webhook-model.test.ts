import { describe, expect, test } from "bun:test";
import { TELEGRAM_DEFAULT_MODEL } from "../api/_utils/_aiModels.js";
import { getTelegramModel } from "../api/webhooks/telegram.js";

describe("telegram webhook model selection", () => {
  test("defaults to gpt-5.3-chat-latest when TELEGRAM_BOT_MODEL is unset", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      {}
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(model).toBe("gpt-5.3-chat-latest");
    expect(logMessages).toHaveLength(0);
  });

  test("uses the configured TELEGRAM_BOT_MODEL when supported", () => {
    const model = getTelegramModel(() => undefined, {
      TELEGRAM_BOT_MODEL: "gpt-5.4",
    });

    expect(model).toBe("gpt-5.4");
  });

  test("falls back to gpt-5.3-chat-latest for unsupported TELEGRAM_BOT_MODEL", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      { TELEGRAM_BOT_MODEL: "not-a-real-model" }
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(logMessages).toEqual([
      'Unsupported TELEGRAM_BOT_MODEL "not-a-real-model", falling back to gpt-5.3-chat-latest',
    ]);
  });
});
