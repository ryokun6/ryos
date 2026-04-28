/**
 * Unit tests for the tvControl tool schema.
 *
 * These verify the Zod-level validation rules so the AI gets clear errors
 * before a tool call ever reaches the runtime handler.
 */

import { describe, expect, test } from "bun:test";
import { tvControlSchema } from "../api/chat/tools/schemas";

describe("tvControlSchema", () => {
  test("accepts a valid 'list' call with no extra params", () => {
    const result = tvControlSchema.safeParse({ action: "list" });
    expect(result.success).toBe(true);
  });

  test("accepts 'tune' by channelId", () => {
    const result = tvControlSchema.safeParse({
      action: "tune",
      channelId: "ch3",
    });
    expect(result.success).toBe(true);
  });

  test("accepts 'tune' by channelNumber alone", () => {
    const result = tvControlSchema.safeParse({
      action: "tune",
      channelNumber: 2,
    });
    expect(result.success).toBe(true);
  });

  test("rejects 'tune' with neither channelId nor channelNumber", () => {
    const result = tvControlSchema.safeParse({ action: "tune" });
    expect(result.success).toBe(false);
  });

  test("accepts 'createChannel' with prompt only", () => {
    const result = tvControlSchema.safeParse({
      action: "createChannel",
      prompt: "lofi beats to study to",
    });
    expect(result.success).toBe(true);
  });

  test("accepts 'createChannel' with optional name override", () => {
    const result = tvControlSchema.safeParse({
      action: "createChannel",
      prompt: "lofi beats to study to",
      name: "Lofi Beats",
    });
    expect(result.success).toBe(true);
  });

  test("rejects 'createChannel' without prompt", () => {
    const result = tvControlSchema.safeParse({ action: "createChannel" });
    expect(result.success).toBe(false);
  });

  test("rejects 'createChannel' with empty prompt", () => {
    const result = tvControlSchema.safeParse({
      action: "createChannel",
      prompt: "  ",
    });
    expect(result.success).toBe(false);
  });

  test("rejects 'createChannel' name longer than 24 chars", () => {
    const result = tvControlSchema.safeParse({
      action: "createChannel",
      prompt: "lofi beats",
      name: "a".repeat(25),
    });
    expect(result.success).toBe(false);
  });

  test("rejects 'deleteChannel' without channelId", () => {
    const result = tvControlSchema.safeParse({ action: "deleteChannel" });
    expect(result.success).toBe(false);
  });

  test("accepts 'addVideo' with channelId + videoId", () => {
    const result = tvControlSchema.safeParse({
      action: "addVideo",
      channelId: "ch4",
      videoId: "dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  test("accepts 'addVideo' with channelId + url instead of videoId", () => {
    const result = tvControlSchema.safeParse({
      action: "addVideo",
      channelId: "ch4",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  test("rejects 'addVideo' without any video identifier", () => {
    const result = tvControlSchema.safeParse({
      action: "addVideo",
      channelId: "ch4",
    });
    expect(result.success).toBe(false);
  });

  test("rejects 'addVideo' without channelId", () => {
    const result = tvControlSchema.safeParse({
      action: "addVideo",
      videoId: "dQw4w9WgXcQ",
    });
    expect(result.success).toBe(false);
  });

  test("accepts 'removeVideo' with channelId + removeVideoId", () => {
    const result = tvControlSchema.safeParse({
      action: "removeVideo",
      channelId: "ch4",
      removeVideoId: "dQw4w9WgXcQ",
    });
    expect(result.success).toBe(true);
  });

  test("rejects 'removeVideo' missing identifiers", () => {
    expect(
      tvControlSchema.safeParse({ action: "removeVideo", channelId: "ch4" })
        .success
    ).toBe(false);
    expect(
      tvControlSchema.safeParse({
        action: "removeVideo",
        removeVideoId: "abc",
      }).success
    ).toBe(false);
  });

  test("rejects unknown actions", () => {
    const result = tvControlSchema.safeParse({ action: "explode" });
    expect(result.success).toBe(false);
  });
});
