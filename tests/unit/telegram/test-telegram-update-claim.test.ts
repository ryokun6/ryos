import { describe, expect, test } from "bun:test";
import type { RedisLike } from "../../../api/_utils/redis";
import {
  claimTelegramUpdate,
  hasProcessedTelegramUpdate,
  markTelegramUpdateProcessed,
} from "../../../api/_utils/telegram-link";
import { extractTelegramToolResultMessage } from "../../../api/webhooks/telegram";
import { FakeRedis } from "../../helpers/fake-redis";

function makeRedis(): RedisLike {
  return new FakeRedis() as unknown as RedisLike;
}

describe("claimTelegramUpdate", () => {
  test("only the first claim for an update wins", async () => {
    const redis = makeRedis();
    const updateId = 12345;

    expect(await claimTelegramUpdate(redis, updateId)).toBe(true);
    // A concurrent Telegram retry of the same update must be skipped so the AI
    // pipeline does not run twice in parallel (the source of the loop bug).
    expect(await claimTelegramUpdate(redis, updateId)).toBe(false);
    expect(await claimTelegramUpdate(redis, updateId)).toBe(false);
  });

  test("claiming marks the update as processed for the dedup check", async () => {
    const redis = makeRedis();
    const updateId = 67890;

    expect(await hasProcessedTelegramUpdate(redis, updateId)).toBe(false);
    expect(await claimTelegramUpdate(redis, updateId)).toBe(true);
    expect(await hasProcessedTelegramUpdate(redis, updateId)).toBe(true);
  });

  test("a previously processed update cannot be claimed", async () => {
    const redis = makeRedis();
    const updateId = 11111;

    await markTelegramUpdateProcessed(redis, updateId);
    expect(await claimTelegramUpdate(redis, updateId)).toBe(false);
  });

  test("different updates are claimed independently", async () => {
    const redis = makeRedis();

    expect(await claimTelegramUpdate(redis, 1)).toBe(true);
    expect(await claimTelegramUpdate(redis, 2)).toBe(true);
    expect(await claimTelegramUpdate(redis, 1)).toBe(false);
  });
});

describe("extractTelegramToolResultMessage", () => {
  test("returns a successful document confirmation message", () => {
    const result = extractTelegramToolResultMessage({
      success: true,
      message: "Created document 'todo.md'.",
      document: { path: "/Documents/todo.md", name: "todo.md", content: "x" },
    });
    expect(result).toEqual({
      message: "Created document 'todo.md'.",
      success: true,
    });
  });

  test("flags failed tool results so they don't override successes", () => {
    const result = extractTelegramToolResultMessage({
      success: false,
      message: "Document '/Documents/missing.md' not found.",
    });
    expect(result).toEqual({
      message: "Document '/Documents/missing.md' not found.",
      success: false,
    });
  });

  test("treats a missing success flag as truthy", () => {
    const result = extractTelegramToolResultMessage({ message: "Done." });
    expect(result).toEqual({ message: "Done.", success: true });
  });

  test("returns null when there is no usable message", () => {
    expect(extractTelegramToolResultMessage(null)).toBeNull();
    expect(extractTelegramToolResultMessage(undefined)).toBeNull();
    expect(extractTelegramToolResultMessage("just a string")).toBeNull();
    expect(extractTelegramToolResultMessage({ success: true })).toBeNull();
    expect(
      extractTelegramToolResultMessage({ success: true, message: "   " })
    ).toBeNull();
  });
});
