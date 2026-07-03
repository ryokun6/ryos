import { describe, expect, test } from "bun:test";
import { settingsSchema } from "../api/chat/tools/schemas";

describe("settings language schema", () => {
  test("accepts both Chinese locale variants", () => {
    expect(settingsSchema.safeParse({ language: "zh-CN" }).success).toBe(true);
    expect(settingsSchema.safeParse({ language: "zh-TW" }).success).toBe(true);
  });

  test("rejects unsupported Chinese regions", () => {
    expect(settingsSchema.safeParse({ language: "zh-HK" }).success).toBe(false);
  });
});
