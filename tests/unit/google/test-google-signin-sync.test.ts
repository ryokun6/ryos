import "../../helpers/local-storage-stub";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { resetPersistWritesForTests } from "../../../src/utils/persistWriteQueue";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FakeRedis } from "../../helpers/fake-redis";
import {
  buildGoogleAuthorizationUrl,
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  createPendingGoogleSignup,
  createPkceChallenge,
  getGoogleOAuthConfig,
  getGoogleUsernameBySub,
  getLinkedGoogleAccountByUsername,
  getPendingGoogleSignup,
  isGoogleOAuthConfigured,
  renderGoogleOAuthCallbackHtml,
  sanitizeUsernameCandidate,
  saveLinkedGoogleAccount,
  scopesForFeatures,
  suggestAvailableGoogleUsername,
  toPublicGoogleAccount,
  unlinkGoogleAccountByUsername,
} from "../../../api/_utils/google-oauth";
import {
  addDaysYmd,
  buildDeterministicGoogleCalendarEventId,
  buildGoogleEventPayload,
  mapGoogleEventToRyos,
} from "../../../api/_utils/google-calendar";
import {
  buildDeterministicGoogleContactId,
  buildGooglePersonPayload,
  mapGooglePersonToRyosContact,
} from "../../../api/_utils/google-contacts";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_CONTACTS_SCOPE,
  GOOGLE_SIGNIN_SCOPES,
} from "../../../src/shared/contracts/google";
import { useCalendarStore, type CalendarEvent } from "../../../src/stores/useCalendarStore";
import { useContactsStore } from "../../../src/stores/useContactsStore";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { useGoogleSyncStore } from "../../../src/stores/useGoogleSyncStore";
import {
  calendarEventNeedsGooglePush,
  contactNeedsGooglePush,
} from "../../../src/sync/googleSyncEngine";
import { SYNC_CODECS } from "../../../src/sync/codecs";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { hashDoc } from "../../../src/sync/state";
import { seedDefaultContacts } from "../../../src/utils/contacts";
import { redisKeys } from "../../../src/shared/redisKeys";

const initialCalendarState = useCalendarStore.getState();
const initialContactsState = useContactsStore.getState();
const initialCloudSyncState = useCloudSyncStore.getState();

function resetAllStores() {
  useCalendarStore.setState({
    events: initialCalendarState.events,
    calendars: initialCalendarState.calendars,
    todos: initialCalendarState.todos,
    pendingGoogleDeletions: [],
  });
  useContactsStore.setState({
    contacts: initialContactsState.contacts,
    selectedContactId: initialContactsState.selectedContactId,
    myContactId: initialContactsState.myContactId,
    suppressDefaultSeed: false,
    pendingGoogleDeletions: [],
    lastRemoteSyncAt: 0,
  });
  useCloudSyncStore.setState({
    autoSyncEnabled: initialCloudSyncState.autoSyncEnabled,
    syncFiles: initialCloudSyncState.syncFiles,
    syncSettings: initialCloudSyncState.syncSettings,
    syncSongs: initialCloudSyncState.syncSongs,
    syncVideos: initialCloudSyncState.syncVideos,
    syncTv: initialCloudSyncState.syncTv,
    syncStickies: initialCloudSyncState.syncStickies,
    syncCalendar: initialCloudSyncState.syncCalendar,
    syncContacts: initialCloudSyncState.syncContacts,
    syncMaps: initialCloudSyncState.syncMaps,
    syncBooks: initialCloudSyncState.syncBooks,
    syncStuff: initialCloudSyncState.syncStuff,
    syncDictionary: initialCloudSyncState.syncDictionary,
    syncFitness: initialCloudSyncState.syncFitness,
    deletionMarkers: {
      ...initialCloudSyncState.deletionMarkers,
      calendarEventIds: {},
      calendarIds: {},
      calendarTodoIds: {},
      contactIds: {},
    },
  });
  useGoogleSyncStore.getState().resetOnLogout();
}

beforeEach(() => {
  resetAllStores();
});

afterEach(async () => {
  resetAllStores();
  await resetPersistWritesForTests();
  resetFakeIndexedDB();
});

afterAll(async () => {
  resetAllStores();
  await resetPersistWritesForTests();
  resetFakeIndexedDB();
});

describe("Google OAuth + PKCE + username helpers", () => {
  test("computes RFC 7636 S256 PKCE code challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await createPkceChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("degrades gracefully when GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is unset", () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevOrigin = process.env.APP_PUBLIC_ORIGIN;
    const prevRedirect = process.env.GOOGLE_REDIRECT_URI;
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.APP_PUBLIC_ORIGIN;
      delete process.env.GOOGLE_REDIRECT_URI;
      expect(isGoogleOAuthConfigured()).toBe(false);
      expect(getGoogleOAuthConfig("http://localhost:3000")).toBeNull();

      process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      expect(isGoogleOAuthConfigured()).toBe(true);
      const cfg = getGoogleOAuthConfig("http://localhost:3000");
      expect(cfg?.redirectUri).toBe(
        "http://localhost:3000/api/auth/google/callback"
      );
    } finally {
      if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
      if (prevOrigin === undefined) delete process.env.APP_PUBLIC_ORIGIN;
      else process.env.APP_PUBLIC_ORIGIN = prevOrigin;
      if (prevRedirect === undefined) delete process.env.GOOGLE_REDIRECT_URI;
      else process.env.GOOGLE_REDIRECT_URI = prevRedirect;
    }
  });

  test("builds 2A incremental scope authorization URLs correctly", () => {
    expect(scopesForFeatures([], true)).toEqual([...GOOGLE_SIGNIN_SCOPES]);
    const incrementalScopes = scopesForFeatures(["calendar", "contacts"], true);
    expect(incrementalScopes).toContain(GOOGLE_CALENDAR_SCOPE);
    expect(incrementalScopes).toContain(GOOGLE_CONTACTS_SCOPE);

    const signinUrl = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "cid",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        state: "state-1",
        codeChallenge: "challenge-1",
        scopes: [...GOOGLE_SIGNIN_SCOPES],
        mode: "signin",
      })
    );
    expect(signinUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(signinUrl.searchParams.get("access_type")).toBeNull();
    expect(signinUrl.searchParams.get("include_granted_scopes")).toBeNull();
    expect(signinUrl.searchParams.get("prompt")).toBe("select_account");

    const syncConsentUrl = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "cid",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        state: "state-2",
        codeChallenge: "challenge-2",
        scopes: incrementalScopes,
        mode: "scopes",
        forceOfflineConsent: true,
        loginHint: "ryo@example.com",
      })
    );
    expect(syncConsentUrl.searchParams.get("access_type")).toBe("offline");
    expect(syncConsentUrl.searchParams.get("include_granted_scopes")).toBe("true");
    expect(syncConsentUrl.searchParams.get("prompt")).toBe("consent");
    expect(syncConsentUrl.searchParams.get("login_hint")).toBe("ryo@example.com");
  });

  test("stores OAuth state single-use and manages pending signup + bidirectional links", async () => {
    const redis = new FakeRedis() as never;
    const { state, codeVerifier } = await createGoogleOAuthState(redis, {
      mode: "signin",
      username: null,
      scopes: [...GOOGLE_SIGNIN_SCOPES],
      redirectUri: "http://localhost:3000/api/auth/google/callback",
      clientOrigin: "http://localhost:3000",
      returnMode: "popup",
    });

    const firstConsume = await consumeGoogleOAuthState(redis, state);
    expect(firstConsume?.codeVerifier).toBe(codeVerifier);
    const secondConsume = await consumeGoogleOAuthState(redis, state);
    expect(secondConsume).toBeNull();

    const pendingToken = await createPendingGoogleSignup(redis, {
      sub: "google-sub-123",
      email: "ryo@example.com",
      emailVerified: true,
      name: "Ryo Lu",
      picture: "https://example.com/pic.png",
      suggestedUsername: "ryo",
      accessToken: "ya29.test",
      accessTokenExpiresAt: Date.now() + 3600_000,
      refreshToken: null,
      scopes: [...GOOGLE_SIGNIN_SCOPES],
    });
    const pending = await getPendingGoogleSignup(redis, pendingToken);
    expect(pending?.sub).toBe("google-sub-123");
    expect(pending?.suggestedUsername).toBe("ryo");

    const record = {
      username: "ryo",
      sub: "google-sub-123",
      email: "ryo@example.com",
      emailVerified: true,
      name: "Ryo Lu",
      picture: "https://example.com/pic.png",
      accessToken: "ya29.test",
      accessTokenExpiresAt: Date.now() + 3600_000,
      refreshToken: "1//refresh-token",
      scopes: [...GOOGLE_SIGNIN_SCOPES, GOOGLE_CALENDAR_SCOPE],
      linkedAt: 1000,
      updatedAt: 1000,
      calendarSyncToken: null,
      calendarLastSyncedAt: null,
      contactsSyncToken: null,
      contactsLastSyncedAt: null,
    };
    await saveLinkedGoogleAccount(redis, record);
    expect(await getGoogleUsernameBySub(redis, "google-sub-123")).toBe("ryo");
    const linked = await getLinkedGoogleAccountByUsername(redis, "ryo");
    expect(linked?.email).toBe("ryo@example.com");
    const pub = toPublicGoogleAccount(linked!);
    expect(pub.hasCalendarScope).toBe(true);
    expect(pub.hasContactsScope).toBe(false);

    const unlinked = await unlinkGoogleAccountByUsername(redis, "ryo");
    expect(unlinked?.sub).toBe("google-sub-123");
    expect(await getGoogleUsernameBySub(redis, "google-sub-123")).toBeNull();
    expect(await getLinkedGoogleAccountByUsername(redis, "ryo")).toBeNull();
  });

  test("sanitizes candidate usernames and avoids existing user collisions", async () => {
    expect(sanitizeUsernameCandidate("Ryo.Lu+test")).toBe("ryo_lu_test");
    expect(sanitizeUsernameCandidate("ab")).toBe("abu");

    const redis = new FakeRedis();
    await redis.set(
      redisKeys.auth.userProfile("alice"),
      JSON.stringify({ username: "alice", createdAt: 1 })
    );
    const suggested = await suggestAvailableGoogleUsername(redis as never, {
      email: "alice@example.com",
      name: "Alice",
    });
    expect(suggested).toBe("alice2");
  });

  test("renders callback bridge HTML with CSP nonce and escaped script payload", () => {
    const linkedAccount = {
      email: "ryo@example.com",
      emailVerified: true,
      name: "Ryo",
      picture: null,
      scopes: ["openid", "email", "profile"],
      hasCalendarScope: false,
      hasContactsScope: false,
      linkedAt: 1000,
      calendarLastSyncedAt: null,
      contactsLastSyncedAt: null,
    };
    const { html, csp } = renderGoogleOAuthCallbackHtml({
      clientOrigin: "http://localhost:5173",
      returnMode: "popup",
      message: {
        type: "ryos:google-oauth-result",
        status: "authenticated",
        username: "ryo</script>",
        account: linkedAccount,
      },
    });
    expect(csp).toContain("script-src 'nonce-");
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("ryo\\u003c/script\\u003e");
  });
});

describe("Google Calendar mapper", () => {
  test("converts Google exclusive all-day end.date to ryOS inclusive endDate and back", () => {
    expect(addDaysYmd("2026-11-23", 1)).toBe("2026-11-24");
    expect(addDaysYmd("2026-11-24", -1)).toBe("2026-11-23");

    const singleDay = mapGoogleEventToRyos(
      {
        id: "evt_single",
        summary: "Thanksgiving Prep",
        start: { date: "2026-11-25" },
        end: { date: "2026-11-26" },
        updated: "2026-11-20T10:00:00.000Z",
      },
      { timeZone: "America/Los_Angeles" }
    );
    expect(singleDay?.id).toBe("gcal_evt_single");
    expect(singleDay?.date).toBe("2026-11-25");
    expect(singleDay?.endDate).toBeUndefined();
    expect(singleDay?.startTime).toBeUndefined();

    const multiDay = mapGoogleEventToRyos(
      {
        id: "evt_multi",
        summary: "Offsite",
        start: { date: "2026-11-25" },
        end: { date: "2026-11-28" },
        colorId: "11",
        updated: "2026-11-20T10:00:00.000Z",
      },
      { timeZone: "America/Los_Angeles" }
    );
    expect(multiDay?.date).toBe("2026-11-25");
    expect(multiDay?.endDate).toBe("2026-11-27");
    expect(multiDay?.color).toBe("red");

    const patchBody = buildGoogleEventPayload(multiDay!, "America/Los_Angeles", true);
    expect(patchBody.start).toEqual({
      date: "2026-11-25",
      dateTime: null,
      timeZone: null,
    });
    expect(patchBody.end).toEqual({
      date: "2026-11-28",
      dateTime: null,
      timeZone: null,
    });
  });

  test("maps timed events in target IANA timezone and preserves ryosEventId across devices", () => {
    const mapped = mapGoogleEventToRyos(
      {
        id: "evt_timed_1",
        summary: "Design Sync",
        location: "Room 101",
        description: "Agenda notes",
        start: { dateTime: "2026-11-23T18:30:00Z" },
        end: { dateTime: "2026-11-23T19:15:00Z" },
        extendedProperties: {
          private: { ryosEventId: "evt-local-abc" },
        },
        updated: "2026-11-23T18:00:00.000Z",
      },
      { timeZone: "America/Los_Angeles" }
    );

    expect(mapped?.id).toBe("evt-local-abc");
    expect(mapped?.googleEventId).toBe("evt_timed_1");
    expect(mapped?.date).toBe("2026-11-23");
    expect(mapped?.startTime).toBe("10:30");
    expect(mapped?.endTime).toBe("11:15");
    expect(mapped?.location).toBe("Room 101");
    expect(mapped?.notes).toBe("Agenda notes");

    const timedPatch = buildGoogleEventPayload(mapped!, "America/Los_Angeles", true);
    expect(timedPatch.start).toEqual({
      date: null,
      dateTime: "2026-11-23T10:30:00",
      timeZone: "America/Los_Angeles",
    });
    expect(
      buildDeterministicGoogleCalendarEventId("evt_timed_1", "primary")
    ).toBe("gcal_evt_timed_1");
  });
});

describe("Google Contacts mapper", () => {
  test("maps People API person with deterministic ID and ignores default monogram photos", () => {
    const mappedDefaultPhoto = mapGooglePersonToRyosContact({
      resourceName: "people/c987654321",
      etag: "%EgUBAi43PRoEAQIFBw==",
      names: [{ givenName: "Ada", familyName: "Lovelace", displayName: "Ada Lovelace" }],
      emailAddresses: [{ value: "ada@analytical.engine", type: "work" }],
      phoneNumbers: [{ value: "+44 20 7946 0958", type: "mobile" }],
      birthdays: [{ date: { year: 1815, month: 12, day: 10 } }],
      photos: [{ url: "https://lh3.googleusercontent.com/default-avatar", default: true }],
      metadata: {
        sources: [{ type: "CONTACT", updateTime: "2026-11-23T12:00:00.000Z" }],
      },
    });

    expect(mappedDefaultPhoto?.id).toBe("gppl_c987654321");
    expect(mappedDefaultPhoto?.source).toBe("google");
    expect(mappedDefaultPhoto?.picture).toBeNull();
    expect(mappedDefaultPhoto?.birthday).toBe("1815-12-10");
    expect(mappedDefaultPhoto?.emails[0]?.value).toBe("ada@analytical.engine");
    expect(buildDeterministicGoogleContactId("people/c987654321")).toBe(
      "gppl_c987654321"
    );

    const mappedCustomPhoto = mapGooglePersonToRyosContact({
      resourceName: "people/c987654321",
      names: [{ givenName: "Ada", familyName: "Lovelace" }],
      photos: [{ url: "https://lh3.googleusercontent.com/real-photo", default: false }],
      clientData: [{ key: "ryosContactId", value: "contact-orig-1" }],
    });
    expect(mappedCustomPhoto?.id).toBe("contact-orig-1");
    expect(mappedCustomPhoto?.picture).toBe(
      "https://lh3.googleusercontent.com/real-photo"
    );

    const payload = buildGooglePersonPayload(mappedDefaultPhoto!, "%etag1");
    expect(payload.etag).toBe("%etag1");
    expect(payload.clientData).toEqual([
      { key: "ryosContactId", value: "gppl_c987654321" },
    ]);
  });
});

describe("Discard vs. Merge + Cloud Sync v2 compatibility", () => {
  test("Discard >10 local calendar events writes deletionMarkers so sync-v2 emits tombstones instead of suppressing mass-delete", async () => {
    const username = `gcal-discard-${crypto.randomUUID()}`;
    const events: CalendarEvent[] = Array.from({ length: 15 }, (_, idx) => ({
      id: `local-evt-${idx + 1}`,
      title: `Local Event ${idx + 1}`,
      date: "2026-11-23",
      color: "blue",
      calendarId: "home",
      createdAt: 1000 + idx,
      updatedAt: 1000 + idx,
    }));
    useCalendarStore.setState({ events, pendingGoogleDeletions: [] });

    // Pre-populate Cloud Sync v2 shadow with all 15 events so >10 && >=80% mass-delete guard applies.
    const collectedBefore = SYNC_CODECS.calendar.collect({}) as Map<string, unknown>;
    const shadow: Record<string, { t: string; h: string }> = {};
    for (const [k, doc] of collectedBefore) {
      shadow[k] = { t: "01718180000000-0000-init", h: hashDoc(doc) };
    }
    localStorage.setItem(
      `ryos:sync2:state:${username}`,
      JSON.stringify({
        cursor: 1,
        lastHlc: "01718180000000-0000-init",
        shadow,
        dirty: ["calendar"],
        localReconcileRequired: false,
      })
    );
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncFiles: false,
      syncSettings: false,
      syncSongs: false,
      syncVideos: false,
      syncTv: false,
      syncStickies: false,
      syncCalendar: true,
      syncContacts: false,
      syncMaps: false,
      syncBooks: false,
      syncStuff: false,
      syncDictionary: false,
      syncFitness: false,
    });

    const discardedIds = useCalendarStore
      .getState()
      .discardAllLocalEventsForGoogleSync();
    expect(discardedIds).toHaveLength(15);
    expect(useCalendarStore.getState().events).toHaveLength(0);

    const markers = useCloudSyncStore.getState().deletionMarkers.calendarEventIds;
    for (const id of discardedIds) {
      expect(markers[id]).toBeTruthy();
    }

    const pushedOps: Array<{ k: string; del?: boolean; v?: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/sync/v2/ops") && init?.body) {
        const parsed = JSON.parse(String(init.body)) as {
          ops: Array<{ k: string; del?: boolean; v?: unknown }>;
        };
        pushedOps.push(...parsed.ops);
        return new Response(
          JSON.stringify({
            ok: true,
            seq: 2,
            results: parsed.ops.map((op) => ({ k: op.k, accepted: true })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("filesystem.json")) {
        return new Response(JSON.stringify({ root: { name: "", type: "folder", children: {} } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, seq: 2, ops: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(username);
    try {
      await engine.flush();
      const eventDeleteOps = pushedOps.filter(
        (op) => op.k.startsWith("calendar/event:local-evt-") && op.del === true
      );
      expect(eventDeleteOps).toHaveLength(15);
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
    }
  });

  test("Discard >10 local contacts sets suppressDefaultSeed, corroborates sync-v2 mass-delete, and blocks Ryo Lu resurrection", async () => {
    const username = `gppl-discard-${crypto.randomUUID()}`;
    const seeded = seedDefaultContacts([]);
    useContactsStore.setState({
      contacts: seeded,
      suppressDefaultSeed: false,
      myContactId: null,
    });
    for (let i = 1; i <= 14; i += 1) {
      useContactsStore.getState().addContact({
        firstName: `Person${i}`,
        lastName: "Local",
        emails: [{ label: "work", value: `person${i}@example.com` }],
      });
    }
    expect(useContactsStore.getState().contacts).toHaveLength(15);

    const collectedBefore = SYNC_CODECS.contacts.collect({}) as Map<string, unknown>;
    const shadow: Record<string, { t: string; h: string }> = {};
    for (const [k, doc] of collectedBefore) {
      shadow[k] = { t: "01718180000000-0000-init", h: hashDoc(doc) };
    }
    localStorage.setItem(
      `ryos:sync2:state:${username}`,
      JSON.stringify({
        cursor: 1,
        lastHlc: "01718180000000-0000-init",
        shadow,
        dirty: ["contacts"],
        localReconcileRequired: false,
      })
    );
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncFiles: false,
      syncSettings: false,
      syncSongs: false,
      syncVideos: false,
      syncTv: false,
      syncStickies: false,
      syncCalendar: false,
      syncContacts: true,
      syncMaps: false,
      syncBooks: false,
      syncStuff: false,
      syncDictionary: false,
      syncFitness: false,
    });

    const discardedIds = useContactsStore
      .getState()
      .discardAllLocalContactsForGoogleSync();
    expect(discardedIds).toHaveLength(15);
    expect(useContactsStore.getState().contacts).toHaveLength(0);
    expect(useContactsStore.getState().suppressDefaultSeed).toBe(true);

    // Verify contacts/me carries suppressDefaultSeed: true for other Cloud Sync v2 devices.
    const collectedAfter = SYNC_CODECS.contacts.collect({}) as Map<string, unknown>;
    expect(collectedAfter.get("contacts/me")).toEqual({
      myContactId: null,
      suppressDefaultSeed: true,
    });

    const pushedOps: Array<{ k: string; del?: boolean; v?: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/sync/v2/ops") && init?.body) {
        const parsed = JSON.parse(String(init.body)) as {
          ops: Array<{ k: string; del?: boolean; v?: unknown }>;
        };
        pushedOps.push(...parsed.ops);
        return new Response(
          JSON.stringify({
            ok: true,
            seq: 2,
            results: parsed.ops.map((op) => ({ k: op.k, accepted: true })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("filesystem.json")) {
        return new Response(JSON.stringify({ root: { name: "", type: "folder", children: {} } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, seq: 2, ops: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(username);
    try {
      await engine.flush();
      const contactDeleteOps = pushedOps.filter(
        (op) => op.k.startsWith("contacts/contact:") && op.del === true
      );
      expect(contactDeleteOps).toHaveLength(15);
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
    }

    // Simulate remote peer applying contacts/me + tombstones: Ryo Lu must NOT re-seed.
    useContactsStore.setState({
      contacts: seedDefaultContacts([]),
      suppressDefaultSeed: false,
    });
    const ryoId = useContactsStore.getState().contacts[0]!.id;
    await SYNC_CODECS.contacts.apply(
      [
        {
          k: "contacts/me",
          v: { myContactId: null, suppressDefaultSeed: true },
          t: "01718180000001-0000-peer",
        },
        {
          k: `contacts/contact:${ryoId}`,
          del: true,
          t: "01718180000001-0001-peer",
        },
      ],
      {}
    );
    expect(useContactsStore.getState().suppressDefaultSeed).toBe(true);
    expect(useContactsStore.getState().contacts).toHaveLength(0);
  });

  test("Merge flow deduplicates by googleEventId/googleResourceName, preserves unsynced local edits, and prevents ping-pong", async () => {
    useCalendarStore.setState({
      events: [
        {
          id: "local-1",
          title: "Local Edited Title",
          date: "2026-11-23",
          color: "blue",
          calendarId: "home",
          createdAt: 1000,
          updatedAt: 5000, // Newer than googleSyncedUpdatedAt (3000) -> unsynced local edit!
          googleEventId: "g_evt_1",
          googleCalendarId: "primary",
          googleSyncedUpdatedAt: 3000,
        },
        {
          id: "dup-old",
          title: "Duplicate Shadow",
          date: "2026-11-24",
          color: "green",
          calendarId: "home",
          createdAt: 1000,
          updatedAt: 2000,
          googleEventId: "g_evt_2",
          googleCalendarId: "primary",
          googleSyncedUpdatedAt: 2000,
        },
      ],
      pendingGoogleDeletions: [],
    });

    useCalendarStore.getState().applyGoogleCalendarSyncResult({
      fullSync: false,
      pushed: [],
      deletedLocalIds: [],
      remoteUpserts: [
        {
          id: "local-1",
          title: "Stale Remote Title",
          date: "2026-11-23",
          color: "blue",
          calendarId: "home",
          createdAt: 1000,
          updatedAt: 3500,
          googleEventId: "g_evt_1",
          googleCalendarId: "primary",
          googleSyncedUpdatedAt: 3500,
        },
        {
          id: "gcal_g_evt_2",
          title: "Canonical Google Event 2",
          date: "2026-11-24",
          color: "green",
          calendarId: "home",
          createdAt: 1000,
          updatedAt: 4000,
          googleEventId: "g_evt_2",
          googleCalendarId: "primary",
          googleSyncedUpdatedAt: 4000,
        },
      ],
      remoteDeletedGoogleIds: [],
      syncedAt: 6000,
    });
    const eventsAfter = useCalendarStore.getState().events;
    expect(eventsAfter).toHaveLength(2);

    // Unsynced local edit preserved and still marked as needing push:
    const keptLocalEdit = eventsAfter.find((e) => e.id === "local-1")!;
    expect(keptLocalEdit.title).toBe("Local Edited Title");
    expect(calendarEventNeedsGooglePush(keptLocalEdit)).toBe(true);

    // Duplicate googleEventId collapsed to canonical newer item, clean (needsPush === false):
    const canonicalEvt2 = eventsAfter.find((e) => e.googleEventId === "g_evt_2")!;
    expect(canonicalEvt2.title).toBe("Canonical Google Event 2");
    expect(calendarEventNeedsGooglePush(canonicalEvt2)).toBe(false);

    // Re-applying identical clean sync result is a structural no-op (reference preserved -> zero sync-v2 ping-pong):
    useCalendarStore.setState({ events: [canonicalEvt2] });
    const refBefore = useCalendarStore.getState().events;
    useCalendarStore.getState().applyGoogleCalendarSyncResult({
      fullSync: true,
      pushed: [],
      deletedLocalIds: [],
      remoteUpserts: [canonicalEvt2],
      remoteDeletedGoogleIds: [],
      syncedAt: 7000,
    });
    expect(useCalendarStore.getState().events).toBe(refBefore);

    // Contacts repeat sync structural no-op check:
    const syncedContact = mapGooglePersonToRyosContact({
      resourceName: "people/c555",
      etag: "%etag555",
      names: [{ givenName: "Grace", familyName: "Hopper" }],
      metadata: {
        sources: [{ type: "CONTACT", updateTime: "2026-11-23T15:00:00.000Z" }],
      },
    })!;
    expect(contactNeedsGooglePush(syncedContact)).toBe(false);

    useContactsStore.setState({
      contacts: [syncedContact],
      suppressDefaultSeed: true,
    });
    const contactsRefBefore = useContactsStore.getState().contacts;
    useContactsStore.getState().applyGoogleContactsSyncResult({
      fullSync: true,
      pushed: [],
      deletedLocalIds: [],
      remoteUpserts: [syncedContact],
      remoteDeletedResourceNames: [],
      syncedAt: 8000,
    });
    expect(useContactsStore.getState().contacts).toBe(contactsRefBefore);
  });
});
