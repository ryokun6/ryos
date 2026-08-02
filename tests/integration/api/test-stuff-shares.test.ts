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
