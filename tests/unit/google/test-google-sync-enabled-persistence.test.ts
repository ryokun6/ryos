import "../../helpers/local-storage-stub";
import { afterEach, describe, expect, test } from "bun:test";
import { FakeRedis } from "../../helpers/fake-redis";
import {
  getLinkedGoogleAccountByUsername,
  patchLinkedGoogleAccount,
  saveLinkedGoogleAccount,
  toPublicGoogleAccount,
} from "../../../api/_utils/google-oauth";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_CONTACTS_SCOPE,
  GOOGLE_SIGNIN_SCOPES,
} from "../../../src/shared/contracts/google";
import { redisKeys } from "../../../src/shared/redisKeys";
import { useChatsStore } from "../../../src/stores/useChatsStore";
import { useGoogleSyncStore } from "../../../src/stores/useGoogleSyncStore";
import { SYNC_CODECS } from "../../../src/sync/codecs";
import {
  refreshGoogleStatus,
  runGoogleCalendarSync,
  runGoogleContactsSync,
} from "../../../src/sync/googleSyncEngine";
import { flushDebouncedPersistWrites } from "../../../src/utils/debouncedPersistStorage";
import { STORAGE_KEYS } from "../../../src/utils/storageKeys";

const ctx = {};
const t = "01718180000000-0000-google-sync";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function linkedAccount(options: {
  hasCalendarScope: boolean;
  hasContactsScope: boolean;
}) {
  const scopes = [...GOOGLE_SIGNIN_SCOPES];
  if (options.hasCalendarScope) scopes.push(GOOGLE_CALENDAR_SCOPE);
  if (options.hasContactsScope) scopes.push(GOOGLE_CONTACTS_SCOPE);
  return {
    configured: true,
    linked: true,
    hasPassword: true,
    account: {
      email: "ryo@gmail.com",
      emailVerified: true,
      name: "Ryo",
      picture: null,
      scopes,
      hasCalendarScope: options.hasCalendarScope,
      hasContactsScope: options.hasContactsScope,
      linkedAt: 1,
      calendarLastSyncedAt: 1_700_000_000_000,
      contactsLastSyncedAt: 1_700_000_000_000,
    },
  };
}

const emptyCalendarSync = {
  fullSync: false,
  pushed: [],
  deletedLocalIds: [],
  remoteUpserts: [],
  remoteDeletedGoogleIds: [],
  syncedAt: 1_700_000_000_000,
};

const emptyContactsSync = {
  fullSync: false,
  pushed: [],
  deletedLocalIds: [],
  remoteUpserts: [],
  remoteDeletedResourceNames: [],
  syncedAt: 1_700_000_000_000,
};

function enableBoth() {
  useChatsStore.setState({ isAuthenticated: true, username: "ryo" });
  useGoogleSyncStore.setState({
    ownerUsername: "ryo",
    calendarSyncEnabled: true,
    contactsSyncEnabled: true,
    calendarInitialSyncCompleted: true,
    contactsInitialSyncCompleted: true,
    linked: true,
    configured: true,
    lastCalendarSyncError: null,
    lastContactsSyncError: null,
    isSyncingCalendar: false,
    isSyncingContacts: false,
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  useChatsStore.setState({ isAuthenticated: false, username: null });
  useGoogleSyncStore.setState({
    ownerUsername: null,
    calendarSyncEnabled: false,
    contactsSyncEnabled: false,
    calendarInitialSyncCompleted: false,
    contactsInitialSyncCompleted: false,
    linked: false,
    account: null,
    configured: false,
    isSyncingCalendar: false,
    isSyncingContacts: false,
    lastCalendarSyncError: null,
    lastContactsSyncError: null,
    isStatusLoading: false,
  });
  flushDebouncedPersistWrites();
});

describe("Google sync enabled preference", () => {
  test("stays enabled across a first sync, a scope-less status refresh, and a second sync", async () => {
    enableBoth();
    let calendarPosts = 0;
    let contactsPosts = 0;
    let statusCache: RequestCache | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.includes("/api/google/status")) {
        statusCache = init?.cache;
        // Stale pre-consent payload: account is linked, sync scopes look absent.
        return jsonResponse(
          linkedAccount({ hasCalendarScope: false, hasContactsScope: false })
        );
      }
      if (url.includes("/api/google/calendar/sync") && method === "POST") {
        calendarPosts += 1;
        return jsonResponse(emptyCalendarSync);
      }
      if (url.includes("/api/google/contacts/sync") && method === "POST") {
        contactsPosts += 1;
        return jsonResponse(emptyContactsSync);
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;

    await runGoogleCalendarSync({ mode: "incremental" });
    await runGoogleContactsSync({ mode: "incremental" });
    expect(calendarPosts).toBe(1);
    expect(contactsPosts).toBe(1);
    expect(statusCache).toBe("no-store");

    const afterFirst = useGoogleSyncStore.getState();
    expect(afterFirst.calendarSyncEnabled).toBe(true);
    expect(afterFirst.contactsSyncEnabled).toBe(true);
    expect(afterFirst.linked).toBe(true);
    expect(afterFirst.account?.email).toBe("ryo@gmail.com");

    await runGoogleCalendarSync({ mode: "incremental" });
    await runGoogleContactsSync({ mode: "incremental" });
    expect(calendarPosts).toBe(2);
    expect(contactsPosts).toBe(2);
    expect(useGoogleSyncStore.getState().calendarSyncEnabled).toBe(true);
    expect(useGoogleSyncStore.getState().contactsSyncEnabled).toBe(true);
  });

  test("a status refresh before the session is restored does not clear the saved toggles", async () => {
    enableBoth();
    useChatsStore.setState({ isAuthenticated: false, username: "ryo" });

    globalThis.fetch = (async () =>
      jsonResponse({
        configured: true,
        linked: false,
        account: null,
      })) as typeof fetch;

    await refreshGoogleStatus();
    const state = useGoogleSyncStore.getState();
    expect(state.calendarSyncEnabled).toBe(true);
    expect(state.contactsSyncEnabled).toBe(true);
    expect(state.calendarInitialSyncCompleted).toBe(true);
    expect(state.contactsInitialSyncCompleted).toBe(true);
    expect(state.configured).toBe(true);
  });

  test("a late status response does not overwrite a newer one", async () => {
    enableBoth();
    let releaseOlder: (response: Response) => void = () => {};
    const olderResponse = new Promise<Response>((resolve) => {
      releaseOlder = resolve;
    });
    let calls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("/api/google/status")) {
        return jsonResponse({ error: "unexpected" }, 404);
      }
      calls += 1;
      if (calls === 1) return olderResponse;
      return jsonResponse(
        linkedAccount({ hasCalendarScope: true, hasContactsScope: true })
      );
    }) as typeof fetch;

    const older = refreshGoogleStatus();
    const newer = refreshGoogleStatus();
    await newer;
    expect(useGoogleSyncStore.getState().linked).toBe(true);
    expect(useGoogleSyncStore.getState().account?.hasCalendarScope).toBe(true);

    releaseOlder(
      jsonResponse({
        configured: true,
        linked: false,
        account: null,
      })
    );
    await older;
    expect(useGoogleSyncStore.getState().linked).toBe(true);
    expect(useGoogleSyncStore.getState().calendarSyncEnabled).toBe(true);
    expect(useGoogleSyncStore.getState().contactsSyncEnabled).toBe(true);
  });

  test("token refresh failure keeps the toggle on and records the error", async () => {
    enableBoth();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/google/calendar/sync") && method === "POST") {
        return jsonResponse(
          {
            error: "Google authorization expired or was revoked. Please reconnect Google.",
            code: "reauth_required",
          },
          401
        );
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;

    await expect(runGoogleCalendarSync({ mode: "incremental" })).rejects.toThrow(
      /reconnect Google/
    );
    const state = useGoogleSyncStore.getState();
    expect(state.calendarSyncEnabled).toBe(true);
    expect(state.lastCalendarSyncError).toMatch(/reconnect Google/);
  });

  test("reload keeps the enabled flags", async () => {
    enableBoth();
    flushDebouncedPersistWrites();
    const saved = localStorage.getItem(STORAGE_KEYS.googleSync);
    expect(saved).toContain('"calendarSyncEnabled":true');
    expect(saved).toContain('"contactsSyncEnabled":true');

    useGoogleSyncStore.setState({
      calendarSyncEnabled: false,
      contactsSyncEnabled: false,
      calendarInitialSyncCompleted: false,
      contactsInitialSyncCompleted: false,
    });
    flushDebouncedPersistWrites();
    localStorage.setItem(STORAGE_KEYS.googleSync, saved!);
    await useGoogleSyncStore.persist.rehydrate();

    const state = useGoogleSyncStore.getState();
    expect(state.calendarSyncEnabled).toBe(true);
    expect(state.contactsSyncEnabled).toBe(true);
    expect(state.calendarInitialSyncCompleted).toBe(true);
    expect(state.contactsInitialSyncCompleted).toBe(true);
  });

  test("cloud sync round-trip keeps the enabled flags", async () => {
    enableBoth();
    const docs = SYNC_CODECS.settings.collect(ctx) as Map<string, unknown>;
    expect(docs.get("settings/google/calendarSyncEnabled")).toBe(true);
    expect(docs.get("settings/google/contactsSyncEnabled")).toBe(true);
    expect(docs.get("settings/google/calendarInitialSyncCompleted")).toBe(true);
    expect(docs.get("settings/google/contactsInitialSyncCompleted")).toBe(true);

    useGoogleSyncStore.setState({
      calendarSyncEnabled: false,
      contactsSyncEnabled: false,
      calendarInitialSyncCompleted: false,
      contactsInitialSyncCompleted: false,
    });

    await SYNC_CODECS.settings.apply(
      [
        { k: "settings/google/calendarSyncEnabled", v: docs.get("settings/google/calendarSyncEnabled"), t },
        { k: "settings/google/contactsSyncEnabled", v: docs.get("settings/google/contactsSyncEnabled"), t },
        {
          k: "settings/google/calendarInitialSyncCompleted",
          v: docs.get("settings/google/calendarInitialSyncCompleted"),
          t,
        },
        {
          k: "settings/google/contactsInitialSyncCompleted",
          v: docs.get("settings/google/contactsInitialSyncCompleted"),
          t,
        },
      ],
      ctx
    );

    const state = useGoogleSyncStore.getState();
    expect(state.calendarSyncEnabled).toBe(true);
    expect(state.contactsSyncEnabled).toBe(true);
    expect(state.calendarInitialSyncCompleted).toBe(true);
    expect(state.contactsInitialSyncCompleted).toBe(true);
  });

  test("cloud sync ignores non-boolean google preference values", async () => {
    enableBoth();
    await SYNC_CODECS.settings.apply(
      [
        { k: "settings/google/calendarSyncEnabled", v: "yes", t },
        { k: "settings/google/contactsSyncEnabled", v: 1, t },
        { k: "settings/google/calendarSyncEnabled", del: true, t },
      ],
      ctx
    );
    const state = useGoogleSyncStore.getState();
    expect(state.calendarSyncEnabled).toBe(true);
    expect(state.contactsSyncEnabled).toBe(true);
  });
});

describe("Google account scope persistence", () => {
  test("a space-delimited scope string still reports calendar permission", async () => {
    const redis = new FakeRedis() as never;
    const username = "scope-string";
    await redis.set(
      redisKeys.integration.googleAccountByUsername(username),
      JSON.stringify({
        username,
        sub: "sub-scope-string",
        email: "scope@example.com",
        emailVerified: true,
        name: null,
        picture: null,
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: null,
        scopes: `${GOOGLE_SIGNIN_SCOPES.join(" ")} ${GOOGLE_CALENDAR_SCOPE}`,
        linkedAt: 10,
        updatedAt: 10,
      })
    );
    await redis.set(
      redisKeys.integration.googleUsernameBySub("sub-scope-string"),
      username
    );

    const loaded = await getLinkedGoogleAccountByUsername(redis, username);
    const pub = toPublicGoogleAccount(loaded!);
    expect(pub.hasCalendarScope).toBe(true);
    expect(pub.hasContactsScope).toBe(false);
  });

  test("a calendar sync patch does not drop contacts scope or the contacts sync token", async () => {
    const redis = new FakeRedis() as never;
    const username = "patch-user";
    await saveLinkedGoogleAccount(redis, {
      username,
      sub: "sub-patch-user",
      email: "patch@example.com",
      emailVerified: true,
      name: null,
      picture: null,
      accessToken: "access-old",
      refreshToken: "refresh",
      expiresAt: null,
      scopes: [...GOOGLE_SIGNIN_SCOPES, GOOGLE_CALENDAR_SCOPE, GOOGLE_CONTACTS_SCOPE],
      linkedAt: 10,
      updatedAt: 10,
      calendarSyncToken: null,
      calendarLastSyncedAt: null,
      contactsSyncToken: "people-sync-token",
      contactsLastSyncedAt: 20,
    });

    await patchLinkedGoogleAccount(redis, username, {
      scopes: [...GOOGLE_SIGNIN_SCOPES, GOOGLE_CALENDAR_SCOPE],
      calendarSyncToken: "calendar-sync-token",
      calendarLastSyncedAt: 30,
      accessToken: "access-new",
    });

    const loaded = await getLinkedGoogleAccountByUsername(redis, username);
    const pub = toPublicGoogleAccount(loaded!);
    expect(pub.hasCalendarScope).toBe(true);
    expect(pub.hasContactsScope).toBe(true);
    expect(loaded?.calendarSyncToken).toBe("calendar-sync-token");
    expect(loaded?.contactsSyncToken).toBe("people-sync-token");
    expect(loaded?.contactsLastSyncedAt).toBe(20);
    expect(loaded?.accessToken).toBe("access-new");
  });
});
