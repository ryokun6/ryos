#!/usr/bin/env bun
/**
 * Coverage sweep for infrastructure-style API routes that were previously untested.
 *
 * Focuses on deterministic method/validation/auth guardrails so tests stay stable
 * across environments while still exercising each endpoint entrypoint.
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertStatus,
  printSummary,
  clearResults,
  fetchWithOrigin,
  section,
} from "./test-utils";

type StatusExpectation = number | readonly number[];

interface EndpointCase {
  name: string;
  path: string;
  init?: RequestInit;
  expectedStatus: StatusExpectation;
  assertResponse?: (res: Response) => Promise<void> | void;
}

const VALID_SESSION_ID = `missing${Date.now()}`;
const INVALID_SESSION_ID = "bad-id!";

async function runEndpointCases(group: string, cases: EndpointCase[]): Promise<void> {
  console.log(section(group));

  for (const testCase of cases) {
    await runTest(testCase.name, async () => {
      const res = await fetchWithOrigin(`${BASE_URL}${testCase.path}`, testCase.init);
      assertStatus(
        res.status,
        testCase.expectedStatus,
        `${testCase.name}: unexpected status ${res.status}`
      );
      if (testCase.assertResponse) {
        await testCase.assertResponse(res);
      }
    });
  }
}

const listenSessionCases: EndpointCase[] = [
  {
    name: "sessions - OPTIONS preflight",
    path: "/api/listen/sessions",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "sessions - invalid method",
    path: "/api/listen/sessions",
    init: { method: "PUT" },
    expectedStatus: 405,
  },
  {
    name: "sessions - create missing username",
    path: "/api/listen/sessions",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    expectedStatus: 400,
    assertResponse: async (res) => {
      const data = await res.json();
      assert(data.error?.toLowerCase().includes("username"), "Expected username validation error");
    },
  },
  {
    name: "session detail - OPTIONS preflight",
    path: `/api/listen/sessions/${VALID_SESSION_ID}`,
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "session detail - invalid method",
    path: `/api/listen/sessions/${VALID_SESSION_ID}`,
    init: { method: "POST" },
    expectedStatus: 405,
  },
  {
    name: "session detail - invalid session id format",
    path: `/api/listen/sessions/${INVALID_SESSION_ID}`,
    expectedStatus: 400,
  },
];

const listenJoinCases: EndpointCase[] = [
  {
    name: "join - OPTIONS preflight",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/join`,
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "join - invalid method",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/join`,
    init: { method: "GET" },
    expectedStatus: 405,
  },
  {
    name: "join - missing username and anonymousId",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/join`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    expectedStatus: 400,
  },
  {
    name: "join - invalid session id format",
    path: `/api/listen/sessions/${INVALID_SESSION_ID}/join`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser" }),
    },
    expectedStatus: 400,
  },
];

const listenLeaveCases: EndpointCase[] = [
  {
    name: "leave - OPTIONS preflight",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/leave`,
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "leave - invalid method",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/leave`,
    init: { method: "GET" },
    expectedStatus: 405,
  },
  {
    name: "leave - missing username and anonymousId",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/leave`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    expectedStatus: 400,
  },
  {
    name: "leave - invalid session id format",
    path: `/api/listen/sessions/${INVALID_SESSION_ID}/leave`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser" }),
    },
    expectedStatus: 400,
  },
];

const listenSyncCases: EndpointCase[] = [
  {
    name: "sync - OPTIONS preflight",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/sync`,
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "sync - invalid method",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/sync`,
    init: { method: "GET" },
    expectedStatus: 405,
  },
  {
    name: "sync - missing username",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/sync`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: { isPlaying: true, positionMs: 0 } }),
    },
    expectedStatus: 400,
  },
  {
    name: "sync - missing state",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/sync`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser" }),
    },
    expectedStatus: 400,
  },
  {
    name: "sync - invalid payload shape",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/sync`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "validuser",
        state: { isPlaying: "yes", positionMs: "10" },
      }),
    },
    expectedStatus: 400,
  },
  {
    name: "sync - invalid session id format",
    path: `/api/listen/sessions/${INVALID_SESSION_ID}/sync`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "validuser",
        state: { isPlaying: true, positionMs: 10 },
      }),
    },
    expectedStatus: 400,
  },
];

const listenReactionCases: EndpointCase[] = [
  {
    name: "reaction - OPTIONS preflight",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/reaction`,
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "reaction - invalid method",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/reaction`,
    init: { method: "GET" },
    expectedStatus: 405,
  },
  {
    name: "reaction - missing username",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/reaction`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji: "🔥" }),
    },
    expectedStatus: 400,
  },
  {
    name: "reaction - missing emoji",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/reaction`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser" }),
    },
    expectedStatus: 400,
  },
  {
    name: "reaction - emoji too long",
    path: `/api/listen/sessions/${VALID_SESSION_ID}/reaction`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser", emoji: "toolongggg" }),
    },
    expectedStatus: 400,
  },
  {
    name: "reaction - invalid session id format",
    path: `/api/listen/sessions/${INVALID_SESSION_ID}/reaction`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "validuser", emoji: "🔥" }),
    },
    expectedStatus: 400,
  },
];

const syncCases: EndpointCase[] = [
  {
    name: "sync status - OPTIONS preflight",
    path: "/api/sync/status",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "sync status - invalid method",
    path: "/api/sync/status",
    init: { method: "POST" },
    expectedStatus: 405,
  },
  {
    name: "sync status - missing auth",
    path: "/api/sync/status",
    expectedStatus: 401,
  },
  {
    name: "sync backup-token - OPTIONS preflight",
    path: "/api/sync/backup-token",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "sync backup-token - invalid method",
    path: "/api/sync/backup-token",
    expectedStatus: 405,
  },
  {
    name: "sync backup-token - missing auth",
    path: "/api/sync/backup-token",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    expectedStatus: 401,
  },
  {
    name: "sync backup - OPTIONS preflight",
    path: "/api/sync/backup",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "sync backup - GET missing auth",
    path: "/api/sync/backup",
    expectedStatus: 401,
  },
  {
    name: "sync backup - POST missing auth",
    path: "/api/sync/backup",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    expectedStatus: 401,
  },
  {
    name: "sync backup - DELETE missing auth",
    path: "/api/sync/backup",
    init: { method: "DELETE" },
    expectedStatus: 401,
  },
];

const aiMemoryCases: EndpointCase[] = [
  {
    name: "extract memories - OPTIONS preflight",
    path: "/api/ai/extract-memories",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "extract memories - invalid method",
    path: "/api/ai/extract-memories",
    expectedStatus: 405,
  },
  {
    name: "extract memories - missing auth",
    path: "/api/ai/extract-memories",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    expectedStatus: 401,
  },
  {
    name: "process daily notes - OPTIONS preflight",
    path: "/api/ai/process-daily-notes",
    init: { method: "OPTIONS" },
    expectedStatus: 204,
  },
  {
    name: "process daily notes - invalid method",
    path: "/api/ai/process-daily-notes",
    expectedStatus: 405,
  },
  {
    name: "process daily notes - missing auth",
    path: "/api/ai/process-daily-notes",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    expectedStatus: 401,
  },
];

const pusherCases: EndpointCase[] = [
  {
    name: "pusher broadcast - GET without secret denied",
    path: "/api/pusher/broadcast",
    expectedStatus: [403, 405],
  },
  {
    name: "pusher broadcast - POST without secret denied",
    path: "/api/pusher/broadcast",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    expectedStatus: [400, 403],
  },
  {
    name: "pusher broadcast - POST with bogus secret denied",
    path: "/api/pusher/broadcast",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": "bogus-secret" },
      body: JSON.stringify({ channel: "test", event: "test", data: { ok: true } }),
    },
    expectedStatus: 403,
  },
];

export async function runInfraApiTests(): Promise<{ passed: number; failed: number }> {
  clearResults();

  console.log("\n🧪 Infrastructure API Coverage Tests\n");
  console.log(`Testing against: ${BASE_URL}\n`);

  await runEndpointCases("listen/sessions", listenSessionCases);
  await runEndpointCases("listen/sessions/[id]/join", listenJoinCases);
  await runEndpointCases("listen/sessions/[id]/leave", listenLeaveCases);
  await runEndpointCases("listen/sessions/[id]/sync", listenSyncCases);
  await runEndpointCases("listen/sessions/[id]/reaction", listenReactionCases);
  await runEndpointCases("sync/*", syncCases);
  await runEndpointCases("ai memory endpoints", aiMemoryCases);
  await runEndpointCases("pusher/broadcast", pusherCases);

  return printSummary();
}

if (import.meta.main) {
  runInfraApiTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
