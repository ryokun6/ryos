#!/usr/bin/env bun
/**
 * Security-focused integration tests for listen + presence identity binding.
 *
 * Verifies that caller-supplied usernames in request bodies cannot impersonate
 * another user when auth headers identify a different account.
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertEq,
  printSummary,
  clearResults,
  fetchWithOrigin,
  fetchWithAuth,
  section,
} from "./test-utils";

let ownerUsername: string | null = null;
let ownerToken: string | null = null;
let attackerUsername: string | null = null;
let attackerToken: string | null = null;
let sessionId: string | null = null;
let testRoomId: string | null = null;

async function ensureUserAuth(
  username: string,
  password: string
): Promise<string | null> {
  const registerRes = await fetchWithOrigin(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (registerRes.status === 201) {
    const data = await registerRes.json();
    return data.token ?? null;
  }

  if (registerRes.status === 409) {
    const loginRes = await fetchWithOrigin(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      return data.token ?? null;
    }
  }

  return null;
}

async function setupUsersAndRoom(): Promise<void> {
  const ts = Date.now();
  ownerUsername = `listenowner${ts}`;
  attackerUsername = `listenattacker${ts}`;

  ownerToken = await ensureUserAuth(ownerUsername, "testpassword123");
  attackerToken = await ensureUserAuth(attackerUsername, "testpassword123");

  if (!ownerToken || !attackerToken || !ownerUsername) return;

  const roomsRes = await fetchWithAuth(`${BASE_URL}/api/rooms`, ownerUsername, ownerToken, {
    method: "GET",
  });
  if (!roomsRes.ok) return;
  const roomsData = await roomsRes.json();
  if (Array.isArray(roomsData.rooms) && roomsData.rooms.length > 0) {
    testRoomId = roomsData.rooms[0].id;
  }
}

async function testCreateSessionUsernameMismatchRejected(): Promise<void> {
  if (!ownerUsername || !ownerToken || !attackerUsername) {
    console.log("  ⚠️  Skipped (missing setup auth)");
    return;
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: attackerUsername }),
  });
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testCreateSessionSuccess(): Promise<void> {
  if (!ownerUsername || !ownerToken) {
    console.log("  ⚠️  Skipped (missing setup auth)");
    return;
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/listen/sessions`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ownerUsername }),
  });
  assertEq(res.status, 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.session?.id, "Expected session id");
  assertEq(
    data.session.hostUsername,
    ownerUsername,
    "Expected session host to match authenticated owner"
  );
  sessionId = data.session.id;
}

async function testJoinSessionUsernameMismatchRejected(): Promise<void> {
  if (!sessionId || !attackerUsername || !attackerToken || !ownerUsername) {
    console.log("  ⚠️  Skipped (missing session or auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/join`,
    attackerUsername,
    attackerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ownerUsername }),
    }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testJoinSessionSuccess(): Promise<void> {
  if (!sessionId || !attackerUsername || !attackerToken) {
    console.log("  ⚠️  Skipped (missing session or attacker auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/join`,
    attackerUsername,
    attackerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: attackerUsername }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  const hasAttacker = data.session?.users?.some(
    (user: { username: string }) => user.username === attackerUsername
  );
  assert(hasAttacker, "Expected attacker to join as self");
}

async function testSyncUsernameMismatchRejected(): Promise<void> {
  if (!sessionId || !ownerUsername || !ownerToken || !attackerUsername) {
    console.log("  ⚠️  Skipped (missing session or owner auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/sync`,
    ownerUsername,
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: attackerUsername,
        state: {
          currentTrackId: null,
          currentTrackMeta: null,
          isPlaying: false,
          positionMs: 0,
        },
      }),
    }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testSyncSuccess(): Promise<void> {
  if (!sessionId || !ownerUsername || !ownerToken) {
    console.log("  ⚠️  Skipped (missing session or owner auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/sync`,
    ownerUsername,
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: ownerUsername,
        state: {
          currentTrackId: null,
          currentTrackMeta: null,
          isPlaying: false,
          positionMs: 0,
        },
      }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

async function testReactionUsernameMismatchRejected(): Promise<void> {
  if (!sessionId || !ownerUsername || !ownerToken || !attackerUsername) {
    console.log("  ⚠️  Skipped (missing session or owner auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/reaction`,
    ownerUsername,
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: attackerUsername, emoji: "🔥" }),
    }
  );
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testReactionSuccess(): Promise<void> {
  if (!sessionId || !ownerUsername || !ownerToken) {
    console.log("  ⚠️  Skipped (missing session or owner auth)");
    return;
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/api/listen/sessions/${sessionId}/reaction`,
    ownerUsername,
    ownerToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ownerUsername, emoji: "✅" }),
    }
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

async function testPresenceSwitchUsernameMismatchRejected(): Promise<void> {
  if (!testRoomId || !ownerUsername || !ownerToken || !attackerUsername) {
    console.log("  ⚠️  Skipped (missing room or auth)");
    return;
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/presence/switch`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previousRoomId: null,
      nextRoomId: testRoomId,
      username: attackerUsername,
    }),
  });
  assertEq(res.status, 403, `Expected 403, got ${res.status}`);
}

async function testPresenceSwitchSuccessWithoutUsernameClaim(): Promise<void> {
  if (!testRoomId || !ownerUsername || !ownerToken) {
    console.log("  ⚠️  Skipped (missing room or auth)");
    return;
  }

  const res = await fetchWithAuth(`${BASE_URL}/api/presence/switch`, ownerUsername, ownerToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previousRoomId: null,
      nextRoomId: testRoomId,
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
}

export async function runListenSecurityTests(): Promise<{ passed: number; failed: number }> {
  clearResults();

  console.log("\n🧪 Listen Security API Tests\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  await setupUsersAndRoom();
  console.log(`  Owner: ${ownerUsername || "none"}`);
  console.log(`  Attacker: ${attackerUsername || "none"}`);
  console.log(`  Room: ${testRoomId || "none"}`);

  console.log(section("Listen Session Identity Binding"));
  await runTest(
    "Create session - username mismatch rejected",
    testCreateSessionUsernameMismatchRejected
  );
  await runTest("Create session - success", testCreateSessionSuccess);
  await runTest(
    "Join session - username mismatch rejected",
    testJoinSessionUsernameMismatchRejected
  );
  await runTest("Join session - success", testJoinSessionSuccess);
  await runTest("Sync - username mismatch rejected", testSyncUsernameMismatchRejected);
  await runTest("Sync - success", testSyncSuccess);
  await runTest("Reaction - username mismatch rejected", testReactionUsernameMismatchRejected);
  await runTest("Reaction - success", testReactionSuccess);

  console.log(section("Presence Identity Binding"));
  await runTest(
    "Presence switch - username mismatch rejected",
    testPresenceSwitchUsernameMismatchRejected
  );
  await runTest(
    "Presence switch - success without username claim",
    testPresenceSwitchSuccessWithoutUsernameClaim
  );

  return printSummary();
}

if (import.meta.main) {
  runListenSecurityTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

