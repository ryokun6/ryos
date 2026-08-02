import type { RedisLike } from "../../_utils/redis.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import type { StuffShareItem, StuffShareReservation } from "./_types.js";

const LOCK_TTL_SECONDS = 5;
const LOCK_ATTEMPTS = 8;
const LOCK_RETRY_MS = 25;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * Serialize read-modify-write mutations on a stuff share document so concurrent
 * reserves/bids cannot double-book the same item.
 */
export async function withStuffShareLock<T>(
  redis: RedisLike,
  shareId: string,
  task: () => Promise<T>
): Promise<T> {
  const key = redisKeys.media.stuffShareLock(shareId);
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const claimed = await redis.set(key, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (claimed !== null && claimed !== undefined) {
      try {
        return await task();
      } finally {
        await redis
          .eval<number>(RELEASE_LOCK_SCRIPT, [key], [token])
          .catch(() => 0);
      }
    }
    await sleep(LOCK_RETRY_MS);
  }

  throw new Error("stuff_share_busy");
}

/** Keep `reserved` on items that still have an active reservation after republish. */
export function mergeItemsPreservingActiveReservations(
  items: StuffShareItem[],
  reservations: StuffShareReservation[]
): StuffShareItem[] {
  const activelyReservedItemIds = new Set(
    reservations
      .filter((reservation) => reservation.status === "active")
      .map((reservation) => reservation.itemId)
  );

  return items.map((item) =>
    activelyReservedItemIds.has(item.id)
      ? { ...item, status: "reserved" as const }
      : item
  );
}

export type BidCurrencyCheckResult =
  | { ok: true; currency: string }
  | {
      ok: false;
      error: "currency_mismatch";
      expected: string;
      received: string;
    };

/** Require bid currency to match the listing currency. */
export function checkBidCurrency(input: {
  listingCurrency: string | undefined;
  bidCurrency: string | undefined;
}): BidCurrencyCheckResult {
  const expected = (input.listingCurrency || "USD").toUpperCase();
  const received = (input.bidCurrency || expected).toUpperCase();

  if (received !== expected) {
    return { ok: false, error: "currency_mismatch", expected, received };
  }

  return { ok: true, currency: expected };
}
