#!/usr/bin/env bun
/**
 * Tests for /api/stuff/shares and related endpoints
 */

import { describe, expect, test, beforeAll } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
} from "../../helpers/test-utils";

let ownerUsername: string;
let ownerToken: string;
let bidderUsername: string;
let bidderToken: string;
let bidder2Username: string;
let bidder2Token: string;

const sampleItem = (id = "item-1") => ({
  id,
  title: "Vintage Lamp",
  notes: "Works great",
  tagNames: ["Electronics"],
  status: "for_sale" as const,
  prices: { discounted: 40, currency: "USD" },
  quantity: 1,
});

async function createShare(
  items = [sampleItem()],
  shareId?: string
): Promise<string> {
  const createRes = await fetchWithAuth(
    `${BASE_URL}/api/stuff/shares`,
    ownerUsername,
    ownerToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...makeRateLimitBypassHeaders(),
      },
      body: JSON.stringify({
        title: "Garage Sale",
        shareId,
        items,
      }),
    }
  );
  expect([200, 201]).toContain(createRes.status);
  const created = (await createRes.json()) as { id: string };
  expect(created.id).toBeTruthy();
  return created.id;
}

describe("stuff shares", () => {
  beforeAll(async () => {
    ownerUsername = `stuffown${Math.floor(Math.random() * 100000)}`;
    bidderUsername = `stuffbid${Math.floor(Math.random() * 100000)}`;
    bidder2Username = `stuffbid2${Math.floor(Math.random() * 100000)}`;
    const owner = await ensureUserAuth(ownerUsername, "testpassword123");
    const bidder = await ensureUserAuth(bidderUsername, "testpassword123");
    const bidder2 = await ensureUserAuth(bidder2Username, "testpassword123");
    if (!owner || !bidder || !bidder2) {
      throw new Error("stuff shares setup failed: could not obtain auth tokens");
    }
    ownerToken = owner;
    bidderToken = bidder;
    bidder2Token = bidder2;
  });

  test("barcode lookup returns JSON", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/barcode-lookup?barcode=3017620422003`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.found).toBe("boolean");
  });

  test("product lookup accepts ISBN and title queries", async () => {
    const isbnRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/product-lookup?q=${encodeURIComponent("9780140329473")}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(isbnRes.status).toBe(200);
    const isbnData = await isbnRes.json();
    expect(typeof isbnData.found).toBe("boolean");
    if (isbnData.found) {
      expect(typeof isbnData.title).toBe("string");
      expect(isbnData.queryKind).toBe("isbn");
    }

    const titleRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/product-lookup?q=${encodeURIComponent("The Great Gatsby")}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(titleRes.status).toBe(200);
    const titleData = await titleRes.json();
    expect(typeof titleData.found).toBe("boolean");
    expect(titleData.queryKind).toBe("title");
    expect(Array.isArray(titleData.results)).toBe(true);
    if (titleData.found) {
      expect(titleData.results.length).toBeGreaterThanOrEqual(1);
      expect(typeof titleData.results[0]?.title).toBe("string");
    }
  });

  test("create share, public get, auth reserve/bid", async () => {
    const shareId = await createShare();

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();
    expect(share.title).toBe("Garage Sale");
    expect(share.items).toHaveLength(1);

    const anonReserve = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({ itemId: "item-1" }),
      }
    );
    expect(anonReserve.status).toBe(401);

    const bidRes = await fetchWithAuth(
      `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
      bidderUsername,
      bidderToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          itemId: "item-1",
          amount: 35,
          currency: "USD",
        }),
      }
    );
    expect(bidRes.status).toBe(201);
    const bidBody = await bidRes.json();
    expect(bidBody.bid.amount).toBe(35);

    const reserveRes = await fetchWithAuth(
      `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
      bidderUsername,
      bidderToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({ itemId: "item-1" }),
      }
    );
    expect(reserveRes.status).toBe(201);

    const lowBid = await fetchWithAuth(
      `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
      bidderUsername,
      bidderToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          itemId: "item-1",
          amount: 10,
          currency: "USD",
        }),
      }
    );
    expect(lowBid.status).toBe(400);
  });

  test("rejects bid when currency does not match listing", async () => {
    const shareId = await createShare();

    const mismatch = await fetchWithAuth(
      `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
      bidderUsername,
      bidderToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          itemId: "item-1",
          amount: 99,
          currency: "EUR",
        }),
      }
    );
    expect(mismatch.status).toBe(400);
    const body = await mismatch.json();
    expect(body.error).toBe("currency_mismatch");
    expect(body.expected).toBe("USD");
    expect(body.received).toBe("EUR");
  });

  test("concurrent reserves allow only one active reservation per item", async () => {
    const shareId = await createShare([sampleItem("race-item")]);

    const [first, second] = await Promise.all([
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
        bidderUsername,
        bidderToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({ itemId: "race-item" }),
        }
      ),
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
        bidder2Username,
        bidder2Token,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({ itemId: "race-item" }),
        }
      ),
    ]);

    const statuses = [first.status, second.status].toSorted();
    expect(statuses).toEqual([201, 409]);

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();
    const active = (share.reservations as Array<{ status: string; itemId: string }>).filter(
      (reservation) =>
        reservation.itemId === "race-item" && reservation.status === "active"
    );
    expect(active).toHaveLength(1);
    expect(
      share.items.find((item: { id: string }) => item.id === "race-item")?.status
    ).toBe("reserved");
  });

  test("concurrent bid and reserve both persist on the share record", async () => {
    const shareId = await createShare([sampleItem("bid-reserve-race")]);

    const [bidRes, reserveRes] = await Promise.all([
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
        bidderUsername,
        bidderToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({
            itemId: "bid-reserve-race",
            amount: 42,
            currency: "USD",
          }),
        }
      ),
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
        bidder2Username,
        bidder2Token,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({ itemId: "bid-reserve-race" }),
        }
      ),
    ]);

    expect([201, 503]).toContain(bidRes.status);
    expect([201, 503]).toContain(reserveRes.status);
    // Lock contention may 503 one caller; at least one mutation must land.
    expect(bidRes.status === 201 || reserveRes.status === 201).toBe(true);

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();

    if (bidRes.status === 201 && reserveRes.status === 201) {
      expect(
        (share.bids as Array<{ itemId: string; amount: number }>).some(
          (bid) => bid.itemId === "bid-reserve-race" && bid.amount === 42
        )
      ).toBe(true);
      expect(
        (
          share.reservations as Array<{ itemId: string; status: string }>
        ).filter(
          (reservation) =>
            reservation.itemId === "bid-reserve-race" &&
            reservation.status === "active"
        )
      ).toHaveLength(1);
      expect(
        share.items.find(
          (item: { id: string }) => item.id === "bid-reserve-race"
        )?.status
      ).toBe("reserved");
      return;
    }

    // One request hit share_busy: the successful write must still be intact
    // (not clobbered by a stale unlocked sibling write).
    if (bidRes.status === 201) {
      expect(
        (share.bids as Array<{ itemId: string; amount: number }>).some(
          (bid) => bid.itemId === "bid-reserve-race" && bid.amount === 42
        )
      ).toBe(true);
    }
    if (reserveRes.status === 201) {
      expect(
        (
          share.reservations as Array<{ itemId: string; status: string }>
        ).filter(
          (reservation) =>
            reservation.itemId === "bid-reserve-race" &&
            reservation.status === "active"
        )
      ).toHaveLength(1);
    }
  });

  test("concurrent bids serialize so the stored high bid matches a winner", async () => {
    const shareId = await createShare([sampleItem("bid-race")]);

    const [first, second] = await Promise.all([
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
        bidderUsername,
        bidderToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({
            itemId: "bid-race",
            amount: 30,
            currency: "USD",
          }),
        }
      ),
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/bid`,
        bidder2Username,
        bidder2Token,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({
            itemId: "bid-race",
            amount: 50,
            currency: "USD",
          }),
        }
      ),
    ]);

    const statuses = [first.status, second.status].toSorted(
      (a, b) => a - b
    );
    // Higher bid always wins when both complete; loser is bid_too_low (400)
    // or share_busy (503) under contention. Never both 201 with a lost write.
    expect(statuses[0]).toBeGreaterThanOrEqual(201);
    expect([201, 400, 503]).toContain(first.status);
    expect([201, 400, 503]).toContain(second.status);
    expect(first.status === 201 || second.status === 201).toBe(true);

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();
    const itemBids = (
      share.bids as Array<{ itemId: string; amount: number; username: string }>
    ).filter((bid) => bid.itemId === "bid-race");

    const high = Math.max(...itemBids.map((bid) => bid.amount));
    expect(high).toBe(
      second.status === 201 ? 50 : first.status === 201 ? 30 : high
    );
    if (second.status === 201) {
      expect(high).toBe(50);
      expect(
        itemBids.some(
          (bid) => bid.username === bidder2Username && bid.amount === 50
        )
      ).toBe(true);
    }
    if (first.status === 201 && second.status === 201) {
      // Both accepted only if the lower bid landed first; both remain stored
      // (one per user) and the high bid is 50.
      expect(itemBids).toHaveLength(2);
      expect(high).toBe(50);
    }
    if (first.status === 201 && second.status !== 201) {
      expect(itemBids).toHaveLength(1);
      expect(itemBids[0]?.amount).toBe(30);
    }
    if (second.status === 201 && first.status === 400) {
      expect(itemBids.some((bid) => bid.amount === 50)).toBe(true);
    }
  });

  test("concurrent republish and reserve keep the reservation", async () => {
    const shareId = await createShare([sampleItem("republish-race")]);

    const [reserveRes, republishRes] = await Promise.all([
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
        bidderUsername,
        bidderToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({ itemId: "republish-race" }),
        }
      ),
      fetchWithAuth(
        `${BASE_URL}/api/stuff/shares`,
        ownerUsername,
        ownerToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...makeRateLimitBypassHeaders(),
          },
          body: JSON.stringify({
            title: "Garage Sale Updated",
            shareId,
            items: [sampleItem("republish-race")],
          }),
        }
      ),
    ]);

    expect([201, 503]).toContain(reserveRes.status);
    expect([200, 503]).toContain(republishRes.status);
    expect(reserveRes.status === 201 || republishRes.status === 200).toBe(
      true
    );

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();

    if (reserveRes.status === 201) {
      expect(
        (
          share.reservations as Array<{ itemId: string; status: string }>
        ).filter(
          (reservation) =>
            reservation.itemId === "republish-race" &&
            reservation.status === "active"
        )
      ).toHaveLength(1);
      expect(
        share.items.find(
          (item: { id: string }) => item.id === "republish-race"
        )?.status
      ).toBe("reserved");
    }
  });

  test("republish preserves reserved status for actively reserved items", async () => {
    const shareId = await createShare([sampleItem("keep-reserved")]);

    const reserveRes = await fetchWithAuth(
      `${BASE_URL}/api/stuff/shares/${shareId}/reserve`,
      bidderUsername,
      bidderToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({ itemId: "keep-reserved" }),
      }
    );
    expect(reserveRes.status).toBe(201);

    // Owner republishes with a local snapshot that still says for_sale
    const republishId = await createShare(
      [sampleItem("keep-reserved")],
      shareId
    );
    expect(republishId).toBe(shareId);

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(shareId)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();
    expect(share.items[0]?.status).toBe("reserved");
    expect(
      share.reservations.filter(
        (reservation: { status: string }) => reservation.status === "active"
      )
    ).toHaveLength(1);
  });
});
