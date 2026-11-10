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

type ShareDoc = {
  reservations: Array<{ id: string }>;
  bids: Array<{ id: string; amount: number }>;
};

async function loadShareDoc(
  redis: FakeRedis,
  shareId: string
): Promise<ShareDoc> {
  const raw = await redis.get(redisKeys.media.stuffShare(shareId));
  expect(typeof raw).toBe("string");
  return JSON.parse(raw as string) as ShareDoc;
}

async function writeShareDoc(
  redis: FakeRedis,
  shareId: string,
  doc: ShareDoc
): Promise<void> {
  await redis.set(redisKeys.media.stuffShare(shareId), JSON.stringify(doc));
}

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

  test("unlocked concurrent RMW can drop a sibling write; locked RMW keeps both", async () => {
    const shareId = "ShareRace";
    const seed: ShareDoc = { reservations: [], bids: [] };

    // Without the lock, an interleaved read-modify-write loses the reservation.
    const unlockedRedis = new FakeRedis();
    await writeShareDoc(unlockedRedis, shareId, seed);

    let releaseUnlockedBid!: () => void;
    const unlockedBidGate = new Promise<void>((resolve) => {
      releaseUnlockedBid = resolve;
    });

    const unlockedBid = (async () => {
      const share = await loadShareDoc(unlockedRedis, shareId);
      share.bids.push({ id: "bid-1", amount: 35 });
      await unlockedBidGate;
      await writeShareDoc(unlockedRedis, shareId, share);
    })();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const unlockedReserve = (async () => {
      const share = await loadShareDoc(unlockedRedis, shareId);
      share.reservations.push({ id: "res-1" });
      await writeShareDoc(unlockedRedis, shareId, share);
    })();

    await unlockedReserve;
    releaseUnlockedBid();
    await unlockedBid;

    const unlockedFinal = await loadShareDoc(unlockedRedis, shareId);
    expect(unlockedFinal.bids).toEqual([{ id: "bid-1", amount: 35 }]);
    expect(unlockedFinal.reservations).toEqual([]);

    // With the lock, the same interleaving keeps both mutations.
    const lockedRedis = new FakeRedis();
    await writeShareDoc(lockedRedis, shareId, seed);

    let releaseLockedBid!: () => void;
    const lockedBidGate = new Promise<void>((resolve) => {
      releaseLockedBid = resolve;
    });

    const lockedBid = withStuffShareLock(lockedRedis, shareId, async () => {
      const share = await loadShareDoc(lockedRedis, shareId);
      share.bids.push({ id: "bid-1", amount: 35 });
      await lockedBidGate;
      await writeShareDoc(lockedRedis, shareId, share);
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const lockedReservePromise = withStuffShareLock(
      lockedRedis,
      shareId,
      async () => {
        const share = await loadShareDoc(lockedRedis, shareId);
        share.reservations.push({ id: "res-1" });
        await writeShareDoc(lockedRedis, shareId, share);
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseLockedBid();
    await Promise.all([lockedBid, lockedReservePromise]);

    const lockedFinal = await loadShareDoc(lockedRedis, shareId);
    expect(lockedFinal.bids).toEqual([{ id: "bid-1", amount: 35 }]);
    expect(lockedFinal.reservations).toEqual([{ id: "res-1" }]);
  });
});
