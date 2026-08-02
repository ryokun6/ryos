#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  checkBidCurrency,
  mergeItemsPreservingActiveReservations,
  withStuffShareLock,
} from "../../../api/stuff/_helpers/_shareMutations";
import type {
  StuffShareItem,
  StuffShareReservation,
} from "../../../api/stuff/_helpers/_types";
import { FakeRedis } from "../../helpers/fake-redis";
import { redisKeys } from "../../../src/shared/redisKeys";

const baseItem = (overrides: Partial<StuffShareItem> = {}): StuffShareItem => ({
  id: "item-1",
  title: "Lamp",
  notes: "",
  tagNames: [],
  status: "for_sale",
  prices: { currency: "USD", discounted: 40 },
  quantity: 1,
  ...overrides,
});

describe("mergeItemsPreservingActiveReservations", () => {
  test("forces reserved status when an active reservation exists", () => {
    const reservations: StuffShareReservation[] = [
      {
        id: "r1",
        itemId: "item-1",
        username: "buyer",
        createdAt: 1,
        status: "active",
      },
    ];
    const merged = mergeItemsPreservingActiveReservations(
      [baseItem({ status: "for_sale" }), baseItem({ id: "item-2", status: "stowed" })],
      reservations
    );
    expect(merged[0]?.status).toBe("reserved");
    expect(merged[1]?.status).toBe("stowed");
  });

  test("ignores cancelled reservations", () => {
    const reservations: StuffShareReservation[] = [
      {
        id: "r1",
        itemId: "item-1",
        username: "buyer",
        createdAt: 1,
        status: "cancelled",
      },
    ];
    const merged = mergeItemsPreservingActiveReservations(
      [baseItem({ status: "for_sale" })],
      reservations
    );
    expect(merged[0]?.status).toBe("for_sale");
  });
});

describe("checkBidCurrency", () => {
  test("accepts matching currency (case-insensitive)", () => {
    expect(
      checkBidCurrency({ listingCurrency: "usd", bidCurrency: "USD" })
    ).toEqual({ ok: true, currency: "USD" });
  });

  test("defaults missing bid currency to listing currency", () => {
    expect(
      checkBidCurrency({ listingCurrency: "EUR", bidCurrency: undefined })
    ).toEqual({ ok: true, currency: "EUR" });
  });

  test("rejects mismatched currency", () => {
    expect(
      checkBidCurrency({ listingCurrency: "USD", bidCurrency: "EUR" })
    ).toEqual({
      ok: false,
      error: "currency_mismatch",
      expected: "USD",
      received: "EUR",
    });
  });
});

describe("withStuffShareLock", () => {
  test("serializes concurrent mutations on the same share", async () => {
    const redis = new FakeRedis();
    const shareId = "ShareABC";
    const order: string[] = [];

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withStuffShareLock(redis, shareId, async () => {
      order.push("first-enter");
      await firstGate;
      order.push("first-exit");
      return "a";
    });

    // Wait until the first task holds the lock
    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondPromise = withStuffShareLock(redis, shareId, async () => {
      order.push("second");
      return "b";
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(["first-enter"]);

    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, secondPromise]);
    expect(firstResult).toBe("a");
    expect(secondResult).toBe("b");
    expect(order).toEqual(["first-enter", "first-exit", "second"]);
    expect(redis.kv.has(redisKeys.media.stuffShareLock(shareId))).toBe(false);
  });
});
