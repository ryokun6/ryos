import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  registerSessionTeardown,
  serializeAuthCookieRequest,
} from "../src/auth/sessionBoundary";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
  writable: true,
});

let serverCookie: string | null = null;
const networkStarts: string[] = [];
const logoutMock = mock(() =>
  serializeAuthCookieRequest(async () => {
    networkStarts.push("logout");
    serverCookie = null;
  })
);
const registerMock = mock(({ username }: { username: string }) =>
  serializeAuthCookieRequest(async () => {
    networkStarts.push(`register:${username}`);
    serverCookie = username;
    return { user: { username } };
  })
);
let loginImpl = async ({ username }: { username: string }) => ({ username });
let sessionImpl = async () => ({
  ok: true as const,
  data: { authenticated: true, username: "restored-user" },
});

mock.module("@/api/auth", () => ({
  checkUserPassword: mock(async () => ({ hasPassword: true })),
  deleteAccount: mock(() =>
    serializeAuthCookieRequest(async () => {
      networkStarts.push("delete");
      serverCookie = null;
      return { success: true };
    })
  ),
  getAuthSession: mock(() =>
    serializeAuthCookieRequest(async () => {
      networkStarts.push("session");
      const result = await sessionImpl();
      if (result.ok && result.data.authenticated && result.data.username) {
        serverCookie = result.data.username;
      }
      return result;
    })
  ),
  loginWithPassword: mock((params: { username: string }) =>
    serializeAuthCookieRequest(async () => {
      networkStarts.push(`login:${params.username}`);
      const result = await loginImpl(params);
      serverCookie = result.username;
      return result;
    })
  ),
  logoutUserSafe: logoutMock,
  registerUser: registerMock,
  setUserPassword: mock(async () => ({ success: true })),
  verifyAuthToken: mock(({ username }: { username: string }) =>
    serializeAuthCookieRequest(async () => {
      networkStarts.push(`token:${username}`);
      serverCookie = username;
      return { valid: true, username };
    })
  ),
}));

const destroyEngineMock = mock(() => {});
mock.module("@/sync/engine", () => ({
  destroyCloudSyncEngine: destroyEngineMock,
}));

const { useAuthStore } = await import("../src/stores/useAuthStore");

async function allowQueuedRequestToStart(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("auth session boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      username: null,
      isAuthenticated: false,
      hasPassword: null,
      isRestoringSession: false,
    });
    logoutMock.mockClear();
    registerMock.mockClear();
    destroyEngineMock.mockClear();
    serverCookie = null;
    networkStarts.length = 0;
    sessionImpl = async () => ({
      ok: true,
      data: { authenticated: true, username: "restored-user" },
    });
    loginImpl = async ({ username }) => ({ username });
  });

  test("continues the cookie queue after a failed request", async () => {
    await expect(
      serializeAuthCookieRequest(() => Promise.reject(new Error("failed")))
    ).rejects.toThrow("failed");
    await expect(
      serializeAuthCookieRequest(() => Promise.resolve("next"))
    ).resolves.toBe("next");
  });

  test("owns registration state and the recovery identity", async () => {
    const result = await useAuthStore.getState().register({
      username: "new-user",
      password: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      username: "new-user",
      isAuthenticated: true,
      hasPassword: true,
    });
    expect(localStorage.getItem("_usr_recovery_key_")).toBe("new-user");
  });

  test("tears down user state before publishing logged-out state", async () => {
    const observed: string[] = [];
    const unregister = registerSessionTeardown(({ username, reason }) => {
      observed.push(`${username}:${reason}`);
      expect(useAuthStore.getState().username).toBe("signed-in-user");
    });
    useAuthStore.setState({
      username: "signed-in-user",
      isAuthenticated: true,
      hasPassword: true,
    });
    localStorage.setItem("_usr_recovery_key_", "signed-in-user");

    await useAuthStore.getState().logout();
    unregister();

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(destroyEngineMock).toHaveBeenCalledTimes(1);
    expect(observed).toEqual(["signed-in-user:logout"]);
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
      hasPassword: null,
    });
    expect(localStorage.getItem("_usr_recovery_key_")).toBeNull();
  });

  test("does not let a stale restore replace an explicit login", async () => {
    let resolveSession:
      | ((value: {
          ok: true;
          data: { authenticated: true; username: string };
        }) => void)
      | undefined;
    sessionImpl = () =>
      new Promise((resolve) => {
        resolveSession = resolve;
      });

    const restore = useAuthStore.getState().restoreSession();
    const login = useAuthStore.getState().login({
      username: "explicit-user",
      password: "password123",
    });
    await allowQueuedRequestToStart();
    expect(networkStarts).toEqual(["session"]);
    resolveSession?.({
      ok: true,
      data: { authenticated: true, username: "stale-cookie-user" },
    });

    await expect(restore).resolves.toEqual({
      ok: false,
      error: "Session restore superseded",
    });
    await expect(login).resolves.toEqual({ ok: true });
    expect(serverCookie).toBe("explicit-user");
    expect(useAuthStore.getState().username).toBe("explicit-user");
  });

  test("serializes concurrent logins so the winning identity matches the cookie", async () => {
    let resolveFirstLogin: ((value: { username: string }) => void) | undefined;
    loginImpl = ({ username }) => {
      if (username !== "first-user") return Promise.resolve({ username });
      return new Promise((resolve) => {
        resolveFirstLogin = resolve;
      });
    };

    const firstLogin = useAuthStore.getState().login({
      username: "first-user",
      password: "password123",
    });
    const secondLogin = useAuthStore.getState().login({
      username: "second-user",
      password: "password123",
    });
    await allowQueuedRequestToStart();

    expect(networkStarts).toEqual(["login:first-user"]);
    resolveFirstLogin?.({ username: "first-user" });

    await expect(firstLogin).resolves.toEqual({
      ok: false,
      error: "Login superseded",
    });
    await expect(secondLogin).resolves.toEqual({ ok: true });
    expect(networkStarts).toEqual([
      "login:first-user",
      "login:second-user",
    ]);
    expect(serverCookie).toBe("second-user");
    expect(useAuthStore.getState()).toMatchObject({
      username: "second-user",
      isAuthenticated: true,
    });
  });

  test("queues logout behind an in-flight login and clears both sessions", async () => {
    let resolveLogin: ((value: { username: string }) => void) | undefined;
    loginImpl =
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        });

    const login = useAuthStore.getState().login({
      username: "late-user",
      password: "password123",
    });
    const logout = useAuthStore.getState().logout();
    await allowQueuedRequestToStart();

    expect(networkStarts).toEqual(["login:late-user"]);
    resolveLogin?.({ username: "late-user" });
    await Promise.all([login, logout]);

    expect(networkStarts).toEqual(["login:late-user", "logout"]);
    expect(serverCookie).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
    });
  });

  test("queues a 401 teardown behind login and clears its new cookie", async () => {
    let resolveLogin: ((value: { username: string }) => void) | undefined;
    loginImpl =
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        });
    serverCookie = "old-user";
    useAuthStore.setState({
      username: "old-user",
      isAuthenticated: true,
      hasPassword: true,
    });

    const login = useAuthStore.getState().login({
      username: "new-user",
      password: "password123",
    });
    const unauthorized = useAuthStore.getState().handleUnauthorized();
    await allowQueuedRequestToStart();

    expect(networkStarts).toEqual(["login:new-user"]);
    resolveLogin?.({ username: "new-user" });
    await Promise.all([login, unauthorized]);

    expect(networkStarts).toEqual(["login:new-user", "logout"]);
    expect(serverCookie).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
    });
  });

  test("checks the auth generation again after session teardown", async () => {
    let releaseLoginTeardown: (() => void) | undefined;
    const unregister = registerSessionTeardown(({ reason }) => {
      if (reason !== "logout") return;
      return new Promise<void>((resolve) => {
        releaseLoginTeardown = resolve;
      });
    });
    useAuthStore.setState({
      username: "old-user",
      isAuthenticated: true,
      hasPassword: true,
    });

    const login = useAuthStore.getState().login({
      username: "new-user",
      password: "password123",
    });
    while (!releaseLoginTeardown) {
      await Promise.resolve();
    }
    await useAuthStore.getState().handleUnauthorized();
    releaseLoginTeardown();

    await expect(login).resolves.toEqual({
      ok: false,
      error: "Login superseded",
    });
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
    });
    unregister();
  });
});
