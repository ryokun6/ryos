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

describe("stuff shares", () => {
  beforeAll(async () => {
    ownerUsername = `stuffown${Math.floor(Math.random() * 100000)}`;
    bidderUsername = `stuffbid${Math.floor(Math.random() * 100000)}`;
    const owner = await ensureUserAuth(ownerUsername, "testpassword123");
    const bidder = await ensureUserAuth(bidderUsername, "testpassword123");
    if (!owner || !bidder) {
      throw new Error("stuff shares setup failed: could not obtain auth tokens");
    }
    ownerToken = owner;
    bidderToken = bidder;
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

  test("create share, public get, auth reserve/bid", async () => {
    const item = {
      id: "item-1",
      title: "Vintage Lamp",
      notes: "Works great",
      tagNames: ["Electronics"],
      status: "for_sale",
      prices: { discounted: 40, currency: "USD" },
      quantity: 1,
    };

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
          items: [item],
        }),
      }
    );
    expect([200, 201]).toContain(createRes.status);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    const getRes = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares?id=${encodeURIComponent(created.id)}`,
      { headers: makeRateLimitBypassHeaders() }
    );
    expect(getRes.status).toBe(200);
    const share = await getRes.json();
    expect(share.title).toBe("Garage Sale");
    expect(share.items).toHaveLength(1);

    const anonReserve = await fetchWithOrigin(
      `${BASE_URL}/api/stuff/shares/${created.id}/reserve`,
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
      `${BASE_URL}/api/stuff/shares/${created.id}/bid`,
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
      `${BASE_URL}/api/stuff/shares/${created.id}/reserve`,
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
      `${BASE_URL}/api/stuff/shares/${created.id}/bid`,
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
});
