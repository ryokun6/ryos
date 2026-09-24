import { describe, expect, test } from "bun:test";
import {
  TELEGRAM_DEFAULT_MODEL,
  getTelegramModel,
} from "../../../api/_utils/_aiModels.js";

describe("telegram webhook model selection", () => {
  test("defaults to gpt-6 when TELEGRAM_BOT_MODEL is unset", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      {}
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(model).toBe("gpt-6");
    expect(logMessages).toHaveLength(0);
  });

  test("ignores a non-default TELEGRAM_BOT_MODEL", () => {
    const logMessages: string[] = [];
    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      { TELEGRAM_BOT_MODEL: "gpt-5.5" }
    );

    expect(model).toBe("gpt-6");
    expect(logMessages[0]).toContain("Restricted TELEGRAM_BOT_MODEL");
  });

  test("falls back to gpt-6 for unsupported TELEGRAM_BOT_MODEL", () => {
    const logMessages: string[] = [];

    const model = getTelegramModel(
      (message) => logMessages.push(String(message)),
      { TELEGRAM_BOT_MODEL: "not-a-real-model" }
    );

    expect(model).toBe(TELEGRAM_DEFAULT_MODEL);
    expect(logMessages).toEqual([
      'Unsupported TELEGRAM_BOT_MODEL "not-a-real-model", falling back to gpt-6',
    ]);
  });
});
